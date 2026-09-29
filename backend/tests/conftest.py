"""Fixtures : scène synthétique (décor texturé + disque rouge mobile + ombre portée).

Les tests tournent SANS modèle IA (DISABLE_AI=1) : ils valident toute la chaîne
classique (GrabCut, flux optique, reconstruction temporelle, compositing, encodage)."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import numpy as np
import pytest

_TMP = Path(tempfile.mkdtemp(prefix="licornia-tests-"))
os.environ.update(
    DISABLE_AI="1",
    CLIPS_DIR=str(_TMP / "YOUR DAIL CLIPS"),
    WORKSPACE_DIR=str(_TMP / "workspace"),
    MODELS_DIR=str(_TMP / "models"),
    MAX_SECONDS="10",
)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cv2  # noqa: E402

W, H, N = 320, 240, 24
RADIUS = 26


def _background(rng: np.random.Generator) -> np.ndarray:
    big_w, big_h = W + 80, H + 20
    yy, xx = np.mgrid[0:big_h, 0:big_w].astype(np.float32)
    base = np.dstack([90 + 60 * xx / big_w, 120 + 40 * yy / big_h, 100 + 30 * np.sin(xx / 40)])
    noise = cv2.GaussianBlur(rng.normal(0, 40, (big_h, big_w, 3)).astype(np.float32), (0, 0), 2.0)
    img = np.clip(base + noise, 0, 255).astype(np.uint8)
    for _ in range(60):  # des "objets" du décor pour que le suivi caméra ait des repères
        x, y = int(rng.integers(0, big_w)), int(rng.integers(0, big_h))
        color = tuple(int(c) for c in rng.integers(30, 230, 3))
        if rng.random() < 0.5:
            cv2.rectangle(img, (x, y), (x + int(rng.integers(4, 18)), y + int(rng.integers(4, 18))), color, -1)
        else:
            cv2.circle(img, (x, y), int(rng.integers(2, 8)), color, -1)
    return img


def disk_center(t: int) -> tuple[int, int]:
    return 70 + 7 * t, 120


def render_scene(pan: bool = True):
    """Renvoie (frames, masques vérité terrain, décors vérité terrain)."""
    rng = np.random.default_rng(42)
    big = _background(rng)
    frames, masks, bgs = [], [], []
    for t in range(N):
        off = 2 * t if pan else 0
        bg = big[10:10 + H, off:off + W].copy()
        frame = bg.copy()
        cx, cy = disk_center(t)
        shadow = np.zeros((H, W), np.uint8)
        cv2.ellipse(shadow, (cx + 20, cy + RADIUS - 2), (30, 9), 0, 0, 360, 255, -1)
        frame[shadow > 0] = (frame[shadow > 0] * 0.55).astype(np.uint8)
        mask = np.zeros((H, W), np.uint8)
        cv2.circle(mask, (cx, cy), RADIUS, 255, -1)
        # disque rouge ombré (dégradé) + petit reflet : un objet "réaliste"
        yy, xx = np.mgrid[0:H, 0:W]
        d = np.sqrt((xx - cx + 8) ** 2 + (yy - cy + 8) ** 2) / (RADIUS * 1.6)
        shade = np.clip(1.1 - d, 0.45, 1.0)
        red = np.dstack([30 * shade, 40 * shade, 220 * shade]).astype(np.uint8)
        frame[mask > 0] = red[mask > 0]
        frames.append(frame)
        masks.append(mask)
        bgs.append(bg)
    return np.stack(frames), np.stack(masks), np.stack(bgs)


@pytest.fixture(scope="session")
def scene():
    return render_scene()


@pytest.fixture(scope="session")
def scene_video(scene) -> Path:
    from app.pipeline.video_io import VideoWriter

    path = _TMP / "scene.mp4"
    with VideoWriter(path, W, H, 24.0, crf=8, preset="veryfast") as writer:
        for frame in scene[0]:
            writer.write(frame)
    return path


def iou(a: np.ndarray, b: np.ndarray) -> float:
    a, b = a > 0, b > 0
    union = (a | b).sum()
    return float((a & b).sum() / union) if union else 1.0
