"""Stockage sur disque.

- workspace/ : fichiers de travail (uploads, proxys, masques, jobs) — jetables.
- elements/YOUR DAIL CLIPS/<date>_<slug>_<id>/ : TOUS les résultats finaux + assets :
    final.mp4        la vidéo modifiée (H.264 + son d'origine)
    source.mp4       la vidéo d'origine (pour la comparaison avant/après)
    mask_track.mp4   visualisation du suivi de l'objet
    clean_plate.mp4  le décor sans l'objet d'origine
    element.png      l'élément incrusté (détouré, RGBA)
    preview.jpg      vignette
    recipe.json      prompt, réglages, moteurs utilisés, temps de calcul
"""
from __future__ import annotations

import json
import re
import shutil
import time
import unicodedata
import uuid
from pathlib import Path
from urllib.parse import quote

import cv2
import numpy as np

from .config import settings

_ID_RE = re.compile(r"^[a-f0-9]{12}$")
_ENTRY_RE = re.compile(r"^[A-Za-z0-9_\-]{1,120}$")


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def _check(identifier: str, pattern: re.Pattern = _ID_RE) -> str:
    if not pattern.match(identifier or ""):
        raise KeyError(identifier)
    return identifier


def slugify(text: str, max_len: int = 40) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").lower()
    return (text[:max_len].strip("-")) or "clip"


def _write_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


# ------------------------------------------------------------------------------- vidéos
def video_dir(video_id: str) -> Path:
    return settings.workspace_dir / "videos" / _check(video_id)


def save_video_meta(video_id: str, meta: dict) -> None:
    _write_json(video_dir(video_id) / "meta.json", meta)


def load_video_meta(video_id: str) -> dict:
    path = video_dir(video_id) / "meta.json"
    if not path.is_file():
        raise KeyError(video_id)
    return json.loads(path.read_text(encoding="utf-8"))


def proxy_path(video_id: str) -> Path:
    return video_dir(video_id) / "proxy.mp4"


def media_url(path: Path) -> str:
    rel = path.relative_to(settings.workspace_dir)
    return "/media/" + quote(rel.as_posix())


# ------------------------------------------------------------------------------- masques
def save_mask(video_id: str, mask: np.ndarray, meta: dict) -> str:
    mask_id = new_id()
    folder = video_dir(video_id) / "masks"
    folder.mkdir(exist_ok=True)
    cv2.imwrite(str(folder / f"{mask_id}.png"), mask)
    _write_json(folder / f"{mask_id}.json", meta)
    return mask_id


def load_mask(video_id: str, mask_id: str) -> tuple[np.ndarray, dict]:
    folder = video_dir(video_id) / "masks"
    png, meta = folder / f"{_check(mask_id)}.png", folder / f"{mask_id}.json"
    if not png.is_file():
        raise KeyError(mask_id)
    mask = cv2.imread(str(png), cv2.IMREAD_GRAYSCALE)
    return mask, json.loads(meta.read_text(encoding="utf-8"))


# ------------------------------------------------------------------------------- éléments
def element_path(element_id: str) -> Path:
    return settings.workspace_dir / "elements" / f"{_check(element_id)}.png"


# ------------------------------------------------------------------------------- jobs
def job_dir(job_id: str) -> Path:
    path = settings.workspace_dir / "jobs" / _check(job_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


# ------------------------------------------------------------------------------- galerie
def new_clip_entry(label: str) -> tuple[str, Path]:
    stamp = time.strftime("%Y-%m-%d_%H-%M-%S")
    entry_id = f"{stamp}_{slugify(label)}_{new_id()[:6]}"
    path = settings.clips_dir / entry_id
    path.mkdir(parents=True, exist_ok=False)
    return entry_id, path


def clip_dir(entry_id: str) -> Path:
    path = (settings.clips_dir / _check(entry_id, _ENTRY_RE)).resolve()
    if settings.clips_dir.resolve() not in path.parents:
        raise KeyError(entry_id)
    return path


def clip_url(entry_id: str, filename: str) -> str:
    return f"/clips/{quote(entry_id)}/{quote(filename)}"


def write_recipe(entry_id: str, recipe: dict) -> None:
    _write_json(clip_dir(entry_id) / "recipe.json", recipe)


def describe_clip(entry_id: str) -> dict | None:
    folder = clip_dir(entry_id)
    recipe_path = folder / "recipe.json"
    if not recipe_path.is_file():
        return None
    recipe = json.loads(recipe_path.read_text(encoding="utf-8"))
    files = {
        name: clip_url(entry_id, name)
        for name in ("final.mp4", "source.mp4", "mask_track.mp4", "clean_plate.mp4", "element.png", "preview.jpg")
        if (folder / name).is_file()
    }
    return {"id": entry_id, "folder": str(folder), "files": files, **recipe}


def list_clips(limit: int = 200) -> list[dict]:
    if not settings.clips_dir.is_dir():
        return []
    entries = []
    for folder in sorted(settings.clips_dir.iterdir(), reverse=True):
        if folder.is_dir() and _ENTRY_RE.match(folder.name):
            try:
                info = describe_clip(folder.name)
            except (KeyError, ValueError, json.JSONDecodeError):
                continue
            if info:
                entries.append(info)
        if len(entries) >= limit:
            break
    return entries


def delete_clip(entry_id: str) -> None:
    folder = clip_dir(entry_id)
    if not folder.is_dir():
        raise KeyError(entry_id)
    shutil.rmtree(folder)
