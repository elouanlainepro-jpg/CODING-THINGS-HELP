"""API FastAPI de LICORN·IA SWAP 3000.

Lancement : `uvicorn app.main:app --reload --port 8000` (depuis le dossier backend/)."""
from __future__ import annotations

import logging
import threading
from collections import OrderedDict
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import storage
from .config import REPO_ROOT, ensure_dirs, settings
from .devices import capabilities
from .jobs import manager
from .pipeline import maskops
from .pipeline.segmentation import Point, segment
from .pipeline.video_io import make_proxy, read_frame
from .schemas import ReplaceRequest, SegmentRequest, SegmentResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("licornia")

VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}
CHUNK = 1024 * 1024

ensure_dirs()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_dirs()
    log.info("🦄 Clips sauvegardés dans : %s", settings.clips_dir)
    log.info("🧠 Capacités IA : %s", capabilities())
    yield
    manager.shutdown()


app = FastAPI(title="LICORN·IA SWAP 3000", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------------------ utilitaires
def _save_upload(upload: UploadFile, dest: Path) -> int:
    limit = settings.max_upload_mb * CHUNK
    size = 0
    with dest.open("wb") as out:
        while chunk := upload.file.read(CHUNK):
            size += len(chunk)
            if size > limit:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(413, f"Fichier trop lourd (max {settings.max_upload_mb} Mo)")
            out.write(chunk)
    return size


class _FrameCache:
    """Garde les dernières frames décodées : ajouter des clics sur la même image est instantané."""

    def __init__(self, size: int = 8) -> None:
        self._data: OrderedDict[tuple[str, int], np.ndarray] = OrderedDict()
        self._size = size
        self._lock = threading.Lock()

    def get(self, video_id: str, index: int) -> np.ndarray:
        key = (video_id, index)
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
                return self._data[key]
        frame = read_frame(storage.proxy_path(video_id), index)
        with self._lock:
            self._data[key] = frame
            while len(self._data) > self._size:
                self._data.popitem(last=False)
        return frame


_frames = _FrameCache()


# ------------------------------------------------------------------------------ routes
@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "clips_dir": str(settings.clips_dir), "capabilities": capabilities()}


@app.post("/api/videos")
def upload_video(file: UploadFile = File(...)) -> dict:
    ext = Path(file.filename or "video.mp4").suffix.lower()
    if ext not in VIDEO_EXT:
        raise HTTPException(415, f"Format non supporté ({ext}). Formats : {', '.join(sorted(VIDEO_EXT))}")
    video_id = storage.new_id()
    folder = storage.video_dir(video_id)
    folder.mkdir(parents=True)
    original = folder / f"original{ext}"
    _save_upload(file, original)
    try:
        info, warnings = make_proxy(
            original, storage.proxy_path(video_id),
            settings.max_process_side, settings.max_seconds, settings.max_fps,
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("Proxy impossible")
        raise HTTPException(422, f"Vidéo illisible : {exc}") from exc
    finally:
        original.unlink(missing_ok=True)  # le proxy devient la source de vérité
    if info.frame_count < 2:
        raise HTTPException(422, "La vidéo doit contenir au moins 2 images.")
    meta = {
        "id": video_id,
        "original_name": file.filename,
        **info.to_dict(),
        "proxy_url": storage.media_url(storage.proxy_path(video_id)),
        "warnings": warnings,
    }
    storage.save_video_meta(video_id, meta)
    return meta


@app.get("/api/videos/{video_id}")
def get_video(video_id: str) -> dict:
    try:
        return storage.load_video_meta(video_id)
    except KeyError as exc:
        raise HTTPException(404, "Vidéo inconnue") from exc


@app.post("/api/segment", response_model=SegmentResponse)
def segment_click(req: SegmentRequest) -> SegmentResponse:
    try:
        meta = storage.load_video_meta(req.video_id)
    except KeyError as exc:
        raise HTTPException(404, "Vidéo inconnue") from exc
    index = min(req.frame_index, meta["frame_count"] - 1)
    frame = _frames.get(req.video_id, index)
    h, w = frame.shape[:2]
    points = [Point(p.x * (w - 1), p.y * (h - 1), p.label) for p in req.points]
    if not any(p.label == 1 for p in points):
        raise HTTPException(400, "Il faut au moins un clic « inclure » sur l'objet.")
    result = segment(frame, points, cache_key=(req.video_id, index))
    mask = result.mask
    bb = maskops.bbox(mask)
    if bb is None:
        raise HTTPException(422, "Rien trouvé à cet endroit, essaie de cliquer au centre de l'objet 🦄")
    mask_id = storage.save_mask(
        req.video_id, mask,
        {"frame_index": index, "points": [p.model_dump() for p in req.points],
         "engine": result.engine, "score": result.score},
    )
    return SegmentResponse(
        mask_id=mask_id,
        frame_index=index,
        engine=result.engine,
        score=round(result.score, 4),
        area=round(float((mask > 0).mean()), 5),
        bbox=[bb[0] / w, bb[1] / h, bb[2] / w, bb[3] / h],
        mask_png=maskops.mask_to_png_b64(mask),
        contours=maskops.contours_normalized(mask),
    )


@app.post("/api/elements")
def upload_element(file: UploadFile = File(...)) -> dict:
    ext = Path(file.filename or "element.png").suffix.lower()
    if ext not in IMAGE_EXT:
        raise HTTPException(415, "Image attendue (png, jpg, webp)")
    element_id = storage.new_id()
    tmp = settings.workspace_dir / "elements" / f"{element_id}{ext}.upload"
    _save_upload(file, tmp)
    img = cv2.imread(str(tmp), cv2.IMREAD_UNCHANGED)
    tmp.unlink(missing_ok=True)
    if img is None:
        raise HTTPException(422, "Image illisible")
    if img.dtype != np.uint8:  # PNG 16 bits (exports pro) -> 8 bits
        img = (img.astype(np.float32) / (65535.0 if img.dtype == np.uint16 else img.max() or 1) * 255).astype(np.uint8)
    cv2.imwrite(str(storage.element_path(element_id)), img)  # normalisé en PNG (alpha conservé)
    return {
        "element_id": element_id,
        "url": storage.media_url(storage.element_path(element_id)),
        "width": int(img.shape[1]),
        "height": int(img.shape[0]),
        "has_alpha": bool(img.ndim == 3 and img.shape[2] == 4),
    }


@app.post("/api/replace")
def start_replace(req: ReplaceRequest) -> dict:
    try:
        storage.load_video_meta(req.video_id)
        storage.load_mask(req.video_id, req.mask_id)
        if req.element_id and not storage.element_path(req.element_id).is_file():
            raise KeyError(req.element_id)
    except KeyError as exc:
        raise HTTPException(404, f"Ressource inconnue : {exc}") from exc
    if req.mode == "replace" and not req.prompt.strip() and not req.element_id:
        raise HTTPException(400, "Décris le nouvel élément (ou importe une image) ✍️")

    from .pipeline.replacer import run_replace

    job = manager.submit(lambda job, progress: run_replace(job.id, req, progress))
    return {"job_id": job.id}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    try:
        return manager.get(job_id).view()
    except KeyError as exc:
        raise HTTPException(404, "Job inconnu") from exc


@app.get("/api/gallery")
def gallery() -> dict:
    return {"clips_dir": str(settings.clips_dir), "items": storage.list_clips()}


@app.delete("/api/gallery/{entry_id}")
def delete_entry(entry_id: str) -> dict:
    try:
        storage.delete_clip(entry_id)
    except KeyError as exc:
        raise HTTPException(404, "Clip introuvable") from exc
    return {"deleted": entry_id}


# ------------------------------------------------------------------------------ fichiers
app.mount("/clips", StaticFiles(directory=settings.clips_dir), name="clips")
# seuls les proxys vidéo et les éléments importés sont exposés (pas les fichiers de travail)
app.mount("/media/videos", StaticFiles(directory=settings.workspace_dir / "videos"), name="media-videos")
app.mount("/media/elements", StaticFiles(directory=settings.workspace_dir / "elements"), name="media-elements")

_dist = REPO_ROOT / "frontend" / "dist"
if _dist.is_dir():  # mode "production" : le backend sert aussi l'interface
    app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")
