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


class FxRateRowOut(BaseModel):
    rate_date: date
    currency: str
    usd_rate: float
    source: str
