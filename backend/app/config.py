"""Configuration centralisée (variables d'environnement + fichier .env optionnel)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_dotenv(path: Path) -> None:
    """Mini-parseur .env (évite une dépendance) : KEY=VALUE, les variables déjà définies gagnent."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(REPO_ROOT / ".env")


def _env_path(name: str, default: Path) -> Path:
    value = os.environ.get(name)
    return Path(value).expanduser().resolve() if value else default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on", "oui"}


@dataclass(frozen=True)
class Settings:
    # --- Dossiers -------------------------------------------------------------
    elements_dir: Path
    clips_dir: Path  # <- toutes les vidéos traitées + assets finaux atterrissent ici
    workspace_dir: Path  # fichiers de travail (uploads, proxys, masques, caches)
    models_dir: Path

    # --- Vidéo ------------------------------------------------------------------
    max_process_side: int  # résolution max (plus grand côté) du proxy de travail
    max_seconds: int  # durée max importée
    max_fps: int
    max_upload_mb: int

    # --- IA ---------------------------------------------------------------------
    disable_ai: bool  # force les moteurs "classiques" OpenCV (tests, machines sans GPU)
    device: str  # "auto" | "mps" | "cuda" | "cpu"
    sam2_model: str
    sam2_model_fast: str
    inpaint_model: str
    propainter_dir: Path | None
    propainter_python: str | None
    propainter_max_side: int
    lama_url: str

    cors_origins: tuple[str, ...]
    keep_workdir: bool  # garde les fichiers intermédiaires (debug)


def _build_settings() -> Settings:
    elements_dir = _env_path("ELEMENTS_DIR", REPO_ROOT / "elements")
    propainter = os.environ.get("PROPAINTER_DIR")
    return Settings(
        elements_dir=elements_dir,
        clips_dir=_env_path("CLIPS_DIR", elements_dir / "YOUR DAIL CLIPS"),
        workspace_dir=_env_path("WORKSPACE_DIR", REPO_ROOT / "backend" / "workspace"),
        models_dir=_env_path("MODELS_DIR", REPO_ROOT / "backend" / "models"),
        max_process_side=_env_int("MAX_PROCESS_SIDE", 1920),
        max_seconds=_env_int("MAX_SECONDS", 60),
        max_fps=_env_int("MAX_FPS", 60),
        max_upload_mb=_env_int("MAX_UPLOAD_MB", 2048),
        disable_ai=_env_bool("DISABLE_AI", False),
        device=os.environ.get("DEVICE", "auto").lower(),
        sam2_model=os.environ.get("SAM2_MODEL", "facebook/sam2.1-hiera-base-plus"),
        sam2_model_fast=os.environ.get("SAM2_MODEL_FAST", "facebook/sam2.1-hiera-small"),
        inpaint_model=os.environ.get(
            "INPAINT_MODEL", "diffusers/stable-diffusion-xl-1.0-inpainting-0.1"
        ),
        propainter_dir=Path(propainter).expanduser().resolve() if propainter else None,
        propainter_python=os.environ.get("PROPAINTER_PYTHON") or None,
        propainter_max_side=_env_int("PROPAINTER_MAX_SIDE", 960),
        lama_url=os.environ.get(
            "LAMA_URL",
            "https://github.com/enesmsahin/simple-lama-inpainting/releases/download/v0.1.0/big-lama.pt",
        ),
        cors_origins=tuple(
            o.strip()
            for o in os.environ.get(
                "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
            ).split(",")
            if o.strip()
        ),
        keep_workdir=_env_bool("KEEP_WORKDIR", False),
    )


settings = _build_settings()


def ensure_dirs() -> None:
    for path in (
        settings.elements_dir,
        settings.clips_dir,
        settings.workspace_dir,
        settings.workspace_dir / "videos",
        settings.workspace_dir / "elements",
        settings.workspace_dir / "jobs",
        settings.models_dir,
    ):
        path.mkdir(parents=True, exist_ok=True)
