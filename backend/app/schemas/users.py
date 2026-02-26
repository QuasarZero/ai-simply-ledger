from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    is_admin: bool = False
    is_active: bool = True


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    username: str | None = Field(default=None, min_length=2, max_length=64)
    is_admin: bool | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    id: int
    email: str
    username: str
    is_admin: bool
    is_active: bool
    created_at: datetime


class ResetPasswordIn(BaseModel):
    password: str = Field(min_length=6, max_length=128)


class MeUpdateIn(BaseModel):
    email: EmailStr | None = None
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str | None = Field(default=None, min_length=6, max_length=128)
