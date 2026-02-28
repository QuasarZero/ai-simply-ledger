from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CategoryFieldOut(BaseModel):
    id: int
    category_id: int
    name: str
    is_required: bool
    created_at: datetime


class CategoryFieldCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    is_required: bool = False


class CategoryFieldUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    is_required: bool | None = None

