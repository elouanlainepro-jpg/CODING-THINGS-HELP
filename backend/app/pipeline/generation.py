"""Création de l'élément de remplacement ("sprite") sur la keyframe.

Deux sources :
- Génération IA : diffusion "inpainting" (SDXL par défaut) directement DANS la scène
  (sur le décor déjà nettoyé), donc avec la bonne perspective, la bonne lumière et la bonne
  colorimétrie. L'élément est ensuite détouré (SAM2 ou matte par différence) ; l'ombre qu'a
  éventuellement peinte le modèle est extraite comme une carte multiplicative séparée.
- Image fournie par l'utilisateur (PNG détouré ou non) : placée, harmonisée (balance des
  blancs, exposition, netteté) puis traitée exactement comme un élément généré.
"""
from __future__ import annotations

import logging
import random
from dataclasses import dataclass
from typing import Callable

import cv2
import numpy as np

from . import maskops, models
from .segmentation import Point, Sam2Segmenter
from ..devices import sam2_available

log = logging.getLogger(__name__)
Progress = Callable[[float, str], None]

REALISM_SUFFIX = (
    "photorealistic, physically accurate lighting matching the scene, natural shadows, "
    "correct perspective, high detail, sharp focus, shot on the same camera"
)
REALISM_NEGATIVE = (
    "cartoon, illustration, painting, 3d render, cgi, blurry, deformed, distorted, "
    "disfigured, low quality, jpeg artifacts, text, watermark, logo, frame, border, "
    "duplicate, floating, cut off"
)


@dataclass
class Sprite:
    """Élément à incruster, exprimé dans les coordonnées de la keyframe."""

    rgb: np.ndarray  # float32 (h, w, 3) BGR 0..255, couleur "droite" (non prémultipliée)
    alpha: np.ndarray  # float32 (h, w) 0..1
    x0: int
    y0: int
    shadow: np.ndarray | None = None  # float32 (h, w, 3) assombrissement 0..1 du décor
    shadow_origin: tuple[int, int] | None = None  # coin haut-gauche de `shadow` (keyframe)
    engine: str = ""
    seed: int | None = None

    @property
    def box(self) -> tuple[int, int, int, int]:
        h, w = self.alpha.shape
        return self.x0, self.y0, self.x0 + w, self.y0 + h

    def rgba_u8(self) -> np.ndarray:
        out = np.dstack([np.clip(self.rgb, 0, 255), self.alpha * 255.0])
        return out.astype(np.uint8)


# --------------------------------------------------------------------------------------
# Génération par diffusion
# --------------------------------------------------------------------------------------
def _crop_box(bb, frame_w, frame_h, context: float = 1.7):
    """Boîte carrée (si possible) autour de l'objet, avec du contexte pour le modèle."""
    x0, y0, x1, y1 = bb
    side = int(max(x1 - x0, y1 - y0) * context)
    side = max(side, 256)
    cw, ch = min(side, frame_w), min(side, frame_h)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    bx0 = int(np.clip(cx - cw // 2, 0, frame_w - cw))
    by0 = int(np.clip(cy - ch // 2, 0, frame_h - ch))
    return bx0, by0, bx0 + cw, by0 + ch


def generation_mask(key_mask: np.ndarray, shape_mode: str) -> np.ndarray:
    bb = maskops.bbox(key_mask)
    if bb is None:
        return key_mask
    size = max(bb[2] - bb[0], bb[3] - bb[1])
    if shape_mode == "free":
        h, w = key_mask.shape
        # forme libre : toute la boîte (élargie) est "repeignable", le modèle choisit la silhouette
        x0, y0, x1, y1 = maskops.expand_box(bb, 0.12, w, h)
        m = np.zeros_like(key_mask)
        cv2.rectangle(m, (x0, y0), (x1 - 1, y1 - 1), 255, -1)
        return m
    return maskops.dilate(key_mask, max(4, int(0.06 * size)))


def generate_sprite(
    clean_key: np.ndarray,
    key_mask: np.ndarray,
    prompt: str,
    negative_prompt: str,
    progress: Progress,
    steps: int = 30,
    guidance: float = 7.0,
    seed: int = -1,
    shape_mode: str = "follow",
) -> Sprite:
    import torch

    pipe = models.inpaint_pipeline()
    if pipe is None:
        raise RuntimeError("Aucun modèle de diffusion disponible")
    h, w = clean_key.shape[:2]
    bb = maskops.bbox(key_mask)
    if bb is None:
        raise ValueError("Masque vide")
    gen_mask = generation_mask(key_mask, shape_mode)
    x0, y0, x1, y1 = _crop_box(maskops.bbox(gen_mask), w, h)
    crop = clean_key[y0:y1, x0:x1]
    mcrop = gen_mask[y0:y1, x0:x1]

    native = 1024 if "XL" in type(pipe).__name__ else 512
    scale = native / max(crop.shape[:2])
    gw = max(64, int(round(crop.shape[1] * scale / 8)) * 8)
    gh = max(64, int(round(crop.shape[0] * scale / 8)) * 8)

    from PIL import Image

    image = Image.fromarray(cv2.cvtColor(cv2.resize(crop, (gw, gh), interpolation=cv2.INTER_CUBIC), cv2.COLOR_BGR2RGB))
    mask_img = Image.fromarray(cv2.GaussianBlur(cv2.resize(mcrop, (gw, gh), interpolation=cv2.INTER_LINEAR), (0, 0), 2))

    seed = seed if seed is not None and seed >= 0 else random.randint(0, 2**31 - 1)
    generator = torch.Generator(device="cpu").manual_seed(seed)

    def on_step(_pipe, step, _timestep, kwargs):
        progress(0.05 + 0.85 * (step + 1) / steps, f"La licorne peint « {prompt[:40]} » ({step + 1}/{steps})")
        return kwargs

    progress(0.02, "Chargement du modèle de diffusion (1ère fois = téléchargement)")
    full_prompt = f"{prompt.strip()}, {REALISM_SUFFIX}"
    full_negative = ", ".join(x for x in (negative_prompt.strip(), REALISM_NEGATIVE) if x)
    kwargs = dict(
        prompt=full_prompt, negative_prompt=full_negative, image=image, mask_image=mask_img,
        width=gw, height=gh, num_inference_steps=steps, guidance_scale=guidance,
        strength=0.99, generator=generator,
    )
    try:
        result = pipe(**kwargs, callback_on_step_end=on_step).images[0]
    except TypeError:  # vieilles versions de diffusers
        result = pipe(**kwargs).images[0]
    gen = cv2.cvtColor(np.asarray(result), cv2.COLOR_RGB2BGR)
    gen = cv2.resize(gen, (crop.shape[1], crop.shape[0]), interpolation=cv2.INTER_AREA)

    progress(0.92, "Détourage de l'élément généré")
    alpha, shadow = extract_element(gen, crop, mcrop, key_mask[y0:y1, x0:x1])
    sprite = Sprite(rgb=gen.astype(np.float32), alpha=alpha, x0=x0, y0=y0, shadow=shadow,
                    shadow_origin=(x0, y0) if shadow is not None else None,
                    engine="diffusion", seed=seed)
    match_sharpness(sprite, clean_key)
    return sprite


def extract_element(gen: np.ndarray, clean: np.ndarray, gen_mask: np.ndarray, key_mask: np.ndarray):
    """Sépare l'élément (alpha) et l'ombre qu'a peinte le modèle (carte d'assombrissement)."""
    area_gen = max(1, int((gen_mask > 0).sum()))
    obj = None
    if sam2_available():
        try:
            bb = maskops.bbox(gen_mask)
            cy, cx = [int(v.mean()) for v in np.nonzero(key_mask if key_mask.any() else gen_mask)]
            seg = Sam2Segmenter().segment(gen, [Point(cx, cy, 1)], box=bb)
            cand = seg.mask & maskops.dilate(gen_mask, 3)
            if 0.12 * area_gen < (cand > 0).sum():
                obj = cand
        except Exception:  # noqa: BLE001
            log.exception("Détourage SAM2 échoué -> matte par différence")

    lab_g = cv2.cvtColor(gen, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab_c = cv2.cvtColor(clean, cv2.COLOR_BGR2LAB).astype(np.float32)
    shadow_like = _shadow_like(lab_g, lab_c) & (gen_mask > 0)

    if obj is None:
        diff = lab_g - lab_c
        d = np.sqrt(0.5 * diff[..., 0] ** 2 + diff[..., 1] ** 2 + diff[..., 2] ** 2)
        d = cv2.GaussianBlur(d, (0, 0), 1.5)
        inside = gen_mask > 0
        vals = np.clip(d[inside], 0, 255).astype(np.uint8)
        thr, _ = cv2.threshold(vals.reshape(-1, 1), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        obj = ((d > max(thr, 10)) & inside & ~shadow_like).astype(np.uint8) * 255
        obj = cv2.morphologyEx(obj, cv2.MORPH_OPEN, maskops.ellipse_kernel(2))
        obj = maskops.fill_holes(maskops.keep_components(obj, None, 0.2), 0.08)
        obj = maskops.smooth_mask(obj, 3)
        if (obj > 0).sum() < 0.05 * area_gen:  # génération quasi invisible : on prend la zone
            obj = gen_mask.copy()

    alpha = refine_alpha(gen, obj)

    shadow = None
    sh = shadow_like & (maskops.dilate(obj, 2) == 0)
    if sh.sum() > 0.03 * max(1, (obj > 0).sum()):
        ratio = (gen.astype(np.float32) + 2.0) / (clean.astype(np.float32) + 2.0)
        ratio = np.clip(cv2.GaussianBlur(ratio, (0, 0), 2.0), 0.15, 1.0)
        weight = maskops.feather(sh.astype(np.uint8) * 255, 3.0)[..., None]
        shadow = ((1.0 - ratio) * weight).astype(np.float32)
    return alpha, shadow


def _shadow_like(lab_g: np.ndarray, lab_c: np.ndarray) -> np.ndarray:
    """Pixels plus sombres mais de même texture/chroma que le décor = ombre portée."""
    lg, lc = lab_g[..., 0], lab_c[..., 0]
    darker = lg < 0.9 * lc
    chroma = np.abs(lab_g[..., 1] - lab_c[..., 1]) + np.abs(lab_g[..., 2] - lab_c[..., 2]) < 14
    # corrélation locale (fenêtre 7x7) : une ombre conserve la texture du sol
    k = (7, 7)
    mg, mc = cv2.blur(lg, k), cv2.blur(lc, k)
    cov = cv2.blur(lg * lc, k) - mg * mc
    vg = cv2.blur(lg * lg, k) - mg * mg
    vc = cv2.blur(lc * lc, k) - mc * mc
    ncc = cov / np.sqrt(np.maximum(vg * vc, 1e-3))
    flat = vc < 4.0  # sol uni : la corrélation n'a pas de sens, on se fie à la chroma
    return darker & chroma & ((ncc > 0.55) | flat)


def refine_alpha(guide_bgr: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Alpha à bords naturels : filtre guidé par l'image (cheveux, poils, flou de bougé)."""
    m = maskops.to_u8(mask).astype(np.float32) / 255.0
    try:
        gf = cv2.ximgproc.guidedFilter(guide_bgr.astype(np.uint8), m, 4, 1e-3)
        alpha = np.clip(gf, 0, 1)
    except AttributeError:  # opencv sans contrib
        alpha = cv2.GaussianBlur(m, (0, 0), 1.0)
    # on garde le coeur plein et l'extérieur lointain vide
    alpha[maskops.erode(maskops.to_u8(mask), 3) > 0] = 1.0
    alpha[maskops.dilate(maskops.to_u8(mask), 4) == 0] = 0.0
    return alpha.astype(np.float32)


# --------------------------------------------------------------------------------------
# Élément fourni par l'utilisateur
# --------------------------------------------------------------------------------------
def sprite_from_image(
    element: np.ndarray, key_mask: np.ndarray, clean_key: np.ndarray, scale: float = 1.0
) -> Sprite:
    """`element` : BGR ou BGRA. Placé dans la boîte de l'objet (contain), posé au sol."""
    if element.ndim == 2:
        element = cv2.cvtColor(element, cv2.COLOR_GRAY2BGR)
    if element.shape[2] == 4 and element[..., 3].min() < 250:
        rgb, a = element[..., :3], element[..., 3]
    else:
        rgb = element[..., :3]
        a = auto_cutout(rgb)
    bb_e = maskops.bbox(a > 10)
    if bb_e is None:
        raise ValueError("L'image de l'élément est entièrement transparente")
    ex0, ey0, ex1, ey1 = bb_e
    rgb, a = rgb[ey0:ey1, ex0:ex1], a[ey0:ey1, ex0:ex1]

    h, w = clean_key.shape[:2]
    bx0, by0, bx1, by1 = maskops.bbox(key_mask)
    bw, bh = bx1 - bx0, by1 - by0
    s = min(bw / rgb.shape[1], bh / rgb.shape[0]) * scale
    nw, nh = max(2, int(rgb.shape[1] * s)), max(2, int(rgb.shape[0] * s))
    interp = cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC
    rgb = cv2.resize(rgb, (nw, nh), interpolation=interp).astype(np.float32)
    a = cv2.resize(a, (nw, nh), interpolation=interp).astype(np.float32) / 255.0
    # centré horizontalement, posé sur le "sol" (bas de l'objet d'origine)
    x0 = (bx0 + bx1) // 2 - nw // 2
    y0 = by1 - nh
    # recadrage si l'élément déborde de l'image
    cx0, cy0 = max(0, -x0), max(0, -y0)
    cx1, cy1 = nw - max(0, x0 + nw - w), nh - max(0, y0 + nh - h)
    rgb, a = rgb[cy0:cy1, cx0:cx1], a[cy0:cy1, cx0:cx1]
    sprite = Sprite(rgb=rgb, alpha=a, x0=x0 + cx0, y0=y0 + cy0, engine="upload")
    harmonize(sprite, clean_key, key_mask, strength=0.6)
    match_sharpness(sprite, clean_key)
    return sprite


def auto_cutout(rgb: np.ndarray) -> np.ndarray:
    """Détourage automatique d'une image sans transparence (SAM2 boîte, sinon GrabCut)."""
    h, w = rgb.shape[:2]
    box = (int(0.03 * w), int(0.03 * h), int(0.97 * w), int(0.97 * h))
    if sam2_available():
        try:
            seg = Sam2Segmenter().segment(rgb, [Point(w / 2, h / 2, 1)], box=box)
            if (seg.mask > 0).mean() > 0.05:
                return seg.mask
        except Exception:  # noqa: BLE001
            log.exception("Détourage SAM2 de l'élément échoué")
    gc = np.zeros((h, w), np.uint8)
    bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
    try:
        cv2.grabCut(rgb, gc, (box[0], box[1], box[2] - box[0], box[3] - box[1]), bgd, fgd, 5,
                    cv2.GC_INIT_WITH_RECT)
        m = np.isin(gc, (cv2.GC_FGD, cv2.GC_PR_FGD)).astype(np.uint8) * 255
        if (m > 0).mean() > 0.05:
            return maskops.smooth_mask(maskops.keep_components(m), 2)
    except cv2.error:
        pass
    return np.full((h, w), 255, np.uint8)


# --------------------------------------------------------------------------------------
# Harmonisation
# --------------------------------------------------------------------------------------
def harmonize(sprite: Sprite, frame: np.ndarray, region: np.ndarray, strength: float = 0.5) -> None:
    """Adapte balance des blancs, exposition et contraste de l'élément à la scène."""
    if strength <= 0:
        return
    sel = sprite.alpha > 0.5
    if sel.sum() < 30:
        return
    lab = cv2.cvtColor(np.clip(sprite.rgb, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    scene = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB).astype(np.float32)
    bb = maskops.bbox(region)
    size = max(bb[2] - bb[0], bb[3] - bb[1]) if bb else 50
    around = maskops.ring(region, 2, max(8, size // 3)) > 0
    if around.sum() < 50:
        around = np.ones(region.shape, bool)
    ring_lab = scene[around]
    s_mean, s_std = lab[sel].mean(0), lab[sel].std(0) + 1e-3
    r_mean, r_std = ring_lab.mean(0), ring_lab.std(0) + 1e-3
    # dominante couleur globale de la scène (gris-monde) -> transférée sur l'élément
    cast = scene.reshape(-1, 3).mean(0)[1:] - 128.0
    lab[..., 0] = (lab[..., 0] - s_mean[0]) * (1 + strength * 0.25 * (r_std[0] / s_std[0] - 1)) \
        + s_mean[0] + strength * 0.4 * (r_mean[0] - s_mean[0])
    lab[..., 1:] += strength * 0.5 * cast
    lab = np.clip(lab, 0, 255).astype(np.uint8)
    sprite.rgb = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR).astype(np.float32)


def match_sharpness(sprite: Sprite, frame: np.ndarray) -> None:
    """Floute légèrement l'élément s'il est plus net que la vidéo (piège n°1 du compositing)."""
    x0, y0, x1, y1 = sprite.box
    h, w = frame.shape[:2]
    core = (maskops.erode((sprite.alpha > 0.5).astype(np.uint8) * 255, 3))
    if core.sum() < 255 * 100:
        return
    ex0, ey0, ex1, ey1 = maskops.expand_box((max(0, x0), max(0, y0), min(w, x1), min(h, y1)), 0.5, w, h)
    ref = cv2.cvtColor(frame[ey0:ey1, ex0:ex1], cv2.COLOR_BGR2GRAY)
    target = maskops.sharpness(ref)
    gray = cv2.cvtColor(np.clip(sprite.rgb, 0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY)
    best_sigma, best_err = 0.0, abs(maskops.sharpness(gray, core) - target)
    for sigma in (0.5, 0.8, 1.1, 1.5, 2.0, 2.6):
        g = cv2.GaussianBlur(gray, (0, 0), sigma)
        err = abs(maskops.sharpness(g, core) - target)
        if err < best_err:
            best_sigma, best_err = sigma, err
    if best_sigma > 0:
        sprite.rgb = cv2.GaussianBlur(sprite.rgb, (0, 0), best_sigma)
        sprite.alpha = cv2.GaussianBlur(sprite.alpha, (0, 0), best_sigma * 0.5)
