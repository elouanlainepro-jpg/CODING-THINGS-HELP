"""Détection des moteurs IA disponibles (torch / SAM2 / diffusers / ProPainter)."""
from __future__ import annotations

import functools
import importlib.util
import os
import shutil

from .config import settings

# Sur Mac (Apple Silicon), certains opérateurs ne sont pas encore implémentés en MPS :
# on autorise le repli CPU automatique plutôt que de planter.
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")


def _has_module(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


@functools.lru_cache(maxsize=1)
def torch_available() -> bool:
    return not settings.disable_ai and _has_module("torch")


@functools.lru_cache(maxsize=1)
def get_device() -> str:
    """Renvoie "cuda", "mps" ou "cpu" (ou la valeur forcée via DEVICE)."""
    if settings.device in {"cuda", "mps", "cpu"}:
        return settings.device
    if not torch_available():
        return "cpu"
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


@functools.lru_cache(maxsize=1)
def sam2_available() -> bool:
    return torch_available() and _has_module("sam2")


@functools.lru_cache(maxsize=1)
def diffusers_available() -> bool:
    return torch_available() and _has_module("diffusers") and _has_module("transformers")


def propainter_available() -> bool:
    root = settings.propainter_dir
    return bool(
        not settings.disable_ai
        and root is not None
        and (root / "inference_propainter.py").is_file()
    )


def ffmpeg_path() -> str | None:
    path = shutil.which("ffmpeg")
    if path:
        return path
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # pragma: no cover - dépend de l'environnement
        return None


def capabilities() -> dict:
    return {
        "device": get_device(),
        "torch": torch_available(),
        "sam2": sam2_available(),
        "diffusion": diffusers_available(),
        "propainter": propainter_available(),
        "lama": torch_available(),
        "ffmpeg": ffmpeg_path() is not None,
        "ai_disabled": settings.disable_ai,
        "models": {
            "sam2": settings.sam2_model,
            "inpaint": settings.inpaint_model,
        },
    }
