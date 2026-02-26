from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.auth import TokenResponse, UserMe
from app.schemas.users import MeUpdateIn
from app.security import create_access_token, hash_password, verify_password

router = APIRouter()


@router.post("/auth/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    login_id = form.username
    user = db.query(User).filter((User.username == login_id) | (User.email == login_id)).first()
    if not user or not user.is_active or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(subject=user.username)
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    return UserMe(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        is_admin=current_user.is_admin,
        is_active=current_user.is_active,
    )
