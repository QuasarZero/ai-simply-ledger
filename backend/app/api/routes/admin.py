from __future__ import annotations

from decimal import Decimal
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, aliased, joinedload

from app.audit import audit_log, diff
from app.config import get_settings
from app.db import get_db
from app.deps import require_admin
from app.models import Category, CategoryField, Tag, Transaction, TransactionFieldValue, User
from app.schemas.transactions import (
    BulkActionIn,
    TransactionListAdmin,
    TransactionOutAdmin,
    TransactionUpdate,
)
from app.schemas.users import ResetPasswordIn, UserCreate, UserMiniOut, UserOut, UserUpdate
from app.security import hash_password

router = APIRouter(dependencies=[Depends(require_admin)])
settings = get_settings()


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
        field_values=[{"field_id": fv.field_id, "value": fv.value} for fv in (tx.field_values or [])],
    )


def _coerce_field_values(values) -> dict[int, str]:
    out: dict[int, str] = {}
    if not values:
        return out
    for item in values:
        try:
            field_id = int(getattr(item, "field_id", None) or item.get("field_id"))
        except Exception:
            continue
        raw = getattr(item, "value", None)
        if raw is None and isinstance(item, dict):
            raw = item.get("value")
        if raw is None:
            continue
        s = str(raw).strip()
        if not s:
            continue
        out[field_id] = s
    return out


def _validate_required_fields(db: Session, *, category_ids: list[int], field_values: dict[int, str]) -> None:
    if not category_ids:
        return
    required_fields = (
        db.query(CategoryField.id, CategoryField.name)
        .filter(CategoryField.category_id.in_(category_ids))
        .filter(CategoryField.is_required.is_(True))
        .all()
    )
    missing = [name for (fid, name) in required_fields if int(fid) not in field_values]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required fields: {', '.join(missing)}")


def _validate_field_ids_allowed(db: Session, *, category_ids: list[int], field_values: dict[int, str]) -> None:
    if not field_values:
        return
    allowed = (
        db.query(CategoryField.id)
        .filter(CategoryField.category_id.in_(category_ids))
        .filter(CategoryField.id.in_(list(field_values.keys())))
        .all()
    )
    allowed_ids = {int(r[0]) for r in allowed}
    bad = [fid for fid in field_values.keys() if int(fid) not in allowed_ids]
    if bad:
        raise HTTPException(status_code=400, detail=f"Invalid field ids for selected categories: {sorted(bad)}")


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
def create_user(
    payload: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
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
    audit_log(
        action="admin.user_create",
        actor=current_user,
        entity="user",
        entity_id=user.id,
        changes={
            "email": {"from": None, "to": user.email},
            "username": {"from": None, "to": user.username},
            "is_admin": {"from": None, "to": bool(user.is_admin)},
            "is_active": {"from": None, "to": bool(user.is_active)},
        },
        request=request,
    )
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
def update_user(
    user_id: int,
    payload: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Not found")

    before = {
        "email": user.email,
        "username": user.username,
        "is_admin": bool(user.is_admin),
        "is_active": bool(user.is_active),
    }

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
    changes = diff(
        before,
        {
            "email": user.email,
            "username": user.username,
            "is_admin": bool(user.is_admin),
            "is_active": bool(user.is_active),
        },
    )
    if changes:
        audit_log(
            action="admin.user_update",
            actor=current_user,
            entity="user",
            entity_id=user.id,
            changes=changes,
            request=request,
        )
    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: int,
    payload: ResetPasswordIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Not found")
    user.password_hash = hash_password(payload.password)
    db.commit()
    audit_log(
        action="admin.user_reset_password",
        actor=current_user,
        entity="user",
        entity_id=user_id,
        changes={"password_reset": {"from": False, "to": True}},
        request=request,
    )
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Not found")
    snapshot = {"email": user.email, "username": user.username, "is_admin": bool(user.is_admin), "is_active": bool(user.is_active)}
    db.delete(user)
    db.commit()
    audit_log(
        action="admin.user_delete",
        actor=current_user,
        entity="user",
        entity_id=user_id,
        changes={"deleted": {"from": False, "to": True}, **{k: {"from": v, "to": None} for k, v in snapshot.items()}},
        request=request,
    )
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
        .options(
            joinedload(Transaction.categories),
            joinedload(Transaction.tags),
            joinedload(Transaction.user),
            joinedload(Transaction.field_values),
        )
        .filter(Transaction.is_voided == voided)
    )
    if user_id is not None:
        query = query.filter(Transaction.user_id == user_id)
    start = _coerce_date(start)
    end = _coerce_date(end)
    if start:
        start_dt = datetime.combine(start, datetime.min.time()).replace(tzinfo=settings.tzinfo)
        query = query.filter(Transaction.occurred_at >= start_dt)
    if end:
        end_dt = datetime.combine(end, datetime.max.time()).replace(tzinfo=settings.tzinfo)
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
        field_sort_id: int | None = None
        if sort_key and category_id is not None:
            raw = None
            if sort_key.startswith("field:"):
                raw = sort_key.split(":", 1)[1]
            elif sort_key.startswith("field_"):
                raw = sort_key.split("_", 1)[1]
            if raw and str(raw).isdigit():
                try:
                    field_sort_id = int(raw)
                except Exception:
                    field_sort_id = None

        if field_sort_id is not None and category_id is not None:
            allowed = (
                db.query(CategoryField.id)
                .filter(CategoryField.id == field_sort_id)
                .filter(CategoryField.category_id == category_id)
                .first()
            )
            if allowed:
                fv = aliased(TransactionFieldValue)
                query = query.outerjoin(
                    fv, (fv.transaction_id == Transaction.id) & (fv.field_id == field_sort_id)
                )
                order_col = fv.value

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
        order_expr = order_col.asc() if dir_is_asc else order_col.desc()
        if field_sort_id is not None:
            order_expr = order_expr.nullslast()
        query = query.order_by(order_expr, Transaction.id.desc())

    total = query.count()
    items = query.offset(skip).limit(min(limit, 500)).all()
    return TransactionListAdmin(items=[_tx_to_out_admin(t) for t in items], total=total)


@router.patch("/transactions/{tx_id}", response_model=TransactionOutAdmin)
def update_transaction_admin(
    tx_id: int,
    payload: TransactionUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    tx = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.categories),
            joinedload(Transaction.tags),
            joinedload(Transaction.user),
            joinedload(Transaction.field_values),
        )
        .filter(Transaction.id == tx_id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Not found")

    before = {
        "user_id": tx.user_id,
        "type": tx.type,
        "amount": float(tx.amount),
        "currency": tx.currency,
        "occurred_at": tx.occurred_at,
        "note": tx.note,
        "is_voided": bool(tx.is_voided),
        "category_ids": [c.id for c in (tx.categories or [])],
        "tag_ids": [t.id for t in (tx.tags or [])],
        "field_values": {fv.field_id: fv.value for fv in (tx.field_values or [])},
    }

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

    if payload.field_values is not None or payload.category_ids is not None:
        next_category_ids = [c.id for c in (tx.categories or [])]
        next_field_values = (
            _coerce_field_values(payload.field_values)
            if payload.field_values is not None
            else {fv.field_id: fv.value for fv in (tx.field_values or [])}
        )
        _validate_required_fields(db, category_ids=next_category_ids, field_values=next_field_values)
        _validate_field_ids_allowed(db, category_ids=next_category_ids, field_values=next_field_values)

    if payload.field_values is not None:
        next_field_values = _coerce_field_values(payload.field_values)
        db.query(TransactionFieldValue).filter(TransactionFieldValue.transaction_id == tx.id).delete()
        for field_id, value in next_field_values.items():
            db.add(TransactionFieldValue(transaction_id=tx.id, field_id=field_id, value=value))

    if payload.category_ids is not None:
        kept_field_ids = (
            db.query(CategoryField.id)
            .filter(CategoryField.category_id.in_([c.id for c in (tx.categories or [])]))
            .all()
        )
        kept_ids = {int(r[0]) for r in kept_field_ids}
        if kept_ids:
            db.query(TransactionFieldValue).filter(TransactionFieldValue.transaction_id == tx.id).filter(
                ~TransactionFieldValue.field_id.in_(list(kept_ids))
            ).delete(synchronize_session=False)
        else:
            db.query(TransactionFieldValue).filter(TransactionFieldValue.transaction_id == tx.id).delete()

    db.commit()
    db.refresh(tx)
    after = {
        "user_id": tx.user_id,
        "type": tx.type,
        "amount": float(tx.amount),
        "currency": tx.currency,
        "occurred_at": tx.occurred_at,
        "note": tx.note,
        "is_voided": bool(tx.is_voided),
        "category_ids": [c.id for c in (tx.categories or [])],
        "tag_ids": [t.id for t in (tx.tags or [])],
        "field_values": {fv.field_id: fv.value for fv in (tx.field_values or [])},
    }
    changes = diff(before, after)
    if changes:
        audit_log(
            action="admin.transaction_update",
            actor=current_user,
            entity="transaction",
            entity_id=tx.id,
            changes=changes,
            request=request,
        )
    return _tx_to_out_admin(tx)


@router.delete("/transactions/{tx_id}")
def delete_transaction_admin(
    tx_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Not found")
    snapshot = {"user_id": tx.user_id, "type": tx.type, "amount": float(tx.amount), "currency": tx.currency, "occurred_at": tx.occurred_at}
    db.delete(tx)
    db.commit()
    audit_log(
        action="admin.transaction_delete",
        actor=current_user,
        entity="transaction",
        entity_id=tx_id,
        changes={"deleted": {"from": False, "to": True}, **{k: {"from": v, "to": None} for k, v in snapshot.items()}},
        request=request,
    )
    return {"ok": True}


@router.post("/transactions/bulk")
@router.post("/transactions/bulk/")
def bulk_action(
    payload: BulkActionIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    ids = [int(x) for x in payload.ids if int(x) > 0]
    if not ids:
        return {"ok": True, "affected": 0}

    q = db.query(Transaction).filter(Transaction.id.in_(ids))
    items = q.all()

    if payload.action == "delete":
        for tx in items:
            db.delete(tx)
        db.commit()
        audit_log(
            action="admin.transaction_bulk_delete",
            actor=current_user,
            entity="transaction",
            entity_id=None,
            changes={"ids": ids},
            request=request,
        )
        return {"ok": True, "affected": len(items)}

    if payload.action == "void":
        for tx in items:
            tx.is_voided = True
        db.commit()
        audit_log(
            action="admin.transaction_bulk_void",
            actor=current_user,
            entity="transaction",
            entity_id=None,
            changes={"ids": ids},
            request=request,
        )
        return {"ok": True, "affected": len(items)}

    if payload.action == "restore":
        for tx in items:
            tx.is_voided = False
        db.commit()
        audit_log(
            action="admin.transaction_bulk_restore",
            actor=current_user,
            entity="transaction",
            entity_id=None,
            changes={"ids": ids},
            request=request,
        )
        return {"ok": True, "affected": len(items)}

    if payload.action == "set_categories":
        if payload.category_ids is None:
            raise HTTPException(status_code=400, detail="category_ids required")
        category_ids = [int(x) for x in payload.category_ids if int(x) > 0]
        categories: list[Category] = []
        if category_ids:
            categories = db.query(Category).filter(Category.id.in_(category_ids)).all()
        for tx in items:
            tx.categories = categories
        db.commit()
        audit_log(
            action="admin.transaction_bulk_set_categories",
            actor=current_user,
            entity="transaction",
            entity_id=None,
            changes={"ids": ids, "category_ids": category_ids},
            request=request,
        )
        return {"ok": True, "affected": len(items)}

    raise HTTPException(status_code=400, detail="Invalid action")
