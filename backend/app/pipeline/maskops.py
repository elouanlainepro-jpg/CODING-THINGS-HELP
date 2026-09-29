"""Petits outils partagés sur les masques / images (sans dépendance IA)."""
from __future__ import annotations

import base64

import cv2
import numpy as np


def to_u8(mask: np.ndarray) -> np.ndarray:
    """bool / float / uint8 -> uint8 0/255."""
    if mask.dtype == bool:
        return mask.astype(np.uint8) * 255
    if mask.dtype != np.uint8:
        return (np.clip(mask, 0, 1) * 255).astype(np.uint8)
    return mask


def bbox(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    """(x0, y0, x1, y1) exclusif, ou None si masque vide."""
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def expand_box(
    box: tuple[int, int, int, int], margin: float | int, width: int, height: int
) -> tuple[int, int, int, int]:
    x0, y0, x1, y1 = box
    if isinstance(margin, float):
        mx, my = int((x1 - x0) * margin), int((y1 - y0) * margin)
    else:
        mx = my = int(margin)
    return max(0, x0 - mx), max(0, y0 - my), min(width, x1 + mx), min(height, y1 + my)


def ellipse_kernel(radius: int) -> np.ndarray:
    radius = max(1, int(radius))
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * radius + 1, 2 * radius + 1))


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    return mask if radius <= 0 else cv2.dilate(mask, ellipse_kernel(radius))


def erode(mask: np.ndarray, radius: int) -> np.ndarray:
    return mask if radius <= 0 else cv2.erode(mask, ellipse_kernel(radius))


def fill_holes(mask: np.ndarray, max_hole_ratio: float = 0.02) -> np.ndarray:
    """Bouche les petits trous internes (reflets, logos...) sans combler les vraies ouvertures."""
    m = to_u8(mask)
    inv = cv2.bitwise_not(m)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    area = max(1, int((m > 0).sum()))
    out = m.copy()
    h, w = m.shape
    for i in range(1, n):
        x, y, bw, bh, a = stats[i]
        touches_border = x == 0 or y == 0 or x + bw == w or y + bh == h
        if not touches_border and a <= max_hole_ratio * area:
            out[labels == i] = 255
    return out


def keep_components(
    mask: np.ndarray, seeds: list[tuple[int, int]] | None = None, min_ratio: float = 0.08
) -> np.ndarray:
    """Garde les composantes contenant un point positif, sinon celles assez grandes."""
    m = to_u8(mask)
    n, labels, stats, _ = cv2.connectedComponentsWithStats((m > 0).astype(np.uint8), connectivity=8)
    if n <= 2:
        return m
    areas = stats[1:, cv2.CC_STAT_AREA]
    keep = set()
    if seeds:
        for x, y in seeds:
            if 0 <= y < m.shape[0] and 0 <= x < m.shape[1] and labels[y, x] > 0:
                keep.add(int(labels[y, x]))
    largest = int(areas.max())
    for i, a in enumerate(areas, start=1):
        if a >= min_ratio * largest and (not keep or a >= 0.35 * largest):
            keep.add(i)
    return np.isin(labels, list(keep)).astype(np.uint8) * 255


def smooth_mask(mask: np.ndarray, radius: int = 2) -> np.ndarray:
    """Adoucit les bords en escalier (open/close léger + seuil d'un flou)."""
    m = to_u8(mask)
    if radius <= 0:
        return m
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, ellipse_kernel(radius))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, ellipse_kernel(max(1, radius // 2)))
    blur = cv2.GaussianBlur(m, (0, 0), radius * 0.8)
    return (blur > 127).astype(np.uint8) * 255


def feather(mask: np.ndarray, sigma: float) -> np.ndarray:
    """Masque float32 [0,1] aux bords doux."""
    m = to_u8(mask).astype(np.float32) / 255.0
    if sigma <= 0:
        return m
    return cv2.GaussianBlur(m, (0, 0), sigma)


def contours_normalized(mask: np.ndarray, max_points: int = 400) -> list[list[list[float]]]:
    """Contours simplifiés en coordonnées normalisées [0,1] (dessin des "fourmis" côté UI)."""
    h, w = mask.shape[:2]
    cnts, _ = cv2.findContours(to_u8(mask), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    for c in sorted(cnts, key=cv2.contourArea, reverse=True)[:12]:
        if cv2.contourArea(c) < 12:
            continue
        eps = 0.0015 * cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, eps, True)
        if len(approx) > max_points:
            step = int(np.ceil(len(approx) / max_points))
            approx = approx[::step]
        out.append([[round(float(p[0][0]) / w, 5), round(float(p[0][1]) / h, 5)] for p in approx])
    return out


def mask_to_png_b64(mask: np.ndarray) -> str:
    ok, buf = cv2.imencode(".png", to_u8(mask))
    if not ok:
        raise RuntimeError("Encodage PNG impossible")
    return base64.b64encode(buf.tobytes()).decode("ascii")


def gaussian_smooth_1d(values: np.ndarray, sigma: float) -> np.ndarray:
    """Lissage gaussien temporel (axe 0). Bords en réflexion *impaire* (2·f(0) − f(k)) :
    une trajectoire à vitesse constante n'est pas freinée au début ni à la fin du clip."""
    values = np.asarray(values, dtype=np.float64)
    if sigma <= 0 or len(values) < 3:
        return values.copy()
    radius = int(np.ceil(3 * sigma))
    x = np.arange(-radius, radius + 1)
    kernel = np.exp(-0.5 * (x / sigma) ** 2)
    kernel /= kernel.sum()
    pad = min(radius, len(values) - 1)
    left = 2 * values[:1] - values[pad:0:-1]
    right = 2 * values[-1:] - values[-2 : -pad - 2 : -1]
    padded = np.concatenate([left, values, right], axis=0)
    flat = padded.reshape(len(padded), -1)
    res = np.stack(
        [np.convolve(flat[:, k], kernel, mode="same") for k in range(flat.shape[1])], axis=1
    )
    return res[pad : pad + len(values)].reshape(values.shape)


def ring(mask: np.ndarray, inner: int, outer: int) -> np.ndarray:
    """Anneau autour d'un masque (pour mesurer l'environnement local)."""
    m = to_u8(mask)
    return cv2.subtract(dilate(m, outer), dilate(m, inner))


def estimate_noise_sigma(gray: np.ndarray, mask: np.ndarray | None = None) -> float:
    """Estimation robuste du bruit/grain (méthode MAD sur le laplacien, Immerkær simplifié)."""
    g = gray.astype(np.float32)
    kernel = np.array([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], dtype=np.float32)
    resp = cv2.filter2D(g, -1, kernel)
    # on ignore les zones texturées (bords forts) pour ne mesurer que le grain
    edges = cv2.Canny(gray.astype(np.uint8), 60, 140)
    valid = cv2.dilate(edges, ellipse_kernel(2)) == 0
    if mask is not None:
        valid &= mask > 0
    vals = np.abs(resp[valid])
    if vals.size < 200:
        return 0.0
    return float(np.median(vals) * 1.4826 / np.sqrt(36.0))


def sharpness(gray: np.ndarray, mask: np.ndarray | None = None) -> float:
    """Netteté normalisée par le contraste local (comparable entre sprite et décor)."""
    g = gray.astype(np.float32)
    lap = np.abs(cv2.Laplacian(g, cv2.CV_32F, ksize=3))
    if mask is not None:
        sel = mask > 0
        if sel.sum() < 50:
            return 0.0
        return float(lap[sel].mean() / (g[sel].std() + 4.0))
    return float(lap.mean() / (g.std() + 4.0))
