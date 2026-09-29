"""Lecture / écriture vidéo : proxy H.264 à cadence fixe, chargement en memmap, encodage final."""
from __future__ import annotations

import logging
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable, Iterator

import cv2
import numpy as np

from ..devices import ffmpeg_path

log = logging.getLogger(__name__)


@dataclass
class VideoInfo:
    width: int
    height: int
    fps: float
    frame_count: int

    @property
    def duration(self) -> float:
        return self.frame_count / self.fps if self.fps else 0.0

    def to_dict(self) -> dict:
        return {**asdict(self), "duration": self.duration}


def probe(path: Path) -> VideoInfo:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError(f"Impossible d'ouvrir la vidéo : {path.name}")
    try:
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
        count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    finally:
        cap.release()
    if fps <= 1 or fps > 240:
        fps = 30.0
    if width <= 0 or height <= 0:
        raise ValueError("Vidéo illisible (dimensions nulles).")
    return VideoInfo(width, height, fps, count)


def _even_size(width: int, height: int, max_side: int) -> tuple[int, int]:
    scale = min(1.0, max_side / max(width, height))
    w = max(2, int(round(width * scale / 2)) * 2)
    h = max(2, int(round(height * scale / 2)) * 2)
    return w, h


def _run_ffmpeg(args: list[str]) -> None:
    exe = ffmpeg_path()
    if not exe:
        raise RuntimeError("ffmpeg introuvable")
    with tempfile.TemporaryFile() as err:
        proc = subprocess.run([exe, "-hide_banner", "-loglevel", "error", "-y", *args], stderr=err)
        if proc.returncode != 0:
            err.seek(0)
            raise RuntimeError(f"ffmpeg a échoué : {err.read().decode(errors='ignore')[-800:]}")


def make_proxy(
    src: Path, dst: Path, max_side: int, max_seconds: int, max_fps: int
) -> tuple[VideoInfo, list[str]]:
    """Crée la copie de travail : H.264 lisible par tous les navigateurs, cadence fixe (CFR),
    rotation appliquée, résolution plafonnée. Le frontend ET le backend lisent ce même fichier,
    ce qui garantit que l'index de frame cliqué correspond exactement à celui traité."""
    warnings: list[str] = []
    info = probe(src)
    fps = min(info.fps, float(max_fps))
    if info.duration and info.duration > max_seconds:
        warnings.append(
            f"Vidéo tronquée à {max_seconds}s (réglable via MAX_SECONDS) : le traitement IA est gourmand !"
        )
    if ffmpeg_path():
        # ffmpeg applique la rotation (vidéos iPhone) avant le scale : on laisse ffmpeg choisir
        # la taille en respectant le plafond, dimensions paires pour yuv420p.
        scale = (
            f"scale='if(gte(iw,ih),min({max_side},iw),-2)':'if(gte(iw,ih),-2,min({max_side},ih))'"
            ",scale=trunc(iw/2)*2:trunc(ih/2)*2"
        )
        _run_ffmpeg(
            [
                "-i", str(src),
                "-t", str(max_seconds),
                "-map", "0:v:0", "-map", "0:a:0?",
                "-vf", f"{scale},fps={fps:.6f},format=yuv420p",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "16",
                "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart",
                str(dst),
            ]
        )
    else:  # repli sans ffmpeg (rare : imageio-ffmpeg est dans requirements)
        warnings.append("ffmpeg absent : proxy encodé par OpenCV (lecture navigateur incertaine).")
        w, h = _even_size(info.width, info.height, max_side)
        writer = _cv2_writer(dst, w, h, fps)
        limit = int(max_seconds * fps)
        for i, frame in enumerate(iter_frames(src)):
            if i >= limit:
                break
            writer.write(cv2.resize(frame, (w, h), interpolation=cv2.INTER_AREA))
        writer.release()
    proxy_info = probe(dst)
    # Le nombre de frames annoncé par le conteneur peut être approximatif : on compte réellement.
    proxy_info.frame_count = count_frames(dst)
    return proxy_info, warnings


def count_frames(path: Path) -> int:
    cap = cv2.VideoCapture(str(path))
    n = 0
    while cap.grab():
        n += 1
    cap.release()
    return n


def iter_frames(path: Path) -> Iterator[np.ndarray]:
    cap = cv2.VideoCapture(str(path))
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            yield frame
    finally:
        cap.release()


def read_frame(path: Path, index: int) -> np.ndarray:
    """Lit une frame précise. On se positionne un peu avant puis on décode séquentiellement :
    le seek direct d'OpenCV n'est pas toujours exact à la frame près."""
    cap = cv2.VideoCapture(str(path))
    try:
        start = max(0, index - 12)
        cap.set(cv2.CAP_PROP_POS_FRAMES, start)
        pos = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
        if pos != start:  # seek non supporté -> lecture depuis le début
            cap.release()
            cap = cv2.VideoCapture(str(path))
            pos = 0
        frame = None
        for _ in range(index - pos + 1):
            ok, frame = cap.read()
            if not ok:
                break
        if frame is None:
            raise IndexError(f"Frame {index} introuvable")
        return frame
    finally:
        cap.release()


def load_frames(
    path: Path,
    out_file: Path,
    size: tuple[int, int] | None = None,
    progress: Callable[[float], None] | None = None,
    expected: int | None = None,
) -> np.ndarray:
    """Charge toutes les frames dans un memmap disque (N,H,W,3) uint8 : pas d'explosion de RAM
    même pour des clips 1080p de plusieurs centaines de frames."""
    info = probe(path)
    total = expected or count_frames(path)
    w, h = size or (info.width, info.height)
    arr = np.lib.format.open_memmap(out_file, mode="w+", dtype=np.uint8, shape=(total, h, w, 3))
    n = 0
    for frame in iter_frames(path):
        if n >= total:
            break
        if frame.shape[1] != w or frame.shape[0] != h:
            frame = cv2.resize(frame, (w, h), interpolation=cv2.INTER_AREA)
        arr[n] = frame
        n += 1
        if progress and n % 10 == 0:
            progress(n / max(1, total))
    if n == 0:
        raise ValueError("Aucune frame lisible dans la vidéo.")
    if n < total:  # le conteneur mentait : on tronque proprement
        arr.flush()
        del arr
        tmp = np.load(out_file, mmap_mode="r")[:n].copy()
        np.save(out_file, tmp)
        arr = np.load(out_file, mmap_mode="r+")
    return arr


def _cv2_writer(path: Path, w: int, h: int, fps: float) -> cv2.VideoWriter:
    for fourcc in ("avc1", "mp4v"):
        writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*fourcc), fps, (w, h))
        if writer.isOpened():
            return writer
    raise RuntimeError("Aucun encodeur vidéo OpenCV disponible")


class VideoWriter:
    """Encodeur H.264 via un pipe ffmpeg (qualité "master", audio d'origine recopié)."""

    def __init__(
        self,
        path: Path,
        width: int,
        height: int,
        fps: float,
        audio_from: Path | None = None,
        crf: int = 14,
        preset: str = "medium",
    ) -> None:
        self.path = path
        self.size = (width, height)
        self._proc: subprocess.Popen | None = None
        self._cv: cv2.VideoWriter | None = None
        self._err = tempfile.TemporaryFile()
        exe = ffmpeg_path()
        if exe:
            args = [
                exe, "-hide_banner", "-loglevel", "error", "-y",
                "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{width}x{height}",
                "-r", f"{fps:.6f}", "-i", "-",
            ]
            if audio_from is not None:
                args += ["-i", str(audio_from), "-map", "0:v:0", "-map", "1:a:0?", "-c:a", "aac",
                         "-b:a", "192k", "-shortest"]
            args += [
                "-c:v", "libx264", "-preset", preset, "-crf", str(crf),
                "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path),
            ]
            self._proc = subprocess.Popen(
                args, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=self._err
            )
        else:
            self._cv = _cv2_writer(path, width, height, fps)

    def write(self, frame: np.ndarray) -> None:
        if frame.shape[1::-1] != self.size:
            frame = cv2.resize(frame, self.size, interpolation=cv2.INTER_AREA)
        frame = np.ascontiguousarray(frame, dtype=np.uint8)
        if self._proc is not None:
            assert self._proc.stdin is not None
            self._proc.stdin.write(frame.tobytes())
        else:
            assert self._cv is not None
            self._cv.write(frame)

    def close(self) -> None:
        if self._proc is not None:
            assert self._proc.stdin is not None
            self._proc.stdin.close()
            code = self._proc.wait()
            if code != 0:
                self._err.seek(0)
                msg = self._err.read().decode(errors="ignore")[-800:]
                raise RuntimeError(f"Encodage ffmpeg échoué : {msg}")
        if self._cv is not None:
            self._cv.release()
        self._err.close()

    def abort(self) -> None:
        """Interrompt l'encodage (erreur en cours de rendu) sans lever d'exception."""
        if self._proc is not None and self._proc.poll() is None:
            try:
                assert self._proc.stdin is not None
                self._proc.stdin.close()
            except OSError:
                pass
            self._proc.kill()
            self._proc.wait()
        if self._cv is not None:
            self._cv.release()
        self._err.close()

    def __enter__(self) -> "VideoWriter":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if exc_type is None:
            self.close()
        else:  # on n'écrase pas l'exception d'origine
            self.abort()


def save_thumbnail(frame: np.ndarray, path: Path, max_side: int = 640) -> None:
    h, w = frame.shape[:2]
    scale = min(1.0, max_side / max(h, w))
    if scale < 1:
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(path), frame, [cv2.IMWRITE_JPEG_QUALITY, 88])
