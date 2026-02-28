from __future__ import annotations

from decimal import Decimal
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from app.audit import audit_log, diff
from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Category, CategoryField, Tag, Transaction, TransactionFieldValue, User
from app.schemas.transactions import (
    BulkActionIn,
    TransactionCreate,
    TransactionList,
    TransactionOut,
    TransactionUpdate,
)

router = APIRouter(prefix="/transactions")
settings = get_settings()


def _coerce_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    # In case the runtime passes a string (older pydantic/fastapi behavior)
    return date.fromisoformat(str(value))


def _tx_to_out(tx: Transaction) -> TransactionOut:
    return TransactionOut(
        id=tx.id,
        user_id=tx.user_id,
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


def _validate_required_fields(
    db: Session,
    *,
    category_ids: list[int],
    field_values: dict[int, str],
) -> None:
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


def _validate_field_ids_allowed(
    db: Session,
    *,
    category_ids: list[int],
    field_values: dict[int, str],
) -> None:
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


@router.get("", response_model=TransactionList)
def list_transactions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    start: date | None = None,
    end: date | None = None,
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
            joinedload(Transaction.field_values),
        )
        .filter(Transaction.user_id == current_user.id)
        .filter(Transaction.is_voided == voided)
    )
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
    return TransactionList(items=[_tx_to_out(t) for t in items], total=total)


@router.post("", response_model=TransactionOut)
def create_transaction(
    payload: TransactionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    categories = []
    if payload.category_ids:
        categories = db.query(Category).filter(Category.id.in_(payload.category_ids)).all()
    tags = []
    if payload.tag_ids:
        tags = db.query(Tag).filter(Tag.id.in_(payload.tag_ids)).all()

    category_ids = [int(x) for x in (payload.category_ids or []) if int(x) > 0]
    field_values_map = _coerce_field_values(payload.field_values)
    _validate_required_fields(db, category_ids=category_ids, field_values=field_values_map)
    _validate_field_ids_allowed(db, category_ids=category_ids, field_values=field_values_map)

    tx = Transaction(
        user_id=current_user.id,
        type=payload.type,
        amount=payload.amount,
        currency=payload.currency.upper(),
        occurred_at=payload.occurred_at,
        note=payload.note,
    )
    tx.categories = categories
    tx.tags = tags
    db.add(tx)
    db.commit()
    db.refresh(tx)

    if field_values_map:
        for field_id, value in field_values_map.items():
            db.add(TransactionFieldValue(transaction_id=tx.id, field_id=field_id, value=value))
        db.commit()
    tx = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.categories),
            joinedload(Transaction.tags),
            joinedload(Transaction.field_values),
        )
        .filter(Transaction.id == tx.id)
        .first()
    )
    audit_log(
        action="transaction.create",
        actor=current_user,
        entity="transaction",
        entity_id=tx.id,
        changes={
            "type": {"from": None, "to": tx.type},
            "amount": {"from": None, "to": float(tx.amount)},
            "currency": {"from": None, "to": tx.currency},
            "occurred_at": {"from": None, "to": tx.occurred_at},
            "note": {"from": None, "to": tx.note},
            "is_voided": {"from": None, "to": bool(tx.is_voided)},
            "category_ids": {"from": None, "to": [c.id for c in (tx.categories or [])]},
            "tag_ids": {"from": None, "to": [t.id for t in (tx.tags or [])]},
            "field_value_ids": {"from": None, "to": sorted(list(field_values_map.keys()))},
        },
        request=request,
    )
    return _tx_to_out(tx)


@router.get("/{tx_id}", response_model=TransactionOut)
def get_transaction(
    tx_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.categories),
            joinedload(Transaction.tags),
            joinedload(Transaction.field_values),
        )
        .filter(Transaction.id == tx_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Not found")
    return _tx_to_out(tx)


@router.patch("/{tx_id}", response_model=TransactionOut)
def update_transaction(
    tx_id: int,
    payload: TransactionUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.categories),
            joinedload(Transaction.tags),
            joinedload(Transaction.field_values),
        )
        .filter(Transaction.id == tx_id, Transaction.user_id == current_user.id)
        .first()
    )
    if not tx:
        raise HTTPException(status_code=404, detail="Not found")

    before = {
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
        next_field_values = _coerce_field_values(payload.field_values) if payload.field_values is not None else {
            fv.field_id: fv.value for fv in (tx.field_values or [])
        }
        _validate_required_fields(db, category_ids=next_category_ids, field_values=next_field_values)
        _validate_field_ids_allowed(db, category_ids=next_category_ids, field_values=next_field_values)

    if payload.field_values is not None:
        next_field_values = _coerce_field_values(payload.field_values)
        db.query(TransactionFieldValue).filter(TransactionFieldValue.transaction_id == tx.id).delete()
        for field_id, value in next_field_values.items():
            db.add(TransactionFieldValue(transaction_id=tx.id, field_id=field_id, value=value))

    if payload.category_ids is not None:
        # Remove values for fields that no longer belong to selected categories.
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
    tx = (
        db.query(Transaction)
        .options(
            joinedload(Transaction.categories),
            joinedload(Transaction.tags),
            joinedload(Transaction.field_values),
        )
        .filter(Transaction.id == tx.id)
        .first()
    )
    after = {
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
            action="transaction.update",
            actor=current_user,
            entity="transaction",
            entity_id=tx.id,
            changes=changes,
            request=request,
        )
    return _tx_to_out(tx)


@router.delete("/{tx_id}")
def delete_transaction(
    tx_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = db.query(Transaction).filter(Transaction.id == tx_id, Transaction.user_id == current_user.id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Not found")
    snapshot = {"type": tx.type, "amount": float(tx.amount), "currency": tx.currency, "occurred_at": tx.occurred_at}
    db.delete(tx)
    db.commit()
    audit_log(
        action="transaction.delete",
        actor=current_user,
        entity="transaction",
        entity_id=tx_id,
        changes={"deleted": {"from": False, "to": True}, **{k: {"from": v, "to": None} for k, v in snapshot.items()}},
        request=request,
    )
    return {"ok": True}


@router.post("/bulk")
@router.post("/bulk/")
def bulk_action(
    payload: BulkActionIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ids = [int(x) for x in payload.ids if int(x) > 0]
    if not ids:
        return {"ok": True, "affected": 0}

    q = db.query(Transaction).filter(Transaction.user_id == current_user.id).filter(Transaction.id.in_(ids))
    items = q.all()
    if payload.action == "delete":
        for tx in items:
            db.delete(tx)
        db.commit()
        audit_log(
            action="transaction.bulk_delete",
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
            action="transaction.bulk_void",
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
            action="transaction.bulk_restore",
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
            action="transaction.bulk_set_categories",
            actor=current_user,
            entity="transaction",
            entity_id=None,
            changes={"ids": ids, "category_ids": category_ids},
            request=request,
        )
        return {"ok": True, "affected": len(items)}

    raise HTTPException(status_code=400, detail="Invalid action")
