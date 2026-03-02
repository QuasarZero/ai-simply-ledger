from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from jose.exceptions import JWTError
from sqlalchemy.orm import Session

from app.audit import audit_log, diff
from app.db import get_db
from app.deps import get_current_user
from app.log import error_log
from app.models import User
from app.schemas.auth import ForgotPasswordIn, ResetPasswordIn, TokenResponse, UserMe
from app.schemas.users import MeUpdateIn
from app.security import (
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    hash_password,
    verify_password,
)
from app.services.email import send_password_reset_email
from app.config import get_settings

router = APIRouter()
settings = get_settings()


@router.post("/auth/login", response_model=TokenResponse)
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    login_id = form.username
    user = db.query(User).filter((User.username == login_id) | (User.email == login_id)).first()
    if not user or not user.is_active or not verify_password(form.password, user.password_hash):
        audit_log(
            action="auth.login_failed",
            actor=None,
            request=request,
            extra={"login_id": login_id},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(subject=user.username)
    audit_log(
        action="auth.login",
        actor=user,
        request=request,
    )
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserMe)
def me(current_user: User = Depends(get_current_user)):
    return UserMe(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        is_admin=current_user.is_admin,
        is_active=current_user.is_active,
    )


@router.patch("/me", response_model=UserMe)
def update_me(
    payload: MeUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    before = {"email": current_user.email}
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid current password")

    if payload.email and payload.email != current_user.email:
        exists = db.query(User).filter(User.email == payload.email).first()
        if exists and exists.id != current_user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists")
        current_user.email = payload.email

    if payload.new_password:
        current_user.password_hash = hash_password(payload.new_password)

    db.commit()
    db.refresh(current_user)
    after = {"email": current_user.email, "password_changed": bool(payload.new_password)}
    changes = diff(before, after)
    audit_log(
        action="user.me_update",
        actor=current_user,
        entity="user",
        entity_id=current_user.id,
        changes=changes,
        request=request,
    )
    return UserMe(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        is_admin=current_user.is_admin,
        is_active=current_user.is_active,
    )


@router.post("/auth/logout")
def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    audit_log(action="auth.logout", actor=current_user, request=request)
    return {"ok": True}


@router.post("/auth/forgot-password")
def forgot_password(
    payload: ForgotPasswordIn,
    request: Request,
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if user and user.is_active:
        token = create_password_reset_token(user)
        base = (settings.frontend_base_url or "http://localhost:8080").rstrip("/")
        reset_url = f"{base}/reset-password?token={token}"
        try:
            send_password_reset_email(to_email=user.email, reset_url=reset_url)
        except Exception as exc:
            error_log(error=exc, request=request, extra={"op": "send_password_reset_email"})
        audit_log(action="auth.password_reset_request", actor=user, request=request)

    # Always return ok to avoid account enumeration.
    return {"ok": True}


@router.post("/auth/reset-password")
def reset_password(
    payload: ResetPasswordIn,
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        data = decode_password_reset_token(payload.token)
        user_id = int(data.get("sub") or 0)
        token_email = str(data.get("email") or "").strip().lower()
        token_uat = int(data.get("uat") or 0)
    except (JWTError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid or expired token") from exc

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    if str(user.email or "").strip().lower() != token_email:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    updated_at = getattr(user, "updated_at", None)
    uat = int(updated_at.timestamp()) if updated_at is not None else 0
    if uat != token_uat:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    user.password_hash = hash_password(payload.new_password)
    db.commit()

    audit_log(
        action="auth.password_reset",
        actor=user,
        entity="user",
        entity_id=user.id,
        changes={"password_changed": {"from": False, "to": True}},
        request=request,
    )
    return {"ok": True}
