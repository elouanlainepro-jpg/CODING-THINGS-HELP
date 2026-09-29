"""Suivi de l'objet dans toute la vidéo + estimation des mouvements (objet et caméra).

- Masques : SAM2 video predictor (mémoire temporelle, gère occlusions/déformations) ou, en
  repli, flux optique KLT + raffinement GrabCut.
- Mouvement objet : transformation de similarité (translation/rotation/échelle) keyframe -> t,
  lissée temporellement, qui sert à "faire vivre" l'élément de remplacement.
- Mouvement caméra : homographies frame -> keyframe (sur le décor uniquement), utilisées par
  l'effacement temporel et la propagation cohérente du décor reconstruit.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

from . import maskops, models
from ..devices import get_device, sam2_available

log = logging.getLogger(__name__)

Progress = Callable[[float, str], None]


# --------------------------------------------------------------------------------------
# Suivi des masques
# --------------------------------------------------------------------------------------
def track_masks(
    frames: np.ndarray,
    key_idx: int,
    key_mask: np.ndarray,
    workdir: Path,
    progress: Progress,
    model_id: str | None = None,
) -> tuple[np.ndarray, str]:
    """Renvoie (masks memmap (N,H,W) uint8 0/255, moteur)."""
    n, h, w = frames.shape[:3]
    masks = np.lib.format.open_memmap(workdir / "masks.npy", mode="w+", dtype=np.uint8, shape=(n, h, w))
    if sam2_available():
        try:
            _track_sam2(frames, key_idx, key_mask, masks, workdir, progress, model_id)
            return masks, "sam2-video"
        except Exception:  # noqa: BLE001
            log.exception("Tracking SAM2 échoué -> repli flux optique")
    _track_classic(frames, key_idx, key_mask, masks, progress)
    return masks, "optical-flow"


def _track_sam2(frames, key_idx, key_mask, masks, workdir: Path, progress: Progress, model_id):
    import torch

    n = len(frames)
    jpg_dir = workdir / "sam2_frames"
    jpg_dir.mkdir(exist_ok=True)
    for i in range(n):
        cv2.imwrite(str(jpg_dir / f"{i:05d}.jpg"), frames[i], [cv2.IMWRITE_JPEG_QUALITY, 95])
        if i % 20 == 0:
            progress(0.1 * i / n, "Préparation des frames pour SAM2")
    predictor = models.sam2_video_predictor(model_id)
    device = get_device()
    autocast = (
        torch.autocast("cuda", dtype=torch.bfloat16) if device == "cuda" else _nullcontext()
    )
    done = 0
    with torch.inference_mode(), autocast:
        state = predictor.init_state(
            video_path=str(jpg_dir), offload_video_to_cpu=True, offload_state_to_cpu=device != "cuda"
        )
        # On donne à SAM2 le masque validé par l'utilisateur (plus fidèle que les seuls clics).
        predictor.add_new_mask(state, frame_idx=key_idx, obj_id=1, mask=key_mask > 0)
        for reverse in (False, True):
            for f_idx, _obj_ids, logits in predictor.propagate_in_video(
                state, start_frame_idx=key_idx, reverse=reverse
            ):
                masks[f_idx] = ((logits[0, 0] > 0.0).cpu().numpy()).astype(np.uint8) * 255
                done += 1
                if done % 5 == 0:
                    progress(0.1 + 0.9 * min(1.0, done / n), "SAM2 suit l'objet image par image")
        predictor.reset_state(state)
    masks[key_idx] = maskops.to_u8(key_mask)
    for i in range(n):  # nettoyage : petites miettes, trous
        m = masks[i]
        if m.any():
            masks[i] = maskops.fill_holes(maskops.keep_components(m, None, 0.1))


class _nullcontext:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _gray(img: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def _track_features(prev_gray, gray, pts):
    """KLT avec contrôle aller-retour (élimine les points qui dérivent)."""
    lk = dict(winSize=(21, 21), maxLevel=4,
              criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01))
    nxt, st, _ = cv2.calcOpticalFlowPyrLK(prev_gray, gray, pts, None, **lk)
    if nxt is None:
        return pts[:0], pts[:0]
    back, st2, _ = cv2.calcOpticalFlowPyrLK(gray, prev_gray, nxt, None, **lk)
    fb = np.linalg.norm((back - pts).reshape(-1, 2), axis=1)
    good = (st.ravel() == 1) & (st2.ravel() == 1) & (fb < 1.0)
    return pts[good], nxt[good]


def _step_transform(prev_gray, gray, prev_mask, cur_mask=None):
    """Similarité 2x3 prev -> cur estimée sur les points de l'objet, ou None."""
    feat_mask = maskops.erode(prev_mask, 2)
    if feat_mask.sum() < 255 * 30:
        feat_mask = prev_mask
    pts = cv2.goodFeaturesToTrack(prev_gray, 400, 0.005, 4, mask=feat_mask, blockSize=5)
    if pts is None or len(pts) < 6:
        return None
    p0, p1 = _track_features(prev_gray, gray, pts)
    if cur_mask is not None and len(p1):
        dil = maskops.dilate(cur_mask, 6)
        xy = np.round(p1.reshape(-1, 2)).astype(int)
        inside = (xy[:, 0] >= 0) & (xy[:, 0] < dil.shape[1]) & (xy[:, 1] >= 0) & (xy[:, 1] < dil.shape[0])
        ok = np.zeros(len(xy), bool)
        ok[inside] = dil[xy[inside, 1], xy[inside, 0]] > 0
        p0, p1 = p0[ok], p1[ok]
    if len(p0) < 6:
        return None
    M, inliers = cv2.estimateAffinePartial2D(p0, p1, method=cv2.RANSAC, ransacReprojThreshold=2.0)
    if M is None or inliers is None or inliers.sum() < 5:
        return None
    return M


def _moments_transform(prev_mask, cur_mask):
    """Repli : translation du centroïde + échelle sqrt(aire)."""
    m0, m1 = cv2.moments(prev_mask, True), cv2.moments(cur_mask, True)
    if m0["m00"] < 10 or m1["m00"] < 10:
        return None
    c0 = np.array([m0["m10"] / m0["m00"], m0["m01"] / m0["m00"]])
    c1 = np.array([m1["m10"] / m1["m00"], m1["m01"] / m1["m00"]])
    s = float(np.clip(np.sqrt(m1["m00"] / m0["m00"]), 0.8, 1.25))
    M = np.array([[s, 0, 0], [0, s, 0]], dtype=np.float64)
    M[:, 2] = c1 - s * c0
    return M


def _refine_grabcut(frame: np.ndarray, prior: np.ndarray) -> np.ndarray:
    """Réajuste un masque propagé sur les vrais contours de la frame (bande étroite)."""
    bb = maskops.bbox(prior)
    if bb is None:
        return prior
    h, w = prior.shape
    size = max(bb[2] - bb[0], bb[3] - bb[1])
    band = max(3, int(0.06 * size))
    x0, y0, x1, y1 = maskops.expand_box(bb, band * 3, w, h)
    crop, pr = frame[y0:y1, x0:x1], prior[y0:y1, x0:x1]
    gc = np.full(pr.shape, cv2.GC_BGD, np.uint8)
    gc[maskops.dilate(pr, band) > 0] = cv2.GC_PR_BGD
    gc[pr > 0] = cv2.GC_PR_FGD
    gc[maskops.erode(pr, band) > 0] = cv2.GC_FGD
    if not (gc == cv2.GC_FGD).any():
        return prior
    try:
        bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
        cv2.grabCut(crop, gc, None, bgd, fgd, 2, cv2.GC_INIT_WITH_MASK)
    except cv2.error:
        return prior
    refined = np.zeros_like(prior)
    refined[y0:y1, x0:x1] = np.isin(gc, (cv2.GC_FGD, cv2.GC_PR_FGD)).astype(np.uint8) * 255
    a0, a1 = (prior > 0).sum(), (refined > 0).sum()
    if a0 == 0 or not (0.7 < a1 / a0 < 1.4):  # garde-fou : GrabCut qui "fuit"
        return prior
    return maskops.smooth_mask(maskops.fill_holes(refined), 2)


def _track_classic(frames, key_idx, key_mask, masks, progress: Progress):
    n, h, w = frames.shape[:3]
    masks[key_idx] = maskops.to_u8(key_mask)
    done = 1
    for direction in (1, -1):
        prev_idx = key_idx
        prev_gray = _gray(frames[prev_idx])
        t = key_idx + direction
        while 0 <= t < n:
            gray = _gray(frames[t])
            prev_mask = masks[prev_idx]
            M = _step_transform(prev_gray, gray, prev_mask) if prev_mask.any() else None
            if M is None:
                warped = prev_mask.copy()  # objet perdu/immobile : on garde le masque
            else:
                warped = cv2.warpAffine(prev_mask, M, (w, h), flags=cv2.INTER_LINEAR)
                warped = (warped > 127).astype(np.uint8) * 255
            masks[t] = _refine_grabcut(frames[t], warped) if warped.any() else warped
            prev_idx, prev_gray = t, gray
            t += direction
            done += 1
            if done % 3 == 0:
                progress(done / n, "Flux optique : suivi de l'objet")


# --------------------------------------------------------------------------------------
# Mouvement de l'objet (pour animer l'élément de remplacement)
# --------------------------------------------------------------------------------------
def estimate_object_motion(
    frames: np.ndarray, masks: np.ndarray, key_idx: int, progress: Progress | None = None
) -> np.ndarray:
    """Transformations (N,2,3) : coordonnées keyframe -> coordonnées frame t."""
    n = len(frames)
    T = np.zeros((n, 2, 3), np.float64)
    T[key_idx] = np.eye(2, 3)
    key_mask = masks[key_idx]
    for direction in (1, -1):
        prev_gray = _gray(frames[key_idx])
        t = key_idx + direction
        while 0 <= t < n:
            gray = _gray(frames[t])
            prev = t - direction
            M = _step_transform(prev_gray, gray, masks[prev], masks[t]) if masks[prev].any() else None
            if M is None:
                M = _moments_transform(masks[prev], masks[t])
            step = np.vstack([M if M is not None else np.eye(2, 3), [0, 0, 1]])
            cur = step @ np.vstack([T[prev], [0, 0, 1]])
            # Correction de dérive : si l'objet est entièrement visible (aire cohérente),
            # on ramène doucement le centre prédit vers le centre réel du masque.
            if masks[t].any():
                pred = cv2.warpAffine(key_mask, cur[:2], (key_mask.shape[1], key_mask.shape[0]))
                area_ratio = (masks[t] > 0).sum() / max(1, (pred > 127).sum())
                if 0.85 < area_ratio < 1.18 and (pred > 127).any():
                    mp, mt = cv2.moments(pred, True), cv2.moments(masks[t], True)
                    dp = np.array([mt["m10"] / mt["m00"] - mp["m10"] / mp["m00"],
                                   mt["m01"] / mt["m00"] - mp["m01"] / mp["m00"]])
                    cur[:2, 2] += 0.5 * dp
            T[t] = cur[:2]
            prev_gray = gray
            t += direction
            if progress and t % 5 == 0:
                progress(min(1.0, abs(t - key_idx) / n), "Analyse du mouvement de l'objet")
    return smooth_transforms(T, key_idx)


def decompose(T: np.ndarray) -> np.ndarray:
    """(N,2,3) -> (N,4) [tx, ty, log(scale), angle]."""
    a, b = T[:, 0, 0], T[:, 1, 0]
    scale = np.sqrt(a * a + b * b)
    angle = np.unwrap(np.arctan2(b, a))
    return np.stack([T[:, 0, 2], T[:, 1, 2], np.log(np.maximum(scale, 1e-6)), angle], axis=1)


def compose(params: np.ndarray) -> np.ndarray:
    tx, ty, ls, ang = params.T
    s = np.exp(ls)
    T = np.zeros((len(params), 2, 3))
    T[:, 0, 0], T[:, 0, 1], T[:, 0, 2] = s * np.cos(ang), -s * np.sin(ang), tx
    T[:, 1, 0], T[:, 1, 1], T[:, 1, 2] = s * np.sin(ang), s * np.cos(ang), ty
    return T


def smooth_transforms(T: np.ndarray, key_idx: int) -> np.ndarray:
    """Supprime le tremblement (jitter) du suivi : lissage gaussien des paramètres."""
    if len(T) < 4:
        return T
    params = decompose(T)
    smoothed = params.copy()
    smoothed[:, :2] = maskops.gaussian_smooth_1d(params[:, :2], 1.2)
    smoothed[:, 2:] = maskops.gaussian_smooth_1d(params[:, 2:], 2.5)
    out = compose(smoothed)
    # La keyframe reste exactement l'identité (l'élément y est généré "en place").
    offset = np.eye(2, 3) - out[key_idx]
    weights = np.exp(-0.5 * ((np.arange(len(T)) - key_idx) / 3.0) ** 2)[:, None, None]
    return out + offset * weights


def rigid_residual_flow(
    key_frame: np.ndarray, frame: np.ndarray, T: np.ndarray, region: np.ndarray
) -> np.ndarray | None:
    """Flux résiduel (mode "déformable") : après alignement rigide, flux optique dense
    DIS entre la keyframe recalée et la frame t, fortement lissé, limité à l'objet."""
    h, w = frame.shape[:2]
    aligned = cv2.warpAffine(key_frame, T, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    bb = maskops.bbox(region)
    if bb is None:
        return None
    x0, y0, x1, y1 = maskops.expand_box(bb, 0.2, w, h)
    try:
        dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    except AttributeError:
        return None
    # flux frame -> aligned : pour chaque pixel de t, où le chercher dans l'image recalée
    flow = dis.calc(_gray(frame[y0:y1, x0:x1]), _gray(aligned[y0:y1, x0:x1]), None)
    sigma = max(2.0, 0.04 * max(x1 - x0, y1 - y0))
    flow = cv2.GaussianBlur(flow, (0, 0), sigma)
    weight = maskops.feather(region[y0:y1, x0:x1], sigma)[..., None]
    full = np.zeros((h, w, 2), np.float32)
    full[y0:y1, x0:x1] = flow * weight
    return full


# --------------------------------------------------------------------------------------
# Mouvement de caméra
# --------------------------------------------------------------------------------------
def estimate_camera(
    frames: np.ndarray, masks: np.ndarray, key_idx: int, progress: Progress | None = None
) -> np.ndarray:
    """Homographies (N,3,3) frame t -> keyframe, estimées sur le décor (objet exclu)."""
    n, h, w = frames.shape[:3]
    s = min(1.0, 960 / max(h, w))
    S = np.diag([s, s, 1.0])
    S_inv = np.diag([1 / s, 1 / s, 1.0])
    size = (int(w * s), int(h * s))

    def small(i):
        return cv2.resize(_gray(frames[i]), size, interpolation=cv2.INTER_AREA)

    def bg_mask(i):
        m = cv2.resize(masks[i], size, interpolation=cv2.INTER_NEAREST)
        return cv2.bitwise_not(maskops.dilate(m, 8))

    G = np.zeros((n, 3, 3))
    G[key_idx] = np.eye(3)
    for direction in (1, -1):
        prev_small = small(key_idx)
        t = key_idx + direction
        while 0 <= t < n:
            prev = t - direction
            cur_small = small(t)
            H = np.eye(3)
            pts = cv2.goodFeaturesToTrack(prev_small, 600, 0.01, 8, mask=bg_mask(prev))
            if pts is not None and len(pts) >= 12:
                p_prev, p_cur = _track_features(prev_small, cur_small, pts)
                if len(p_prev) >= 12:
                    disp = np.median(np.linalg.norm((p_cur - p_prev).reshape(-1, 2), axis=1))
                    if disp > 0.25:  # caméra fixe -> identité exacte (zéro micro-tremblement)
                        Hs, inl = cv2.findHomography(p_cur, p_prev, cv2.RANSAC, 2.0)
                        if Hs is not None and inl is not None and inl.sum() >= 10:
                            H = S_inv @ Hs @ S  # points de t -> points de prev (pleine résolution)
            G[t] = G[prev] @ H
            prev_small = cur_small
            t += direction
            if progress and t % 5 == 0:
                progress(min(1.0, abs(t - key_idx) / n), "Analyse du mouvement de caméra")
    return G
