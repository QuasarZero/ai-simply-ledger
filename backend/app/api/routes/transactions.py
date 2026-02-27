from __future__ import annotations

from decimal import Decimal
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from app.audit import audit_log, diff
from app.db import get_db
from app.deps import get_current_user
from app.models import Category, Tag, Transaction, User
from app.schemas.transactions import (
    BulkActionIn,
    TransactionCreate,
    TransactionList,
    TransactionOut,
    TransactionUpdate,
)

router = APIRouter(prefix="/transactions")


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
    )


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
        .options(joinedload(Transaction.categories), joinedload(Transaction.tags))
        .filter(Transaction.user_id == current_user.id)
        .filter(Transaction.is_voided == voided)
    )
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
    tx = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories), joinedload(Transaction.tags))
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
        .options(joinedload(Transaction.categories), joinedload(Transaction.tags))
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
        .options(joinedload(Transaction.categories), joinedload(Transaction.tags))
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

    db.commit()
    db.refresh(tx)
    tx = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories), joinedload(Transaction.tags))
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

    raise HTTPException(status_code=400, detail="Invalid action")
