"""Mode "Recolorer" : transforme l'apparence de l'objet d'origine frame par frame.

Ne nécessite AUCUN modèle génératif : on garde l'éclairage, les ombres propres, les reflets
et la texture d'origine (canal L) et on change la teinte / la matière. Résultat : un
réalisme parfait du mouvement et de la lumière, même sur Mac sans GPU. C'est aussi le mode
de secours quand aucun modèle de diffusion n'est installé.
"""
from __future__ import annotations

import unicodedata
from dataclasses import dataclass

import cv2
import numpy as np

from . import maskops


@dataclass
class StyleSpec:
    kind: str  # "color" | "rainbow" | "boost"
    lab: tuple[float, float, float] | None = None  # cible (L 0..100, a, b)
    lift: float = 0.5  # force du déplacement de luminance vers la cible
    contrast: float = 1.0
    neon: bool = False
    label: str = ""


# (L, a, b) en CIELAB réel
_COLORS: list[tuple[tuple[str, ...], tuple[float, float, float], str]] = [
    (("rose", "pink", "fuchsia", "magenta"), (62.0, 62.0, -6.0), "rose"),
    (("rouge", "red", "carmin"), (48.0, 68.0, 48.0), "rouge"),
    (("orange",), (66.0, 42.0, 68.0), "orange"),
    (("jaune", "yellow"), (86.0, -4.0, 80.0), "jaune"),
    (("vert", "verte", "green", "emeraude"), (55.0, -52.0, 40.0), "vert"),
    (("cyan", "turquoise", "turquoise", "aqua"), (78.0, -38.0, -14.0), "turquoise"),
    (("bleu", "bleue", "blue", "azur"), (45.0, 18.0, -64.0), "bleu"),
    (("violet", "violette", "purple", "mauve", "lavande"), (42.0, 52.0, -52.0), "violet"),
    (("marron", "brun", "brown", "chocolat"), (38.0, 16.0, 30.0), "marron"),
    (("noir", "noire", "black"), (14.0, 0.0, 0.0), "noir"),
    (("blanc", "blanche", "white"), (93.0, 0.0, 0.0), "blanc"),
]
_GOLD = ("dore", "doree", "gold", "golden", "en or", "or massif")
_SILVER = ("argent", "argente", "argentee", "silver", "chrome", "chrome", "metal", "metallique")
_RAINBOW = ("arc-en-ciel", "arc en ciel", "rainbow", "licorne", "unicorn", "multicolore", "holographique")
_NEON = ("neon", "fluo", "phospho", "cyberpunk", "lumineux", "lumineuse", "glow")


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def parse_prompt(prompt: str) -> StyleSpec:
    p = f" {_normalize(prompt)} "
    words = set(p.replace(",", " ").replace(".", " ").split())
    neon = any(k in p for k in _NEON)
    if any(k in p for k in _RAINBOW):
        return StyleSpec("rainbow", neon=neon, label="arc-en-ciel 🌈")
    if any(k in p for k in _GOLD):
        return StyleSpec("color", (74.0, 6.0, 58.0), lift=0.45, contrast=1.35, neon=neon, label="or ✨")
    if any(k in p for k in _SILVER):
        return StyleSpec("color", (72.0, 0.0, -2.0), lift=0.4, contrast=1.45, neon=neon, label="chrome 🪩")
    for keys, lab, label in _COLORS:
        if any(k in words for k in keys):
            return StyleSpec("color", lab, lift=0.5, neon=neon, label=label)
    if neon:
        return StyleSpec("boost", neon=True, label="néon ⚡")
    return StyleSpec("rainbow", label="licorne 🦄 (aucune couleur reconnue)")


def _hue_lut() -> np.ndarray:
    """Teinte (0..359°) -> (a, b) CIELAB d'une couleur saturée."""
    hsv = np.zeros((1, 360, 3), np.float32)
    hsv[0, :, 0] = np.arange(360)
    hsv[0, :, 1] = 0.85
    hsv[0, :, 2] = 1.0
    rgb = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
    lab = cv2.cvtColor(rgb, cv2.COLOR_BGR2LAB)
    return lab[0, :, 1:]


_HUES = _hue_lut()


def restyle_frame(frame: np.ndarray, alpha: np.ndarray, spec: StyleSpec, t: int = 0, n: int = 1) -> np.ndarray:
    """`alpha` float32 0..1 (masque doux de l'objet dans cette frame)."""
    bb = maskops.bbox(alpha > 0.01)
    if bb is None:
        return frame
    h, w = frame.shape[:2]
    x0, y0, x1, y1 = maskops.expand_box(bb, 12, w, h)
    crop = frame[y0:y1, x0:x1].astype(np.float32) / 255.0
    a = alpha[y0:y1, x0:x1][..., None]
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)  # L 0..100
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    core = alpha[y0:y1, x0:x1] > 0.5
    if core.sum() < 10:
        core = alpha[y0:y1, x0:x1] > 0.01
    mL, mA, mB = L[core].mean(), A[core].mean(), B[core].mean()

    if spec.kind == "color" and spec.lab is not None:
        tL, ta, tb = spec.lab
        L2 = (L - mL) * spec.contrast + mL + (tL - mL) * spec.lift
        # la chroma possible diminue près du noir et du blanc
        k = np.clip(np.minimum(L2, 100 - L2) / 32.0, 0.2, 1.0)
        A2 = ta * k + 0.2 * (A - mA)
        B2 = tb * k + 0.2 * (B - mB)
    elif spec.kind == "rainbow":
        ys, xs = np.nonzero(core)
        pts = np.stack([xs, ys], 1).astype(np.float32)
        mean = pts.mean(0)
        _, _, vt = np.linalg.svd(pts - mean, full_matrices=False)
        axis = vt[0]
        gy, gx = np.mgrid[0:L.shape[0], 0:L.shape[1]].astype(np.float32)
        proj = (gx - mean[0]) * axis[0] + (gy - mean[1]) * axis[1]
        span = max(1.0, np.percentile(np.abs(proj[core]), 98))
        hue = ((proj / span + 1) * 150 + 360.0 * 0.15 * t / max(1, n)) % 360
        ab = _HUES[hue.astype(np.int32) % 360]
        L2 = L + (68 - mL) * 0.45
        k = np.clip(np.minimum(L2, 100 - L2) / 32.0, 0.25, 1.0)
        A2 = ab[..., 0] * 0.8 * k + 0.15 * (A - mA)
        B2 = ab[..., 1] * 0.8 * k + 0.15 * (B - mB)
    else:  # boost de saturation
        L2, A2, B2 = L, A * 1.8, B * 1.8

    if spec.neon:
        A2, B2 = A2 * 1.3, B2 * 1.3
        L2 = np.minimum(100, L2 * 1.08 + 4)
    styled = cv2.cvtColor(np.dstack([np.clip(L2, 0, 100), A2, B2]).astype(np.float32), cv2.COLOR_LAB2BGR)
    out = crop * (1 - a) + np.clip(styled, 0, 1) * a
    if spec.neon:  # halo lumineux (mode "screen")
        size = max(x1 - x0, y1 - y0)
        glow = cv2.GaussianBlur(np.clip(styled, 0, 1) * a, (0, 0), max(3, 0.05 * size))
        out = 1 - (1 - out) * (1 - 0.55 * glow)
    result = frame.copy()
    result[y0:y1, x0:x1] = np.clip(out * 255, 0, 255).astype(np.uint8)
    return result
