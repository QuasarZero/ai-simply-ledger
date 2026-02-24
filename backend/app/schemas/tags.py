from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)


class TagOut(BaseModel):
    id: int
    name: str
    created_at: datetime
    used_count: int = 0
