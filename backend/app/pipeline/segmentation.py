"""Segmentation au clic : Segment Anything 2 (SAM2) si installé, sinon GrabCut guidé (OpenCV)."""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass

import cv2
import numpy as np

from . import maskops, models

log = logging.getLogger(__name__)


@dataclass
class Point:
    x: float  # pixels, dans l'image passée au segmenteur
    y: float
    label: int  # 1 = inclure, 0 = exclure


@dataclass
class Segmentation:
    mask: np.ndarray  # uint8 0/255, taille de l'image
    score: float
    engine: str


class Sam2Segmenter:
    engine = "sam2"

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._image_key: object = None

    def segment(
        self,
        image_bgr: np.ndarray,
        points: list[Point],
        box: tuple[int, int, int, int] | None = None,
        cache_key: object = None,
    ) -> Segmentation:
        import torch

        predictor = models.sam2_image_predictor()
        with self._lock, torch.inference_mode():
            if cache_key is None or cache_key != self._image_key:
                predictor.set_image(cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB))
                self._image_key = cache_key
            coords = np.array([[p.x, p.y] for p in points], dtype=np.float32) if points else None
            labels = np.array([p.label for p in points], dtype=np.int32) if points else None
            # Un seul clic = ambigu (roue ? voiture ?) -> 3 hypothèses, on garde la meilleure.
            multi = len(points) <= 1 and box is None
            masks, scores, _ = predictor.predict(
                point_coords=coords,
                point_labels=labels,
                box=np.array(box, dtype=np.float32) if box is not None else None,
                multimask_output=multi,
            )
        best = int(np.argmax(scores))
        mask = (np.asarray(masks[best]) > 0).astype(np.uint8) * 255
        return Segmentation(mask=mask, score=float(scores[best]), engine=self.engine)


class ClassicSegmenter:
    """Repli sans IA : région "flood fill" autour du clic -> initialisation GrabCut."""

    engine = "grabcut"

    def segment(
        self,
        image_bgr: np.ndarray,
        points: list[Point],
        box: tuple[int, int, int, int] | None = None,
        cache_key: object = None,
    ) -> Segmentation:
        h, w = image_bgr.shape[:2]
        scale = min(1.0, 900 / max(h, w))
        small = cv2.resize(image_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        sh, sw = small.shape[:2]
        pos = [(int(p.x * scale), int(p.y * scale)) for p in points if p.label == 1]
        neg = [(int(p.x * scale), int(p.y * scale)) for p in points if p.label == 0]
        if not pos and box is None:
            return Segmentation(np.zeros((h, w), np.uint8), 0.0, self.engine)

        smooth = cv2.pyrMeanShiftFiltering(small, sp=8, sr=18)

        def flood(points):
            region = np.zeros((sh + 2, sw + 2), np.uint8)
            for x, y in points:
                x, y = min(max(x, 0), sw - 1), min(max(y, 0), sh - 1)
                cv2.floodFill(
                    smooth.copy(), region, (x, y), (0, 0, 0), (18, 18, 18), (18, 18, 18),
                    4 | cv2.FLOODFILL_MASK_ONLY | cv2.FLOODFILL_FIXED_RANGE | (255 << 8),
                )
            return region[1:-1, 1:-1]

        # zone de couleur homogène autour du clic = "certainement l'objet"
        seed = flood(pos)
        if box is not None:
            x0, y0, x1, y1 = (int(v * scale) for v in box)
        else:
            bb = maskops.bbox(seed) or (pos[0][0] - 5, pos[0][1] - 5, pos[0][0] + 5, pos[0][1] + 5)
            size = max(bb[2] - bb[0], bb[3] - bb[1])
            x0, y0, x1, y1 = maskops.expand_box(bb, max(int(0.6 * size), int(0.1 * max(sw, sh))), sw, sh)

        # dans la boîte : "probablement l'objet" si la couleur ressemble à la zone cliquée
        lab = cv2.cvtColor(smooth, cv2.COLOR_BGR2LAB).astype(np.float32)
        ref = lab[seed > 0].mean(0) if seed.any() else lab[pos[0][1], pos[0][0]]
        similar = np.linalg.norm(lab - ref, axis=2) < 30
        inside = np.zeros((sh, sw), bool)
        inside[y0:y1, x0:x1] = True
        gc = np.full((sh, sw), cv2.GC_BGD, np.uint8)
        gc[inside] = cv2.GC_PR_BGD
        gc[inside & similar] = cv2.GC_PR_FGD
        core = maskops.erode(seed, 1)
        gc[(core if core.any() else seed) > 0] = cv2.GC_FGD
        r = max(3, int(0.012 * max(sw, sh)))
        for x, y in pos:
            cv2.circle(gc, (x, y), r, cv2.GC_FGD, -1)
        if neg:  # clics "exclure" : la zone de couleur cliquée est du décor
            gc[maskops.erode(flood(neg), 1) > 0] = cv2.GC_BGD
            for x, y in neg:
                cv2.circle(gc, (x, y), r, cv2.GC_BGD, -1)
        bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
        try:
            cv2.grabCut(small, gc, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
            fg = np.isin(gc, (cv2.GC_FGD, cv2.GC_PR_FGD)).astype(np.uint8) * 255
        except cv2.error:
            fg = seed
        fg = maskops.keep_components(fg, pos)
        fg = maskops.fill_holes(fg)
        fg = maskops.smooth_mask(fg, 2)
        # garde-fou : clic sur un décor texturé -> GrabCut "avale" l'image. On se replie sur
        # la zone homogène cliquée (l'utilisateur affinera avec des clics exclure).
        if (fg > 0).mean() > 0.5 and seed.any() and (seed > 0).mean() < 0.5:
            fg = maskops.smooth_mask(maskops.fill_holes(maskops.keep_components(seed, pos)), 2)
        mask = cv2.resize(fg, (w, h), interpolation=cv2.INTER_LINEAR)
        mask = (mask > 127).astype(np.uint8) * 255
        area = (mask > 0).mean()
        score = float(np.clip(1.0 - abs(area - 0.08) * 2, 0.2, 0.9))
        return Segmentation(mask=mask, score=score, engine=self.engine)


_segmenter = None
_seg_lock = threading.Lock()


def get_segmenter():
    global _segmenter
    with _seg_lock:
        if _segmenter is None:
            from ..devices import sam2_available

            _segmenter = Sam2Segmenter() if sam2_available() else ClassicSegmenter()
        return _segmenter


def segment(
    image_bgr: np.ndarray,
    points: list[Point],
    box: tuple[int, int, int, int] | None = None,
    cache_key: object = None,
) -> Segmentation:
    seg = get_segmenter()
    try:
        result = seg.segment(image_bgr, points, box, cache_key)
    except Exception:  # noqa: BLE001 - un modèle IA qui plante ne doit pas bloquer l'utilisateur
        if isinstance(seg, ClassicSegmenter):
            raise
        log.exception("SAM2 a échoué, repli GrabCut")
        result = ClassicSegmenter().segment(image_bgr, points, box, cache_key)
    seeds = [(int(p.x), int(p.y)) for p in points if p.label == 1]
    mask = maskops.keep_components(result.mask, seeds, min_ratio=0.15)
    mask = maskops.fill_holes(mask)
    result.mask = mask
    return result
