"""Télécharge les modèles à l'avance : `python -m app.prefetch` (depuis backend/).

Sinon ils sont téléchargés automatiquement au premier usage (et mis en cache)."""
from __future__ import annotations

import logging

from .config import ensure_dirs, settings
from .devices import capabilities
from .pipeline import models

logging.basicConfig(level=logging.INFO, format="%(message)s")


def main() -> None:
    ensure_dirs()
    caps = capabilities()
    print(f"🧠 Capacités : {caps}")
    if caps["sam2"]:
        for model_id in dict.fromkeys((settings.sam2_model, settings.sam2_model_fast)):
            print(f"🎯 SAM2 : {model_id}")
            models.sam2_image_predictor(model_id)
            models.sam2_video_predictor(model_id)
    if caps["lama"]:
        print("🧽 LaMa (big-lama)")
        models.lama_model()
    if caps["diffusion"]:
        print(f"🎨 Diffusion : {settings.inpaint_model} (~7 Go pour SDXL)")
        models.inpaint_pipeline()
    print("✅ Modèles prêts. Much wow.")


if __name__ == "__main__":
    main()
