from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class FxSyncIn(BaseModel):
    start: date
    end: date
    currencies: list[str] | None = Field(default=None, description="Optional currency list (default: FX_CURRENCIES)")


class FxSyncOut(BaseModel):
    days: int
    currencies: int
    rows_upserted: int

