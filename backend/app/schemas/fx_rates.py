from __future__ import annotations

from pydantic import BaseModel, Field
from datetime import date
from datetime import date


class FxSyncIn(BaseModel):
    start: date
    end: date
    currencies: list[str] | None = Field(default=None, description="Optional currency list (default: FX_CURRENCIES)")


class FxSyncOut(BaseModel):
    days: int
    currencies: int
    rows_upserted: int


class FxSyncJobStartOut(BaseModel):
    job_id: str


class FxSyncJobStatusOut(BaseModel):
    job_id: str
    status: str
    started_at: float
    updated_at: float
    progress_percent: int
    provider: str | None = None
    provider_index: int
    provider_total: int
    day_total: int
    day_done: int
    missing_total: int
    missing_remaining: int
    rows_upserted: int
    message: str
    error: str | None = None
    result: dict[str, int] | None = None


class FxRateRowOut(BaseModel):
    rate_date: date
    currency: str
    usd_rate: float
    source: str
