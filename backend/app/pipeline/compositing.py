"""Compositing "perfect conditions" : l'élément est incrusté frame par frame en respectant
- le mouvement (suivi rigide + option déformable par flux optique),
- la lumière locale (ré-éclairage spatial + dérive de balance des blancs),
- les ombres (vraie ombre d'origine re-ciblée, ombre peinte par l'IA, ou ombre de contact),
- les occlusions (ce qui passe devant l'objet d'origine passe devant le nouvel élément),
- la "signature caméra" : flou de bougé, grain, netteté, habillage lumineux des bords.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from . import maskops
from .generation import Sprite
from .tracking import rigid_residual_flow


@dataclass
class CompositeOptions:
    relight: bool = True
    relight_strength: float = 0.8
    shadows: str = "auto"  # "auto" | "keep" | "contact" | "off"
    grain: bool = True
    motion_blur: bool = True
    shutter: float = 0.5  # 180° d'obturateur
    occlusion: bool = True
    light_wrap: bool = True
    deformable: bool = False


@dataclass
class ShadowSpec:
    """Ombre portée de l'objet d'origine, mesurée sur la keyframe."""

    mask: np.ndarray  # uint8 plein cadre
    ratio: np.ndarray  # assombrissement moyen par canal (ombre / sol éclairé)
    area: int


# --------------------------------------------------------------------------------------
# Ombre de l'objet d'origine : détection (pour l'effacer ET pour la réutiliser)
# --------------------------------------------------------------------------------------
def detect_shadow(frame: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, ShadowSpec | None]:
    """Trouve l'ombre portée attachée à l'objet.

    Critère classique d'invariance : une ombre assombrit le sol mais conserve sa
    chromaticité normalisée (r, g, b) / (r + g + b)."""
    bb = maskops.bbox(mask)
    empty = np.zeros(mask.shape, np.uint8)
    if bb is None:
        return empty, None
    h, w = mask.shape
    size = max(bb[2] - bb[0], bb[3] - bb[1])
    x0, y0, x1, y1 = maskops.expand_box(bb, int(1.0 * size), w, h)
    crop, m = frame[y0:y1, x0:x1], mask[y0:y1, x0:x1]
    f = cv2.GaussianBlur(crop.astype(np.float32), (0, 0), 1.2) + 1.0
    lum = f.sum(axis=2)
    chrom = f / lum[..., None]
    search = (maskops.dilate(m, int(0.7 * size)) > 0) & (m == 0)
    outer = maskops.ring(m, int(0.7 * size), int(1.0 * size)) > 0
    if outer.sum() < 50:
        return empty, None
    ratio_l = lum / np.median(lum[outer])
    chroma_d = np.abs(chrom - np.median(chrom[outer], axis=0)).sum(axis=2)
    cand = search & (ratio_l < 0.78) & (ratio_l > 0.12) & (chroma_d < 0.12)
    cand = cv2.morphologyEx(cand.astype(np.uint8) * 255, cv2.MORPH_OPEN, maskops.ellipse_kernel(1))
    cand = cv2.morphologyEx(cand, cv2.MORPH_CLOSE, maskops.ellipse_kernel(3))
    # ne garder que ce qui touche l'objet (ombre attachée) et fermer les petits trous
    n, labels, _, _ = cv2.connectedComponentsWithStats(cand, connectivity=8)
    touch = maskops.dilate(m, 3) > 0
    keep = [i for i in range(1, n) if touch[labels == i].any()]
    if not keep:
        return empty, None
    shadow = maskops.fill_holes(np.isin(labels, keep).astype(np.uint8) * 255, 0.2)
    shadow[m > 0] = 0
    area = int((shadow > 0).sum())
    if area < 0.04 * max(1, int((m > 0).sum())):
        return empty, None
    full = empty.copy()
    full[y0:y1, x0:x1] = shadow
    lit = crop[outer].astype(np.float32).mean(0) + 1.0
    dark = crop[shadow > 0].astype(np.float32).mean(0) + 1.0
    ratio = np.clip(dark / lit, 0.1, 0.95).astype(np.float32)
    return full, ShadowSpec(mask=full, ratio=ratio, area=area)


def _anchor(mask: np.ndarray) -> tuple[float, float, float, float] | None:
    """(x du bas-centre, y du sol, largeur, hauteur) d'une silhouette."""
    ys, xs = np.nonzero(mask)
    if len(ys) < 10:
        return None
    ground = ys.max()
    height = ground - ys.min() + 1
    bottom = xs[ys >= ground - max(1, 0.1 * height)]
    return float(bottom.mean()), float(ground), float(xs.max() - xs.min() + 1), float(height)


def shadow_from_original(
    frame_key: np.ndarray, clean_key: np.ndarray, spec: ShadowSpec, key_mask: np.ndarray, sprite: Sprite
) -> tuple[np.ndarray, tuple[int, int]] | None:
    """Réutilise la VRAIE ombre d'origine (forme, douceur, couleur exactes) :
    assombrissement = frame / décor nettoyé, puis re-ciblage à la taille du nouvel élément
    (ancré au point de contact avec le sol)."""
    h, w = key_mask.shape
    region = maskops.dilate(spec.mask, 4)
    bb = maskops.bbox(region)
    orig = _anchor(key_mask)
    alpha_full = np.zeros((h, w), np.uint8)
    sx0, sy0, sx1, sy1 = sprite.box
    cx0, cy0, cx1, cy1 = max(0, sx0), max(0, sy0), min(w, sx1), min(h, sy1)
    if cx1 <= cx0 or cy1 <= cy0:
        return None
    alpha_full[cy0:cy1, cx0:cx1] = (sprite.alpha[cy0 - sy0:cy1 - sy0, cx0 - sx0:cx1 - sx0] > 0.5) * 255
    new = _anchor(alpha_full)
    if bb is None or orig is None or new is None:
        return None
    x0, y0, x1, y1 = bb
    ratio = (frame_key[y0:y1, x0:x1].astype(np.float32) + 1.0) / (clean_key[y0:y1, x0:x1].astype(np.float32) + 1.0)
    ratio = np.clip(cv2.GaussianBlur(ratio, (0, 0), 1.5), 0.05, 1.0)
    weight = maskops.feather(region[y0:y1, x0:x1], 2.0)[..., None]
    darkness = (1.0 - ratio) * weight
    sx = float(np.clip(new[2] / orig[2], 0.2, 5.0))
    sy = float(np.clip(new[3] / orig[3], 0.2, 5.0))
    # coordonnées du crop -> keyframe -> mise à l'échelle autour du point de contact
    M = np.array([[sx, 0, new[0] - sx * orig[0] + sx * x0],
                  [0, sy, new[1] - sy * orig[1] + sy * y0]], np.float64)
    ch, cw = darkness.shape[:2]
    corners = np.array([[0, 0, 1], [cw, 0, 1], [0, ch, 1], [cw, ch, 1]], np.float64) @ M.T
    ox, oy = np.floor(corners.min(0)).astype(int)
    ex, ey = np.ceil(corners.max(0)).astype(int)
    M[:, 2] -= (ox, oy)
    layer = cv2.warpAffine(darkness, M, (int(ex - ox), int(ey - oy)), flags=cv2.INTER_LINEAR,
                           borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    return layer.astype(np.float32), (int(ox), int(oy))


# --------------------------------------------------------------------------------------
# Compositeur
# --------------------------------------------------------------------------------------
class Compositor:
    def __init__(
        self,
        sprite: Sprite,
        frames: np.ndarray,
        clean: np.ndarray,
        masks: np.ndarray,
        transforms: np.ndarray,
        key_idx: int,
        options: CompositeOptions,
    ) -> None:
        self.sprite = sprite
        self.frames, self.clean, self.masks = frames, clean, masks
        self.T = transforms
        self.key_idx = key_idx
        self.opt = options
        n, self.h, self.w = frames.shape[:3]
        self.n = n
        self.key_mask = masks[key_idx].copy()
        self.key_frame = frames[key_idx].copy()

        # Pré-multiplication : pas de liseré sombre lors des rééchantillonnages.
        self._rgb_p = sprite.rgb * sprite.alpha[..., None]
        self._alpha = sprite.alpha
        sb = maskops.bbox(sprite.alpha > 0.05)
        self._center = np.array(
            [sprite.x0 + (sb[0] + sb[2]) / 2, sprite.y0 + (sb[1] + sb[3]) / 2] if sb
            else [sprite.x0, sprite.y0], np.float64)
        self._height = float(sb[3] - sb[1]) if sb else 10.0

        # Ré-éclairage : carte d'illumination basse fréquence de la keyframe nettoyée
        self._small = 1 / 8
        self._illum_key = self._illum(clean[key_idx])
        self._mean_key = clean[key_idx].reshape(-1, 3).mean(0) + 1.0

        # Grain : bruit caméra de la scène vs bruit de l'élément
        self._grain = 0.0
        if options.grain:
            sample = np.linspace(0, n - 1, min(n, 6)).astype(int)
            sig = [maskops.estimate_noise_sigma(cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY),
                                                cv2.bitwise_not(masks[i])) for i in sample]
            scene = float(np.median(sig))
            core = maskops.erode((sprite.alpha > 0.5).astype(np.uint8) * 255, 2)
            spr = maskops.estimate_noise_sigma(
                cv2.cvtColor(np.clip(sprite.rgb, 0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY), core)
            self._grain = float(np.sqrt(max(0.0, scene**2 - spr**2)))
        self._rng = np.random.default_rng(1234)

    # ---------------------------------------------------------------- helpers
    def _illum(self, img: np.ndarray) -> np.ndarray:
        small = cv2.resize(img, None, fx=self._small, fy=self._small, interpolation=cv2.INTER_AREA)
        lum = cv2.cvtColor(small, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32) + 4.0
        return cv2.GaussianBlur(lum, (0, 0), 3.0)

    def _crop_to_frame(self, t: int) -> np.ndarray:
        """Matrice 2x3 : coordonnées du crop du sprite -> coordonnées de la frame t."""
        A = np.vstack([self.T[t], [0, 0, 1]]) @ np.array(
            [[1, 0, self.sprite.x0], [0, 1, self.sprite.y0], [0, 0, 1]], np.float64)
        return A[:2]

    def _warp_box(self, A: np.ndarray, shape, pad: int):
        h, w = shape[:2]
        corners = np.array([[0, 0, 1], [w, 0, 1], [0, h, 1], [w, h, 1]], np.float64) @ A.T
        x0, y0 = np.floor(corners.min(0)).astype(int) - pad
        x1, y1 = np.ceil(corners.max(0)).astype(int) + pad
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(self.w, x1), min(self.h, y1)
        if x1 - x0 < 2 or y1 - y0 < 2:
            return None
        return x0, y0, x1, y1

    @staticmethod
    def _warp(layer: np.ndarray, A: np.ndarray, box) -> np.ndarray:
        x0, y0, x1, y1 = box
        A2 = A.copy()
        A2[:, 2] -= (x0, y0)
        return cv2.warpAffine(layer, A2, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR,
                              borderMode=cv2.BORDER_CONSTANT, borderValue=0)

    def _velocity(self, t: int) -> np.ndarray:
        c = np.array([*self._center, 1.0])
        a, b = max(0, t - 1), min(self.n - 1, t + 1)
        if a == b:
            return np.zeros(2)
        return (self.T[b] @ c - self.T[a] @ c) / (b - a)

    # ---------------------------------------------------------------- ombres
    def _shadow_darkness(self, t: int, alpha_w: np.ndarray, box):
        """(boîte, carte (h,w,3) d'assombrissement du décor) ou None."""
        mode = self.opt.shadows
        if mode in ("off", "keep"):
            return None
        sp = self.sprite
        if mode == "auto" and sp.shadow is not None and sp.shadow_origin is not None:
            A = (np.vstack([self.T[t], [0, 0, 1]]) @ np.array(
                [[1, 0, sp.shadow_origin[0]], [0, 1, sp.shadow_origin[1]], [0, 0, 1]], np.float64))[:2]
            sbox = self._warp_box(A, sp.shadow.shape, 2)
            return (sbox, self._warp(sp.shadow, A, sbox)) if sbox is not None else None
        # ombre de contact (occlusion ambiante) : ancre visuellement l'élément au sol
        x0, y0, _, _ = box
        anchor = _anchor(alpha_w > 0.5)
        if anchor is None:
            return None
        cx, ground, width, height = anchor
        rx, ry = max(2.0, 0.6 * width), max(2.0, 0.05 * height)
        blur = max(2.0, 0.035 * height)
        m = int(3 * blur)
        bx0, by0 = int(x0 + cx - rx) - m, int(y0 + ground - ry) - m
        bx1, by1 = int(x0 + cx + rx) + m, int(y0 + ground + ry) + m
        bx0, by0, bx1, by1 = max(0, bx0), max(0, by0), min(self.w, bx1), min(self.h, by1)
        if bx1 - bx0 < 2 or by1 - by0 < 2:
            return None
        layer = np.zeros((by1 - by0, bx1 - bx0), np.float32)
        center = (int(x0 + cx - bx0), int(y0 + ground - 0.01 * height - by0))
        cv2.ellipse(layer, center, (int(rx), int(ry)), 0, 0, 360, 1.0, -1)
        layer = cv2.GaussianBlur(layer, (0, 0), blur) * 0.75
        return (bx0, by0, bx1, by1), layer[..., None] * np.array([0.45, 0.45, 0.42], np.float32)

    # ---------------------------------------------------------------- rendu
    def render(self, t: int) -> np.ndarray:
        opt = self.opt
        A = self._crop_to_frame(t)
        v = self._velocity(t) if opt.motion_blur else np.zeros(2)
        blur_len = float(np.linalg.norm(v) * opt.shutter)
        pad = int(np.ceil(blur_len)) + 4
        box = self._warp_box(A, self._alpha.shape, pad)
        out = self.clean[t].astype(np.float32)
        if box is None:  # élément hors champ
            return self.clean[t].copy()
        x0, y0, x1, y1 = box
        rgb_p = self._warp(self._rgb_p, A, box)
        alpha = self._warp(self._alpha, A, box)

        # --- mode déformable : on suit aussi les déformations non rigides de l'objet
        if opt.deformable and t != self.key_idx and self.masks[t].any():
            flow = rigid_residual_flow(self.key_frame, self.frames[t], self.T[t], self.masks[t])
            if flow is not None:
                fx, fy = flow[y0:y1, x0:x1, 0], flow[y0:y1, x0:x1, 1]
                gy, gx = np.mgrid[0:y1 - y0, 0:x1 - x0].astype(np.float32)
                mx, my = gx + fx, gy + fy
                rgb_p = cv2.remap(rgb_p, mx, my, cv2.INTER_LINEAR, borderValue=0)
                alpha = cv2.remap(alpha, mx, my, cv2.INTER_LINEAR, borderValue=0)

        # --- ombres (sur le décor, avant l'élément). Calculées AVANT les occlusions :
        # un objet caché par un passant continue de projeter son ombre.
        shade = self._shadow_darkness(t, alpha, box)
        if shade is not None:
            (sx0, sy0, sx1, sy1), dark = shade
            out[sy0:sy1, sx0:sx1] *= 1.0 - np.clip(dark, 0.0, 0.95)

        # --- occlusions : ce qui passe devant l'objet d'origine masque le nouvel élément
        if opt.occlusion:
            occ = self._occlusion(t, box)
            if occ is not None:
                alpha = alpha * (1 - occ)
                rgb_p = rgb_p * (1 - occ)[..., None]

        # --- ré-éclairage : l'élément suit les variations de lumière de la scène
        if opt.relight and t != self.key_idx:
            rgb_p *= self._relight_gain(t, A, box)

        # --- flou de bougé directionnel (obturateur 180°)
        if blur_len > 1.0:
            k = _line_kernel(blur_len, np.arctan2(v[1], v[0]))
            rgb_p = cv2.filter2D(rgb_p, -1, k)
            alpha = cv2.filter2D(alpha, -1, k)

        bg = out[y0:y1, x0:x1]
        # --- habillage lumineux : la lumière du décor "bave" légèrement sur les bords
        if opt.light_wrap:
            size = max(4.0, 0.02 * self._height)
            bg_blur = cv2.GaussianBlur(bg, (0, 0), size)
            wrap = np.clip(alpha - cv2.GaussianBlur(alpha, (0, 0), size), 0, 1) * 0.6
            rgb_p = rgb_p + (bg_blur * alpha[..., None] - rgb_p) * wrap[..., None]

        # --- grain caméra (nouveau tirage à chaque frame, comme un vrai capteur)
        if self._grain > 0.2:
            noise = self._rng.normal(0, self._grain, alpha.shape).astype(np.float32)
            rgb_p = rgb_p + (noise * alpha)[..., None]

        out[y0:y1, x0:x1] = rgb_p + bg * (1 - alpha[..., None])
        return np.clip(out, 0, 255).astype(np.uint8)

    def _relight_gain(self, t: int, A: np.ndarray, box) -> np.ndarray:
        x0, y0, x1, y1 = box
        s = self._small
        illum_t = self._illum(self.clean[t])
        S = np.array([[s, 0, 0], [0, s, 0], [0, 0, 1]])
        Ts = (S @ np.vstack([self.T[t], [0, 0, 1]]) @ np.linalg.inv(S))[:2]
        key_moved = cv2.warpAffine(self._illum_key, Ts, illum_t.shape[::-1], flags=cv2.INTER_LINEAR,
                                   borderMode=cv2.BORDER_REPLICATE)
        gain = np.clip(illum_t / key_moved, 0.6, 1.6)
        gain = 1 + (gain - 1) * self.opt.relight_strength
        gain = cv2.resize(gain, (self.w, self.h), interpolation=cv2.INTER_LINEAR)[y0:y1, x0:x1]
        # dérive globale de balance des blancs (luminance neutralisée)
        mean_t = self.clean[t].reshape(-1, 3).mean(0) + 1.0
        wb = (mean_t / self._mean_key)
        wb = wb / wb.mean()
        wb = 1 + (np.clip(wb, 0.85, 1.15) - 1) * self.opt.relight_strength
        return gain[..., None] * wb[None, None, :].astype(np.float32)

    def _occlusion(self, t: int, box) -> np.ndarray | None:
        x0, y0, x1, y1 = box
        expected = cv2.warpAffine(self.key_mask, self.T[t], (self.w, self.h), flags=cv2.INTER_NEAREST)
        exp_area = int((expected > 0).sum())
        if exp_area < 50:
            return None
        visible = self.masks[t]
        vis_area = int((visible > 0).sum())
        if vis_area == 0:
            # objet entièrement caché (ou sorti) : l'élément disparaît aussi
            return np.ones((y1 - y0, x1 - x0), np.float32)
        size = max(4, int(0.03 * np.sqrt(exp_area)))
        occluded = cv2.subtract(expected, maskops.dilate(visible, size))
        occluded = cv2.morphologyEx(occluded, cv2.MORPH_OPEN, maskops.ellipse_kernel(size))
        ratio = (occluded > 0).sum() / exp_area
        if ratio < 0.03:
            return None
        occ = maskops.feather(maskops.dilate(occluded, size), size * 0.6)
        return occ[y0:y1, x0:x1]


def _line_kernel(length: float, angle: float) -> np.ndarray:
    size = int(np.ceil(length)) | 1
    k = np.zeros((size, size), np.float32)
    c = size // 2
    dx, dy = np.cos(angle), np.sin(angle)
    for i in np.linspace(-length / 2, length / 2, max(2, int(length * 2))):
        x, y = int(round(c + i * dx)), int(round(c + i * dy))
        if 0 <= x < size and 0 <= y < size:
            k[y, x] = 1.0
    return k / max(k.sum(), 1e-6)
