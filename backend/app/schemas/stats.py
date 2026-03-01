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


class PieSlice(BaseModel):
    id: int
    name: str
    value: float


class TopItem(BaseModel):
    id: int
    name: str
    value: float


class NameId(BaseModel):
    id: int
    name: str


class TopTransaction(BaseModel):
    id: int
    occurred_at: str
    amount_base: float
    currency: str
    amount_raw: float
    note: str | None
    categories: list[NameId]
    tags: list[NameId]


class DashboardOut(BaseModel):
    requested_user_id: int | None = None
    effective_user_id: int | None = None
    totals: Totals
    by_day: list[ByDay]
    income_expense_pie: list[PieSlice]
    category_pie_amount: list[PieSlice]
    category_pie_count: list[PieSlice]
    tag_pie_amount: list[PieSlice]
    tag_pie_count: list[PieSlice]
    top_expense_transactions: list[TopTransaction]
    top_income_transactions: list[TopTransaction]
    top_expense_categories_amount: list[TopItem]
    top_expense_tags_amount: list[TopItem]
    top_categories_count: list[TopItem]
    top_tags_count: list[TopItem]
