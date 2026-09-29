"""Orchestrateur "Click, Track & Replace".

  proxy.mp4 + masque cliqué
      │
      ├─ 1. chargement des frames (memmap)            video_io
      ├─ 2. suivi du masque dans toute la vidéo       tracking (SAM2 video / flux optique)
      ├─ 3. mouvement objet + mouvement caméra        tracking
      ├─ 4. effacement de l'objet (+ son ombre)       inpainting (ProPainter / temporel + LaMa)
      ├─ 5. création de l'élément sur la keyframe     generation (diffusion / image fournie)
      ├─ 6. compositing frame par frame               compositing (lumière, ombres, grain...)
      └─ 7. encodage + sauvegarde dans YOUR DAIL CLIPS
"""
from __future__ import annotations

import logging
import shutil
import time
from typing import Callable

import cv2
import numpy as np

from . import maskops
from .compositing import CompositeOptions, Compositor, detect_shadow, shadow_from_original
from .generation import generate_sprite, sprite_from_image
from .inpainting import remove_object
from .restyle import parse_prompt, restyle_frame
from .tracking import estimate_camera, estimate_object_motion, track_masks
from .video_io import VideoWriter, load_frames, save_thumbnail
from .. import storage
from ..config import settings
from ..devices import capabilities, diffusers_available
from ..schemas import ReplaceRequest

log = logging.getLogger(__name__)
Progress = Callable[[float, str], None]

PRESETS: dict[str, dict] = {
    "rapide": dict(max_side=720, candidates=5, steps=20, sam2_fast=True, propainter=False,
                   occlusion=False, remove_shadow=False, crf=20, x264="veryfast"),
    "equilibre": dict(max_side=1280, candidates=8, steps=30, sam2_fast=False, propainter=False,
                      occlusion=True, remove_shadow=True, crf=17, x264="medium"),
    "perfect": dict(max_side=10_000, candidates=14, steps=45, sam2_fast=False, propainter=True,
                    occlusion=True, remove_shadow=True, crf=14, x264="slow"),
}


class Stages:
    """Découpe la progression globale en tranches par étape."""

    def __init__(self, progress: Progress, plan: list[tuple[str, float]]) -> None:
        self._progress = progress
        total = sum(w for _, w in plan)
        self._ranges: dict[str, tuple[float, float]] = {}
        acc = 0.0
        for name, weight in plan:
            self._ranges[name] = (acc / total, (acc + weight) / total)
            acc += weight
        self.timings: dict[str, float] = {}
        self._t0 = time.time()
        self._current: str | None = None

    def __call__(self, name: str) -> Progress:
        now = time.time()
        if self._current:
            self.timings[self._current] = round(now - self._t0, 2)
        self._current, self._t0 = name, now
        lo, hi = self._ranges[name]

        def sub(value: float, label: str) -> None:
            self._progress(lo + (hi - lo) * max(0.0, min(1.0, value)), label)

        sub(0.0, _LABELS.get(name, name))
        return sub

    def finish(self) -> None:
        if self._current:
            self.timings[self._current] = round(time.time() - self._t0, 2)
            self._current = None


_LABELS = {
    "load": "👀 La licorne regarde ta vidéo...",
    "track": "🎯 Suivi de l'objet image par image...",
    "motion": "🧭 Analyse des mouvements (objet + caméra)...",
    "remove": "🧽 Effacement de l'objet d'origine...",
    "generate": "🎨 Création du nouvel élément...",
    "render": "💡 Lumière, ombres, grain : compositing parfait...",
}


def _overlay(frame: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Visualisation rose fluo du suivi (asset mask_track.mp4)."""
    out = frame.copy()
    sel = mask > 0
    pink = np.array([203, 64, 255], np.float32)
    out[sel] = (out[sel] * 0.45 + pink * 0.55).astype(np.uint8)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(out, cnts, -1, (255, 255, 255), 2, cv2.LINE_AA)
    return out


def run_replace(job_id: str, req: ReplaceRequest, progress: Progress) -> dict:
    t_start = time.time()
    opt = req.options
    preset = PRESETS[opt.preset]
    warnings: list[str] = []
    mode = req.mode

    meta = storage.load_video_meta(req.video_id)
    key_mask_proxy, mask_meta = storage.load_mask(req.video_id, req.mask_id)
    proxy = storage.proxy_path(req.video_id)
    work = storage.job_dir(job_id)

    if mode == "replace" and not req.element_id and not diffusers_available():
        warnings.append(
            "Aucun modèle de diffusion installé : bascule en mode « Recolorer » "
            "(installe les dépendances IA pour la vraie génération, voir README)."
        )
        mode = "restyle"
    if mode == "replace" and not req.element_id and not req.prompt.strip():
        raise ValueError("Écris ce qui doit remplacer l'objet (ou importe une image d'élément) !")

    plan = [("load", 1), ("track", 4), ("motion", 1)]
    if mode in ("replace", "erase"):
        plan.append(("remove", 5))
    if mode == "replace":
        plan.append(("generate", 3))
    plan.append(("render", 3))
    stages = Stages(progress, plan)

    # ---- 1. frames ------------------------------------------------------------------
    p = stages("load")
    pw_src, ph_src = meta["width"], meta["height"]
    scale = min(1.0, min(settings.max_process_side, preset["max_side"]) / max(pw_src, ph_src))
    pw, ph = max(2, int(pw_src * scale) // 2 * 2), max(2, int(ph_src * scale) // 2 * 2)
    frames = load_frames(proxy, work / "frames.npy", (pw, ph), lambda v: p(v, _LABELS["load"]),
                         expected=meta.get("frame_count") or None)
    n = len(frames)
    key = int(np.clip(mask_meta["frame_index"], 0, n - 1))
    key_mask = cv2.resize(key_mask_proxy, (pw, ph), interpolation=cv2.INTER_LINEAR)
    key_mask = maskops.smooth_mask((key_mask > 127).astype(np.uint8) * 255, 1)
    if not key_mask.any():
        raise ValueError("Le masque sélectionné est vide : reclique sur l'objet.")

    # ---- 2. suivi ---------------------------------------------------------------------
    p = stages("track")
    model_id = settings.sam2_model_fast if preset["sam2_fast"] else settings.sam2_model
    masks, track_engine = track_masks(frames, key, key_mask, work, p, model_id)
    masks[key] = key_mask

    # ---- 3. mouvements ---------------------------------------------------------------
    p = stages("motion")
    transforms = G = None
    if mode in ("replace", "erase"):
        transforms = estimate_object_motion(frames, masks, key, lambda v, l: p(0.6 * v, l))
        G = estimate_camera(frames, masks, key, lambda v, l: p(0.6 + 0.4 * v, l))

    # ---- 4. effacement ---------------------------------------------------------------
    clean = None
    remove_engine = None
    shadow_spec = None
    if mode in ("replace", "erase"):
        p = stages("remove")
        _, shadow_spec = detect_shadow(frames[key], masks[key])
        if mode == "erase":  # effacer un objet sans son ombre = fantôme garanti
            remove_shadow = opt.remove_original_shadow is not False
        elif opt.shadows == "keep":  # on garde l'ombre d'origine telle quelle
            remove_shadow = False
        elif opt.shadows == "auto" and shadow_spec is not None:  # elle sera re-projetée
            remove_shadow = True
        else:
            remove_shadow = preset["remove_shadow"] if opt.remove_original_shadow is None \
                else opt.remove_original_shadow
        holes = np.lib.format.open_memmap(work / "holes.npy", mode="w+", dtype=np.uint8, shape=masks.shape)
        for t in range(n):
            m = masks[t]
            bb = maskops.bbox(m)
            if bb is None:
                holes[t] = 0
                continue
            size = max(bb[2] - bb[0], bb[3] - bb[1])
            # marge : réglage utilisateur (en px du proxy) ou auto (3 % de la taille de l'objet)
            expand = int(round(opt.mask_expand * scale)) if opt.mask_expand is not None \
                else max(3, int(0.03 * size) + 2)
            hole = maskops.dilate(m, expand)
            if remove_shadow and shadow_spec is not None:
                # détection frame par frame ∪ ombre de la keyframe suivant l'objet (robuste)
                sh, _ = detect_shadow(frames[t], m)
                carried = cv2.warpAffine(shadow_spec.mask, transforms[t], (pw, ph), flags=cv2.INTER_NEAREST)
                hole = cv2.bitwise_or(hole, maskops.dilate(cv2.bitwise_or(sh, carried), 3))
            holes[t] = hole
            if t % 10 == 0:
                p(0.05 * t / n, "Préparation des zones à effacer")
        use_pp = preset["propainter"] if opt.use_propainter is None else opt.use_propainter
        clean, remove_engine = remove_object(
            frames, holes, G, key, work, lambda v, l: p(0.05 + 0.95 * v, l),
            n_candidates=preset["candidates"], use_propainter=use_pp,
        )

    # ---- 5. élément ------------------------------------------------------------------
    sprite = None
    gen_engine = None
    if mode == "replace":
        p = stages("generate")
        if req.element_id:
            element = cv2.imread(str(storage.element_path(req.element_id)), cv2.IMREAD_UNCHANGED)
            if element is None:
                raise ValueError("Image d'élément introuvable, réimporte-la.")
            p(0.3, "🖼️ Placement et harmonisation de ton élément")
            sprite = sprite_from_image(element, masks[key], clean[key], opt.element_scale)
        else:
            try:
                sprite = generate_sprite(
                    clean[key], masks[key], req.prompt, req.negative_prompt, p,
                    steps=opt.steps or preset["steps"], guidance=opt.guidance, seed=opt.seed,
                    shape_mode=opt.shape_mode,
                )
            except Exception as exc:  # noqa: BLE001 - modèle non téléchargeable, mémoire...
                log.exception("Génération IA impossible")
                warnings.append(f"Génération IA impossible ({exc}) : bascule en mode « Recolorer ».")
                mode = "restyle"
    if sprite is not None:
        gen_engine = sprite.engine
        if opt.shadows == "auto" and shadow_spec is not None:
            # la vraie ombre d'origine (forme/douceur/couleur exactes), re-ciblée sur l'élément
            layer = shadow_from_original(frames[key], clean[key], shadow_spec, masks[key], sprite)
            if layer is not None:
                sprite.shadow, sprite.shadow_origin = layer

    # ---- 6+7. rendu + encodage ---------------------------------------------------------
    p = stages("render")
    label = req.prompt.strip() or {"erase": "effacement", "restyle": "recolor", "replace": "element"}[mode]
    entry_id, out_dir = storage.new_clip_entry(label)
    fps = float(meta["fps"])
    occlusion = preset["occlusion"] if opt.occlusion is None else opt.occlusion
    comp_opts = CompositeOptions(
        relight=opt.relight, shadows=opt.shadows, grain=opt.grain, motion_blur=opt.motion_blur,
        occlusion=occlusion, light_wrap=opt.light_wrap, deformable=opt.motion_model == "deformable",
    )
    compositor = Compositor(sprite, frames, clean, masks, transforms, key, comp_opts) \
        if mode == "replace" else None
    style = parse_prompt(req.prompt) if mode == "restyle" else None

    writers: dict[str, VideoWriter] = {}
    try:
        writers["final"] = VideoWriter(out_dir / "final.mp4", pw, ph, fps, audio_from=proxy,
                                       crf=preset["crf"], preset=preset["x264"])
        writers["mask"] = VideoWriter(out_dir / "mask_track.mp4", pw, ph, fps, crf=23, preset="veryfast")
        if mode == "replace":
            writers["clean"] = VideoWriter(out_dir / "clean_plate.mp4", pw, ph, fps, crf=18, preset="veryfast")
        key_out = None
        prev_soft = None
        for t in range(n):
            if mode == "replace":
                out = compositor.render(t)
                writers["clean"].write(clean[t])
            elif mode == "erase":
                out = clean[t]
            else:  # restyle : masque doux lissé dans le temps (anti-scintillement des bords)
                soft = maskops.feather(masks[t], 1.2)
                nxt = maskops.feather(masks[t + 1], 1.2) if t + 1 < n else soft
                prv = prev_soft if prev_soft is not None else soft
                out = restyle_frame(frames[t], 0.25 * prv + 0.5 * soft + 0.25 * nxt, style, t, n)
                prev_soft = soft
            writers["final"].write(out)
            writers["mask"].write(_overlay(frames[t], masks[t]))
            if t == key:
                key_out = out
            if t % 5 == 0:
                p(t / n, f"💡 Compositing frame {t + 1}/{n}")
        for w in writers.values():
            w.close()
    except Exception:
        for w in writers.values():
            w.abort()
        shutil.rmtree(out_dir, ignore_errors=True)
        raise

    save_thumbnail(key_out if key_out is not None else frames[key], out_dir / "preview.jpg")
    shutil.copy2(proxy, out_dir / "source.mp4")
    if sprite is not None:
        cv2.imwrite(str(out_dir / "element.png"), sprite.rgba_u8())
    stages.finish()

    recipe = {
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "mode": mode,
        "requested_mode": req.mode,
        "prompt": req.prompt,
        "negative_prompt": req.negative_prompt,
        "style": style.label if style else None,
        "source_name": meta.get("original_name"),
        "video": {"width": pw, "height": ph, "fps": fps, "frames": n, "key_frame": key},
        "options": opt.model_dump(),
        "preset_values": preset,
        "engines": {
            "segmentation": mask_meta.get("engine"),
            "tracking": track_engine,
            "removal": remove_engine,
            "generation": gen_engine,
            "seed": sprite.seed if sprite is not None else None,
            "shadow_copied_from_original": bool(
                sprite is not None and shadow_spec is not None and opt.shadows == "auto"
                and sprite.shadow is not None),
            "original_shadow_detected": shadow_spec is not None,
        },
        "capabilities": capabilities(),
        "timings_s": {**stages.timings, "total": round(time.time() - t_start, 2)},
        "warnings": warnings,
        "original_shadow": {"darkening_bgr": shadow_spec.ratio.round(3).tolist(), "area_px": shadow_spec.area}
        if shadow_spec else None,
    }
    storage.write_recipe(entry_id, recipe)

    del frames, masks, clean
    if not settings.keep_workdir:
        shutil.rmtree(work, ignore_errors=True)
    return storage.describe_clip(entry_id)
