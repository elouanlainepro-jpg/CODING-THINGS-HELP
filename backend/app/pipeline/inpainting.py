"""Effacement de l'objet d'origine ("clean plate") = video inpainting.

Moteurs, du plus lourd au plus léger :
1. ProPainter (ICCV 2023, flux + transformer) — externe, activé via PROPAINTER_DIR.
2. Reconstruction temporelle intégrée : chaque pixel caché est récupéré dans les autres
   frames où le décor est visible (recalage par homographies caméra + compensation
   d'exposition + médiane robuste). Les zones JAMAIS visibles sont reconstruites une seule
   fois sur la keyframe (LaMa si dispo, sinon OpenCV) puis propagées par la caméra :
   => aucun scintillement.
"""
from __future__ import annotations

import logging
import subprocess
import sys
import threading
import time
import warnings
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

from . import maskops, models
from ..config import settings
from ..devices import get_device, propainter_available

log = logging.getLogger(__name__)
Progress = Callable[[float, str], None]


# --------------------------------------------------------------------------------------
# Inpainting d'une image (zones jamais visibles)
# --------------------------------------------------------------------------------------
def inpaint_image(image: np.ndarray, hole: np.ndarray) -> np.ndarray:
    """Remplit `hole` dans `image` (BGR). LaMa > OpenCV Telea multi-échelle."""
    bb = maskops.bbox(hole)
    if bb is None:
        return image.copy()
    h, w = image.shape[:2]
    size = max(bb[2] - bb[0], bb[3] - bb[1])
    x0, y0, x1, y1 = maskops.expand_box(bb, max(48, size), w, h)
    crop, hc = image[y0:y1, x0:x1], (hole[y0:y1, x0:x1] > 0).astype(np.uint8) * 255
    scale = min(1.0, 1024 / max(crop.shape[:2]))
    small = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1 else crop
    small_m = cv2.resize(hc, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_NEAREST) if scale < 1 else hc
    small_m = maskops.dilate(small_m, 3)

    filled = None
    lama = models.lama_model()
    if lama is not None:
        try:
            filled = _run_lama(lama, small, small_m)
        except Exception:  # noqa: BLE001
            log.exception("LaMa a échoué, repli OpenCV")
    if filled is None:
        filled = _telea_multiscale(small, small_m)
    if scale < 1:
        filled = cv2.resize(filled, (crop.shape[1], crop.shape[0]), interpolation=cv2.INTER_CUBIC)
    alpha = maskops.feather(maskops.dilate(hc, 3), 2.0)
    alpha[hc > 0] = 1.0
    out = image.copy()
    region = out[y0:y1, x0:x1].astype(np.float32)
    out[y0:y1, x0:x1] = np.clip(region * (1 - alpha[..., None]) + filled * alpha[..., None], 0, 255).astype(np.uint8)
    return out


def _run_lama(model, image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    import torch

    h, w = image.shape[:2]
    ph, pw = (8 - h % 8) % 8, (8 - w % 8) % 8
    img = cv2.copyMakeBorder(image, 0, ph, 0, pw, cv2.BORDER_REFLECT)
    m = cv2.copyMakeBorder(mask, 0, ph, 0, pw, cv2.BORDER_CONSTANT, value=0)
    t_img = torch.from_numpy(cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0)
    t_img = t_img.permute(2, 0, 1)[None]
    t_m = torch.from_numpy((m > 0).astype(np.float32))[None, None]
    with torch.inference_mode():
        out = model(t_img, t_m)[0].permute(1, 2, 0).cpu().numpy()
    out = np.clip(out * 255, 0, 255).astype(np.uint8)[:h, :w]
    return cv2.cvtColor(out, cv2.COLOR_RGB2BGR).astype(np.float32)


def _telea_multiscale(image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Telea sur une pyramide : basse fréquence depuis l'échelle réduite, détails à pleine
    échelle, puis un léger grain pour éviter l'aspect "plastique"."""
    h, w = image.shape[:2]
    low = cv2.resize(image, (max(8, w // 4), max(8, h // 4)), interpolation=cv2.INTER_AREA)
    low_m = cv2.resize(mask, (low.shape[1], low.shape[0]), interpolation=cv2.INTER_NEAREST)
    low_f = cv2.inpaint(low, maskops.dilate(low_m, 1), 5, cv2.INPAINT_TELEA)
    base = image.copy()
    up = cv2.resize(low_f, (w, h), interpolation=cv2.INTER_CUBIC)
    base[mask > 0] = up[mask > 0]
    fine = cv2.inpaint(base, maskops.erode(mask, 4), 3, cv2.INPAINT_TELEA).astype(np.float32)
    sigma = maskops.estimate_noise_sigma(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), cv2.bitwise_not(mask))
    if sigma > 0.3:
        noise = np.random.default_rng(0).normal(0, sigma, (h, w, 1)).astype(np.float32)
        fine[mask > 0] += noise[mask > 0]
    return np.clip(fine, 0, 255)


# --------------------------------------------------------------------------------------
# Reconstruction temporelle intégrée
# --------------------------------------------------------------------------------------
def _candidates(t: int, n: int, k: int, key_idx: int) -> list[int]:
    if n <= 1:
        return []
    offsets = np.unique(np.round(np.geomspace(1, max(2, n - 1), max(2, k // 2))).astype(int))
    cands: list[int] = []
    for o in offsets:
        for j in (t - o, t + o):
            if 0 <= j < n and j != t and j not in cands:
                cands.append(j)
    if key_idx != t and key_idx not in cands:
        cands.append(key_idx)
    cands.sort(key=lambda j: abs(j - t))
    return cands


def _temporal_fill(
    frames: np.ndarray,
    holes: np.ndarray,
    G: np.ndarray,
    t: int,
    cands: list[int],
    box: tuple[int, int, int, int],
) -> tuple[np.ndarray, np.ndarray]:
    """Renvoie (fill float32 (bh,bw,3) avec NaN, has_fill bool) dans la boîte `box` de t."""
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    target = frames[t][y0:y1, x0:x1].astype(np.float32)
    hole_c = holes[t][y0:y1, x0:x1] > 0
    ring = (maskops.dilate(holes[t][y0:y1, x0:x1], 8) > 0) & ~hole_c
    need = maskops.dilate(holes[t][y0:y1, x0:x1], 3) > 0
    sel = np.nonzero(need)
    G_t_inv = np.linalg.inv(G[t])
    shift = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]], dtype=np.float64)
    values = []
    for j in cands:
        H = shift @ G_t_inv @ G[j]
        warped = cv2.warpPerspective(frames[j], H, (bw, bh), flags=cv2.INTER_LINEAR,
                                     borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        wm = cv2.warpPerspective(holes[j], H, (bw, bh), flags=cv2.INTER_NEAREST,
                                 borderMode=cv2.BORDER_CONSTANT, borderValue=255)
        valid = wm == 0
        if not valid[sel].any():
            continue
        warped = warped.astype(np.float32)
        # compensation d'exposition (auto-exposition caméra, nuages...) mesurée sur l'anneau
        ring_ok = ring & valid
        if ring_ok.sum() > 60:
            gain = target[ring_ok].mean(0) / np.maximum(warped[ring_ok].mean(0), 1.0)
            warped *= np.clip(gain, 0.75, 1.33)
        v = warped[sel]
        v[~valid[sel]] = np.nan
        values.append(v)
    fill = np.full((bh, bw, 3), np.nan, np.float32)
    if not values:
        return fill, np.zeros((bh, bw), bool)
    stack = np.stack(values)  # (K, P, 3), trié du plus proche au plus lointain dans le temps
    valid = ~np.isnan(stack[..., 0])
    has = valid.any(0)
    first = np.argmax(valid, axis=0)
    nearest = np.take_along_axis(stack, first[None, :, None].repeat(3, axis=2), axis=0)[0]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        med = np.nanmedian(stack, axis=0)
        # le plus proche dans le temps = le plus net ; la médiane = robuste aux passants.
        inconsistent = np.nanmean(np.abs(nearest - med), axis=1) > 18
    choice = np.where(inconsistent[:, None], med, nearest)
    fill[sel] = choice
    has_full = np.zeros((bh, bw), bool)
    has_full[sel] = has
    return fill, has_full


def remove_object(
    frames: np.ndarray,
    holes: np.ndarray,
    G: np.ndarray,
    key_idx: int,
    workdir: Path,
    progress: Progress,
    n_candidates: int = 8,
    use_propainter: bool = False,
) -> tuple[np.ndarray, str]:
    """Renvoie (clean memmap (N,H,W,3), moteur)."""
    n, h, w = frames.shape[:3]
    clean = np.lib.format.open_memmap(workdir / "clean.npy", mode="w+", dtype=np.uint8, shape=frames.shape)

    if use_propainter and propainter_available():
        try:
            if _run_propainter(frames, holes, clean, workdir, progress):
                return clean, "propainter"
        except Exception:  # noqa: BLE001
            log.exception("ProPainter a échoué -> reconstruction temporelle intégrée")

    # 1) keyframe : beaucoup de candidats + LaMa pour le décor jamais visible
    progress(0.02, "Reconstruction du décor (keyframe)")
    key_box = _hole_box(holes[key_idx], w, h)
    key_clean = frames[key_idx].copy()
    if key_box is not None:
        cands = _candidates(key_idx, n, n_candidates * 2, key_idx)
        fill, has = _temporal_fill(frames, holes, G, key_idx, cands, key_box)
        key_clean = _blend(key_clean, fill, has, holes[key_idx], key_box)
        residual = np.zeros((h, w), np.uint8)
        x0, y0, x1, y1 = key_box
        residual[y0:y1, x0:x1] = ((holes[key_idx][y0:y1, x0:x1] > 0) & ~has).astype(np.uint8) * 255
        if residual.any():
            progress(0.06, "Invention du décor jamais visible (LaMa)")
            key_clean = inpaint_image(key_clean, residual)
    clean[key_idx] = key_clean

    # 2) toutes les autres frames
    for i, t in enumerate(sorted(range(n), key=lambda t: abs(t - key_idx))):
        if t == key_idx:
            continue
        box = _hole_box(holes[t], w, h)
        if box is None:
            clean[t] = frames[t]
            continue
        fill, has = _temporal_fill(frames, holes, G, t, _candidates(t, n, n_candidates, key_idx), box)
        x0, y0, x1, y1 = box
        missing = (holes[t][y0:y1, x0:x1] > 0) & ~has
        if missing.any():
            # décor jamais visible -> on reprend la keyframe reconstruite, recalée par la caméra
            H = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1.0]]) @ np.linalg.inv(G[t])
            from_key = cv2.warpPerspective(key_clean, H, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR,
                                           borderMode=cv2.BORDER_REFLECT).astype(np.float32)
            fill[missing] = from_key[missing]
            has = has | missing
        clean[t] = _blend(frames[t].copy(), fill, has, holes[t], box)
        if i % 4 == 0:
            progress(0.1 + 0.9 * i / n, "Effacement de l'objet d'origine")
    return clean, "temporal"


def _hole_box(hole: np.ndarray, w: int, h: int):
    bb = maskops.bbox(hole)
    if bb is None:
        return None
    return maskops.expand_box(bb, 16, w, h)


def _blend(frame: np.ndarray, fill: np.ndarray, has: np.ndarray, hole: np.ndarray, box) -> np.ndarray:
    x0, y0, x1, y1 = box
    hc = hole[y0:y1, x0:x1]
    alpha = maskops.feather(maskops.dilate(hc, 2), 1.5)
    alpha[hc > 0] = 1.0
    alpha[~has] = 0.0
    region = frame[y0:y1, x0:x1].astype(np.float32)
    f = np.where(np.isnan(fill), region, fill)
    frame[y0:y1, x0:x1] = np.clip(region * (1 - alpha[..., None]) + f * alpha[..., None], 0, 255).astype(np.uint8)
    return frame


# --------------------------------------------------------------------------------------
# ProPainter (optionnel, externe)
# --------------------------------------------------------------------------------------
def _run_propainter(frames, holes, clean, workdir: Path, progress: Progress) -> bool:
    root = settings.propainter_dir
    assert root is not None
    n, h, w = frames.shape[:3]
    scale = min(1.0, settings.propainter_max_side / max(h, w))
    pw, ph = max(8, int(w * scale) // 8 * 8), max(8, int(h * scale) // 8 * 8)
    base = workdir / "propainter"
    in_dir, mask_dir, out_dir = base / "clip", base / "clip_masks", base / "out"
    for d in (in_dir, mask_dir, out_dir):
        d.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        cv2.imwrite(str(in_dir / f"{i:05d}.png"), cv2.resize(frames[i], (pw, ph), interpolation=cv2.INTER_AREA))
        cv2.imwrite(str(mask_dir / f"{i:05d}.png"), cv2.resize(holes[i], (pw, ph), interpolation=cv2.INTER_NEAREST))
    python = settings.propainter_python or sys.executable
    cmd = [
        python, "inference_propainter.py",
        "--video", str(in_dir), "--mask", str(mask_dir), "--output", str(out_dir),
        "--width", str(pw), "--height", str(ph),
        "--save_frames", "--mask_dilation", "2", "--subvideo_length", "60",
    ]
    if get_device() == "cuda":
        cmd.append("--fp16")
    log.info("ProPainter : %s", " ".join(cmd))

    stop = threading.Event()

    def heartbeat():
        start = time.time()
        while not stop.wait(2.0):
            elapsed = time.time() - start
            progress(min(0.95, elapsed / (elapsed + 60.0)), f"ProPainter peint le décor ({int(elapsed)}s)")

    threading.Thread(target=heartbeat, daemon=True).start()
    try:
        with open(base / "propainter.log", "wb") as logf:
            proc = subprocess.run(cmd, cwd=str(root), stdout=logf, stderr=subprocess.STDOUT)
    finally:
        stop.set()
    if proc.returncode != 0:
        log.error("ProPainter code %s (voir %s)", proc.returncode, base / "propainter.log")
        return False
    outs = sorted(out_dir.rglob("frames/*.png"))
    if len(outs) != n:
        log.error("ProPainter : %d frames produites au lieu de %d", len(outs), n)
        return False
    for i, path in enumerate(outs):
        pp = cv2.resize(cv2.imread(str(path)), (w, h), interpolation=cv2.INTER_CUBIC).astype(np.float32)
        hole = maskops.dilate(holes[i], 2)
        alpha = maskops.feather(hole, 1.5)
        alpha[holes[i] > 0] = 1.0
        # on ne garde ProPainter QUE dans le trou : le reste reste en pleine résolution
        clean[i] = np.clip(frames[i] * (1 - alpha[..., None]) + pp * alpha[..., None], 0, 255).astype(np.uint8)
    return True
