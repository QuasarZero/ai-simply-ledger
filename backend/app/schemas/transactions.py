from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.categories import CategoryOut
from app.schemas.tags import TagOut
from app.schemas.users import UserMiniOut


class TransactionFieldValueIn(BaseModel):
    field_id: int
    value: str | None = None


class TransactionFieldValueOut(BaseModel):
    field_id: int
    value: str


class TransactionCreate(BaseModel):
    type: str = Field(pattern="^(income|expense)$")
    amount: float = Field(ge=0)
    currency: str = Field(default="CNY", min_length=3, max_length=8)
    occurred_at: datetime
    note: str | None = None
    category_ids: list[int] = []
    tag_ids: list[int] = []
    field_values: list[TransactionFieldValueIn] = []


class TransactionUpdate(BaseModel):
    type: str | None = Field(default=None, pattern="^(income|expense)$")
    amount: float | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=8)
    occurred_at: datetime | None = None
    note: str | None = None
    category_ids: list[int] | None = None
    tag_ids: list[int] | None = None
    is_voided: bool | None = None
    field_values: list[TransactionFieldValueIn] | None = None


class TransactionOut(BaseModel):
    id: int
    user_id: int
    type: str
    amount: float
    currency: str
    occurred_at: datetime
    note: str | None
    is_voided: bool
    created_at: datetime
    categories: list[CategoryOut]
    tags: list[TagOut]
    field_values: list[TransactionFieldValueOut] = []


class TransactionList(BaseModel):
    items: list[TransactionOut]
    total: int


class TransactionOutAdmin(TransactionOut):
    user: UserMiniOut | None = None


class TransactionListAdmin(BaseModel):
    items: list[TransactionOutAdmin]
    total: int


class BulkActionIn(BaseModel):
    ids: list[int]
    action: str = Field(pattern="^(void|restore|delete|set_categories)$")
    category_ids: list[int] | None = None
