from __future__ import annotations

from pydantic import BaseModel
from pydantic import Field


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserMe(BaseModel):
    id: int
    email: str
    username: str
    is_admin: bool
    is_active: bool


class ForgotPasswordIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    lang: str | None = Field(default=None, max_length=16)


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=20)
    new_password: str = Field(min_length=6, max_length=128)
