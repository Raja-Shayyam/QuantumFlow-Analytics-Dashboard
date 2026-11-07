"""In-memory background job manager so long quantum workloads never block the event loop."""

from __future__ import annotations

import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

Reporter = Callable[[float, str], None]


class JobManager:
    def __init__(self, max_workers: int = 2, max_jobs: int = 200) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="qf-job")
        self._lock = threading.Lock()
        self._jobs: dict[str, dict[str, Any]] = {}
        self._max_jobs = max_jobs

    def submit(self, kind: str, fn: Callable[[Reporter], Any], metadata: dict[str, Any] | None = None) -> dict:
        job_id = f"QF-{uuid.uuid4().hex[:6].upper()}"
        job = {
            "id": job_id,
            "kind": kind,
            "status": "queued",
            "progress": 0.0,
            "message": "Queued",
            "metadata": metadata or {},
            "result": None,
            "error": None,
            "created_at": time.time(),
            "started_at": None,
            "finished_at": None,
        }
        with self._lock:
            self._jobs[job_id] = job
            self._trim()
        self._executor.submit(self._run, job_id, fn)
        return self.get(job_id)  # type: ignore[return-value]

    def _update(self, job_id: str, **fields: Any) -> None:
        with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id].update(fields)

    def _run(self, job_id: str, fn: Callable[[Reporter], Any]) -> None:
        self._update(job_id, status="running", started_at=time.time(), message="Running")

        def report(progress: float, message: str) -> None:
            self._update(job_id, progress=max(0.0, min(1.0, progress)), message=message)

        try:
            result = fn(report)
            self._update(job_id, status="completed", progress=1.0, message="Completed", result=result, finished_at=time.time())
        except Exception as exc:  # surfaced to the client through the job record
            traceback.print_exc()
            self._update(job_id, status="failed", message="Failed", error=str(exc), finished_at=time.time())

    def _trim(self) -> None:
        if len(self._jobs) <= self._max_jobs:
            return
        finished = sorted(
            (j for j in self._jobs.values() if j["status"] in ("completed", "failed")), key=lambda j: j["created_at"]
        )
        for job in finished[: len(self._jobs) - self._max_jobs]:
            self._jobs.pop(job["id"], None)

    def get(self, job_id: str, include_result: bool = True) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            snapshot = dict(job)
        if not include_result:
            snapshot.pop("result", None)
        duration_end = snapshot["finished_at"] or time.time()
        snapshot["duration_s"] = round(duration_end - snapshot["started_at"], 2) if snapshot["started_at"] else None
        return snapshot

    def list(self, limit: int = 50) -> list[dict]:
        with self._lock:
            ids = [j["id"] for j in sorted(self._jobs.values(), key=lambda j: j["created_at"], reverse=True)[:limit]]
        return [job for job_id in ids if (job := self.get(job_id, include_result=False))]
