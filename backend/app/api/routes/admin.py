from __future__ import annotations

from decimal import Decimal
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.deps import require_admin
from app.models import Category, Tag, Transaction, User
from app.schemas.transactions import (
    BulkActionIn,
    TransactionListAdmin,
    TransactionOutAdmin,
    TransactionUpdate,
)
from app.schemas.users import ResetPasswordIn, UserCreate, UserMiniOut, UserOut, UserUpdate
from app.security import hash_password

router = APIRouter(dependencies=[Depends(require_admin)])


def _coerce_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _tx_to_out_admin(tx: Transaction) -> TransactionOutAdmin:
    return TransactionOutAdmin(
        id=tx.id,
        user_id=tx.user_id,
        user=(
            UserMiniOut(id=tx.user.id, email=tx.user.email, username=tx.user.username)
            if tx.user is not None
            else None
        ),
        type=tx.type,
        amount=float(tx.amount),
        currency=tx.currency,
        occurred_at=tx.occurred_at,
        note=tx.note,
        is_voided=bool(tx.is_voided),
        created_at=tx.created_at,
        categories=[
            {"id": c.id, "name": c.name, "description": c.description, "created_at": c.created_at}
            for c in tx.categories
        ],
        tags=[{"id": t.id, "name": t.name, "created_at": t.created_at} for t in tx.tags],
    )


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.id.desc()).all()
    return [
        UserOut(
            id=u.id,
            email=u.email,
            username=u.username,
            is_admin=u.is_admin,
            is_active=u.is_active,
            created_at=u.created_at,
        )
        for u in users
    ]


@router.post("/users", response_model=UserOut)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already exists")

    user = User(
        email=payload.email,
        username=payload.username,
        password_hash=hash_password(payload.password),
        is_admin=payload.is_admin,
        is_active=payload.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Not found")
    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Not found")

    if payload.username and payload.username != user.username:
        if db.query(User).filter(User.username == payload.username).first():
            raise HTTPException(status_code=400, detail="Username already exists")
        user.username = payload.username

    if payload.email and payload.email != user.email:
        if db.query(User).filter(User.email == payload.email).first():
            raise HTTPException(status_code=400, detail="Email already exists")
        user.email = payload.email

    if payload.is_admin is not None:
        user.is_admin = payload.is_admin
    if payload.is_active is not None:
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)
    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, payload: ResetPasswordIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Not found")
    user.password_hash = hash_password(payload.password)
    db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(user)
    db.commit()
    return {"ok": True}


@router.get("/transactions", response_model=TransactionListAdmin)
def list_transactions(
    db: Session = Depends(get_db),
    start: date | None = None,
    end: date | None = None,
    user_id: int | None = None,
    q: str | None = None,
    type: str | None = None,
    voided: bool = False,
    category_id: int | None = None,
    tag_id: int | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
    skip: int = 0,
    limit: int = 50,
    sort_key: str | None = None,
    sort_dir: str | None = None,
):
    query = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories), joinedload(Transaction.tags), joinedload(Transaction.user))
        .filter(Transaction.is_voided == voided)
    )
    if user_id is not None:
        query = query.filter(Transaction.user_id == user_id)
    start = _coerce_date(start)
    end = _coerce_date(end)
    if start:
        start_dt = datetime.combine(start, datetime.min.time()).replace(tzinfo=timezone.utc)
        query = query.filter(Transaction.occurred_at >= start_dt)
    if end:
        end_dt = datetime.combine(end, datetime.max.time()).replace(tzinfo=timezone.utc)
        query = query.filter(Transaction.occurred_at <= end_dt)
    if type in ("income", "expense"):
        query = query.filter(Transaction.type == type)
    if q:
        query = query.filter(Transaction.note.ilike(f"%{q}%"))
    if category_id is not None:
        query = query.filter(Transaction.categories.any(Category.id == category_id))
    if tag_id is not None:
        query = query.filter(Transaction.tags.any(Tag.id == tag_id))
    if min_amount is not None:
        query = query.filter(Transaction.amount >= Decimal(str(min_amount)))
    if max_amount is not None:
        query = query.filter(Transaction.amount <= Decimal(str(max_amount)))

    dir_is_asc = sort_dir == "asc"
    if sort_key == "user":
        query = query.join(User, Transaction.user_id == User.id)
        query = query.order_by(
            User.username.asc() if dir_is_asc else User.username.desc(),
            User.email.asc() if dir_is_asc else User.email.desc(),
            Transaction.occurred_at.desc(),
            Transaction.id.desc(),
        )
    else:
        order_col = Transaction.occurred_at
        if sort_key == "amount":
            order_col = Transaction.amount
        elif sort_key == "type":
            order_col = Transaction.type
        elif sort_key == "currency":
            order_col = Transaction.currency
        elif sort_key == "note":
            order_col = Transaction.note
        elif sort_key == "occurred_at":
            order_col = Transaction.occurred_at
        query = query.order_by(order_col.asc() if dir_is_asc else order_col.desc(), Transaction.id.desc())

    total = query.count()
    items = query.offset(skip).limit(min(limit, 500)).all()
    return TransactionListAdmin(items=[_tx_to_out_admin(t) for t in items], total=total)


@router.patch("/transactions/{tx_id}", response_model=TransactionOutAdmin)
def update_transaction_admin(tx_id: int, payload: TransactionUpdate, db: Session = Depends(get_db)):
    tx = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories), joinedload(Transaction.tags), joinedload(Transaction.user))
        .filter(Transaction.id == tx_id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Not found")

    if payload.type:
        tx.type = payload.type
    if payload.amount is not None:
        tx.amount = payload.amount
    if payload.currency:
        tx.currency = payload.currency.upper()
    if payload.occurred_at:
        tx.occurred_at = payload.occurred_at
    if payload.note is not None:
        tx.note = payload.note
    if payload.is_voided is not None:
        tx.is_voided = payload.is_voided

    if payload.category_ids is not None:
        categories = []
        if payload.category_ids:
            categories = db.query(Category).filter(Category.id.in_(payload.category_ids)).all()
        tx.categories = categories

    if payload.tag_ids is not None:
        tags = []
        if payload.tag_ids:
            tags = db.query(Tag).filter(Tag.id.in_(payload.tag_ids)).all()
        tx.tags = tags

    db.commit()
    db.refresh(tx)
    return _tx_to_out_admin(tx)


@router.delete("/transactions/{tx_id}")
def delete_transaction_admin(tx_id: int, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(tx)
    db.commit()
    return {"ok": True}


@router.post("/transactions/bulk")
@router.post("/transactions/bulk/")
def bulk_action(payload: BulkActionIn, db: Session = Depends(get_db)):
    ids = [int(x) for x in payload.ids if int(x) > 0]
    if not ids:
        return {"ok": True, "affected": 0}

    q = db.query(Transaction).filter(Transaction.id.in_(ids))
    items = q.all()

    if payload.action == "delete":
        for tx in items:
            db.delete(tx)
        db.commit()
        return {"ok": True, "affected": len(items)}

    if payload.action == "void":
        for tx in items:
            tx.is_voided = True
        db.commit()
        return {"ok": True, "affected": len(items)}

    if payload.action == "restore":
        for tx in items:
            tx.is_voided = False
        db.commit()
        return {"ok": True, "affected": len(items)}

    raise HTTPException(status_code=400, detail="Invalid action")
