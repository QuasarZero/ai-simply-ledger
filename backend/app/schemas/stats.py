from __future__ import annotations

from pydantic import BaseModel


class Totals(BaseModel):
    income: float
    expense: float
    net: float
    currency: str


class ByDay(BaseModel):
    date: str
    income: float
    expense: float


class ByCategory(BaseModel):
    category_id: int
    name: str
    income: float
    expense: float


class SummaryOut(BaseModel):
    totals: Totals
    by_day: list[ByDay]
    by_category: list[ByCategory]

