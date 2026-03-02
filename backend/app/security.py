from __future__ import annotations

from datetime import datetime, timedelta, timezone

from jose import jwt
from jose.exceptions import JWTError
from passlib.context import CryptContext

from app.config import get_settings
from app.models import User

# Avoid bcrypt backend compatibility issues in minimal Docker images.
# PBKDF2-SHA256 is widely supported and has no 72-byte password limit.
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def create_access_token(subject: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "iat": int(now.timestamp()), "exp": int(expire.timestamp())}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_token(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])


def create_password_reset_token(user: User) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.password_reset_token_expire_minutes)
    updated_at = getattr(user, "updated_at", None)
    uat = int(updated_at.timestamp()) if updated_at is not None else 0
    payload = {
        "typ": "pwd_reset",
        "sub": str(user.id),
        "email": user.email,
        "uat": uat,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_password_reset_token(token: str) -> dict:
    data = decode_token(token)
    if data.get("typ") != "pwd_reset":
        raise JWTError("Invalid token type")
    return data
