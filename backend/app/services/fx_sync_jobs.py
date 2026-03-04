from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import date

from app.db import SessionLocal
from app.services.fx import sync_fx_rates


@dataclass
class FxSyncJobState:
    job_id: str
    status: str = "running"  # running | success | partial | error
    started_at: float = field(default_factory=lambda: time.time())
    updated_at: float = field(default_factory=lambda: time.time())
    provider: str | None = None
    provider_index: int = 0
    provider_total: int = 0
    day_total: int = 0
    day_done: int = 0
    missing_total: int = 0
    missing_remaining: int = 0
    rows_upserted: int = 0
    message: str = ""
    error: str | None = None
    result: dict[str, int] | None = None

    def to_dict(self) -> dict:
        pct = 0
        if self.missing_total > 0:
            pct = int(round((self.missing_total - self.missing_remaining) * 100 / self.missing_total))
            pct = max(0, min(100, pct))
        elif self.day_total > 0:
            pct = int(round(self.day_done * 100 / self.day_total))
            pct = max(0, min(100, pct))
        return {
            "job_id": self.job_id,
            "status": self.status,
            "started_at": self.started_at,
            "updated_at": self.updated_at,
            "progress_percent": pct,
            "provider": self.provider,
            "provider_index": self.provider_index,
            "provider_total": self.provider_total,
            "day_total": self.day_total,
            "day_done": self.day_done,
            "missing_total": self.missing_total,
            "missing_remaining": self.missing_remaining,
            "rows_upserted": self.rows_upserted,
            "message": self.message,
            "error": self.error,
            "result": self.result,
        }


_lock = threading.Lock()
_jobs: dict[str, FxSyncJobState] = {}


def get_job(job_id: str) -> FxSyncJobState | None:
    with _lock:
        return _jobs.get(job_id)


def start_fx_sync_job(*, start: date, end: date, currencies: list[str] | None, source: str | None) -> FxSyncJobState:
    job_id = uuid.uuid4().hex
    job = FxSyncJobState(job_id=job_id)
    with _lock:
        _jobs[job_id] = job

    def progress_cb(update: dict):
        with _lock:
            j = _jobs.get(job_id)
            if not j:
                return
            j.updated_at = time.time()
            for k, v in update.items():
                if hasattr(j, k):
                    setattr(j, k, v)

    def run():
        db = SessionLocal()
        try:
            result = sync_fx_rates(
                db,
                start=start,
                end=end,
                currencies=currencies,
                source=source,
                progress_cb=progress_cb,
            )
            with _lock:
                j = _jobs.get(job_id)
                if j:
                    j.result = result
                    j.status = j.status if j.status in ("success", "partial") else "success"
                    j.updated_at = time.time()
        except Exception as e:
            with _lock:
                j = _jobs.get(job_id)
                if j:
                    j.status = "error"
                    j.error = str(e)
                    j.updated_at = time.time()
        finally:
            db.close()

    t = threading.Thread(target=run, name=f"fx-sync-{job_id}", daemon=True)
    t.start()
    return job

