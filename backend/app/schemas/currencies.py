from __future__ import annotations

from pydantic import BaseModel, Field


class CurrencyOut(BaseModel):
    code: str
    name: str
    is_enabled: bool


class CurrencyCreate(BaseModel):
    code: str = Field(min_length=3, max_length=8)
    name: str = Field(min_length=1, max_length=128)
    is_enabled: bool = False


class CurrencyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    is_enabled: bool | None = None

