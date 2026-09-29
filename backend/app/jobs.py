"""File de jobs en arrière-plan (un seul job IA à la fois : le GPU/MPS n'aime pas partager)."""
from __future__ import annotations

import logging
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable

from . import storage

log = logging.getLogger(__name__)


@dataclass
class Job:
    id: str
    status: str = "queued"
    progress: float = 0.0
    stage: str = "🦄 En file d'attente..."
    message: str = ""
    error: str | None = None
    result: dict | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def view(self) -> dict[str, Any]:
        return {
            "id": self.id, "status": self.status, "progress": round(self.progress, 4),
            "stage": self.stage, "message": self.message, "error": self.error,
            "result": self.result, "created_at": self.created_at, "updated_at": self.updated_at,
        }


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="licornia-job")

    def submit(self, fn: Callable[[Job, Callable[[float, str], None]], dict]) -> Job:
        job = Job(id=storage.new_id())
        with self._lock:
            self._jobs[job.id] = job

        def progress(value: float, stage: str) -> None:
            with self._lock:
                job.progress = max(job.progress, min(1.0, float(value)))
                job.stage = stage
                job.updated_at = time.time()

        def runner() -> None:
            with self._lock:
                job.status = "running"
                job.updated_at = time.time()
            try:
                result = fn(job, progress)
                with self._lock:
                    job.result, job.status, job.progress = result, "done", 1.0
                    job.stage = "🎉 Terminé ! Much wow."
            except Exception as exc:  # noqa: BLE001
                log.error("Job %s en erreur :\n%s", job.id, traceback.format_exc())
                with self._lock:
                    job.status, job.error = "error", str(exc) or exc.__class__.__name__
                    job.stage = "💥 Oups, la licorne a trébuché"
            finally:
                job.updated_at = time.time()

        self._pool.submit(runner)
        return job

    def get(self, job_id: str) -> Job:
        with self._lock:
            return self._jobs[job_id]

    def shutdown(self) -> None:
        self._pool.shutdown(wait=False, cancel_futures=True)


manager = JobManager()
