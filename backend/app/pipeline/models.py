"""Chargement paresseux (et unique) des modèles IA lourds.

Tous les modèles sont téléchargés automatiquement depuis Hugging Face / GitHub au premier
usage puis mis en cache (~/.cache/huggingface et backend/models)."""
from __future__ import annotations

import logging
import threading
from typing import Any

from ..config import settings
from ..devices import diffusers_available, get_device, sam2_available, torch_available

log = logging.getLogger(__name__)

_lock = threading.RLock()
_cache: dict[str, Any] = {}


def _cached(key: str, factory):
    with _lock:
        if key not in _cache:
            log.info("Chargement du modèle %s ...", key)
            _cache[key] = factory()
            log.info("Modèle %s prêt", key)
        return _cache[key]


def sam2_image_predictor(model_id: str | None = None):
    if not sam2_available():
        return None
    model_id = model_id or settings.sam2_model

    def factory():
        from sam2.sam2_image_predictor import SAM2ImagePredictor

        return SAM2ImagePredictor.from_pretrained(model_id, device=get_device())

    return _cached(f"sam2-image:{model_id}", factory)


def sam2_video_predictor(model_id: str | None = None):
    if not sam2_available():
        return None
    model_id = model_id or settings.sam2_model

    def factory():
        from sam2.sam2_video_predictor import SAM2VideoPredictor

        return SAM2VideoPredictor.from_pretrained(model_id, device=get_device())

    return _cached(f"sam2-video:{model_id}", factory)


def inpaint_pipeline():
    """Pipeline de diffusion "inpainting" (SDXL par défaut, configurable via INPAINT_MODEL)."""
    if not diffusers_available():
        return None

    def factory():
        import torch
        from diffusers import AutoPipelineForInpainting

        device = get_device()
        dtype = torch.float16 if device in {"cuda", "mps"} else torch.float32
        kwargs: dict[str, Any] = {"torch_dtype": dtype}
        try:
            pipe = AutoPipelineForInpainting.from_pretrained(
                settings.inpaint_model, variant="fp16" if dtype == torch.float16 else None, **kwargs
            )
        except Exception:  # noqa: BLE001 - le dépôt n'a pas forcément de variante fp16
            pipe = AutoPipelineForInpainting.from_pretrained(settings.inpaint_model, **kwargs)
        pipe = pipe.to(device)
        if device == "mps":
            # Mémoire unifiée des Mac : on découpe l'attention pour éviter les pics de RAM.
            pipe.enable_attention_slicing()
        if hasattr(pipe, "set_progress_bar_config"):
            pipe.set_progress_bar_config(disable=True)
        return pipe

    return _cached(f"inpaint:{settings.inpaint_model}", factory)


def lama_model():
    """LaMa (big-lama TorchScript) : excellent pour "boucher" un décor jamais visible.
    Exécuté sur CPU (FFT pas toujours supportées en MPS) : utilisé sur 1 seule image."""
    if not torch_available():
        return None

    def factory():
        import torch

        path = settings.models_dir / "big-lama.pt"
        if not path.is_file():
            path.parent.mkdir(parents=True, exist_ok=True)
            torch.hub.download_url_to_file(settings.lama_url, str(path), progress=False)
        model = torch.jit.load(str(path), map_location="cpu")
        model.eval()
        return model

    try:
        return _cached("lama", factory)
    except Exception:  # noqa: BLE001 - pas de réseau, etc. -> repli OpenCV
        log.exception("LaMa indisponible, repli sur l'inpainting OpenCV")
        with _lock:
            _cache["lama"] = None  # on ne retente pas à chaque frame
        return None


def unload_all() -> None:
    with _lock:
        _cache.clear()
    if torch_available():
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            torch.mps.empty_cache()
