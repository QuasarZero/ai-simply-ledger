from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.audit import audit_log, diff
from app.db import get_db
from app.deps import get_current_user, require_admin
from app.models import Category, CategoryField, Transaction, TransactionFieldValue, User
from app.schemas.category_fields import CategoryFieldCreate, CategoryFieldOut, CategoryFieldUpdate

router = APIRouter()


@router.get("/categories/{category_id}/fields", response_model=list[CategoryFieldOut])
def list_category_fields(
    category_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not db.query(Category.id).filter(Category.id == category_id).first():
        raise HTTPException(status_code=404, detail="Category not found")
    items = (
        db.query(CategoryField)
        .filter(CategoryField.category_id == category_id)
        .order_by(CategoryField.created_at.asc(), CategoryField.id.asc())
        .all()
    )
    return [
        CategoryFieldOut(
            id=x.id,
            category_id=x.category_id,
            name=x.name,
            is_required=bool(x.is_required),
            created_at=x.created_at,
        )
        for x in items
    ]


@router.post("/categories/{category_id}/fields", response_model=CategoryFieldOut, dependencies=[Depends(require_admin)])
def create_category_field(
    category_id: int,
    payload: CategoryFieldCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    exists = (
        db.query(CategoryField.id)
        .filter(CategoryField.category_id == category_id, func.lower(CategoryField.name) == payload.name.lower())
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="Field name already exists")

    f = CategoryField(category_id=category_id, name=payload.name, is_required=bool(payload.is_required))
    db.add(f)
    db.commit()
    db.refresh(f)

    audit_log(
        action="category_field.create",
        actor=current_user,
        entity="category_field",
        entity_id=f.id,
        changes={
            "category_id": {"from": None, "to": f.category_id},
            "name": {"from": None, "to": f.name},
            "is_required": {"from": None, "to": bool(f.is_required)},
        },
        request=request,
    )

    return CategoryFieldOut(
        id=f.id,
        category_id=f.category_id,
        name=f.name,
        is_required=bool(f.is_required),
        created_at=f.created_at,
    )


@router.patch("/category-fields/{field_id}", response_model=CategoryFieldOut, dependencies=[Depends(require_admin)])
def update_category_field(
    field_id: int,
    payload: CategoryFieldUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    f = db.query(CategoryField).filter(CategoryField.id == field_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Not found")

    before = {"name": f.name, "is_required": bool(f.is_required)}

    if payload.name and payload.name != f.name:
        exists = (
            db.query(CategoryField.id)
            .filter(
                CategoryField.category_id == f.category_id,
                func.lower(CategoryField.name) == payload.name.lower(),
                CategoryField.id != f.id,
            )
            .first()
        )
        if exists:
            raise HTTPException(status_code=400, detail="Field name already exists")
        f.name = payload.name
    if payload.is_required is not None:
        f.is_required = bool(payload.is_required)

    db.commit()
    db.refresh(f)

    changes = diff(before, {"name": f.name, "is_required": bool(f.is_required)})
    if changes:
        audit_log(
            action="category_field.update",
            actor=current_user,
            entity="category_field",
            entity_id=f.id,
            changes=changes,
            request=request,
        )

    return CategoryFieldOut(
        id=f.id,
        category_id=f.category_id,
        name=f.name,
        is_required=bool(f.is_required),
        created_at=f.created_at,
    )


@router.delete("/category-fields/{field_id}", dependencies=[Depends(require_admin)])
def delete_category_field(
    field_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    f = db.query(CategoryField).filter(CategoryField.id == field_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Not found")
    snapshot = {"category_id": f.category_id, "name": f.name, "is_required": bool(f.is_required)}
    db.delete(f)
    db.commit()
    audit_log(
        action="category_field.delete",
        actor=current_user,
        entity="category_field",
        entity_id=field_id,
        changes={"deleted": {"from": False, "to": True}, **{k: {"from": v, "to": None} for k, v in snapshot.items()}},
        request=request,
    )
    return {"ok": True}


@router.get("/category-fields/{field_id}/values", response_model=list[str])
def list_field_values(
    field_id: int,
    q: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Only allow access if the field exists.
    f = db.query(CategoryField).filter(CategoryField.id == field_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Not found")

    query = (
        db.query(TransactionFieldValue.value)
        .join(Transaction, Transaction.id == TransactionFieldValue.transaction_id)
        .filter(TransactionFieldValue.field_id == field_id)
        .filter(Transaction.is_voided.is_(False))
    )
    if not current_user.is_admin:
        query = query.filter(Transaction.user_id == current_user.id)

    if q:
        query = query.filter(TransactionFieldValue.value.ilike(f"%{q}%"))

    rows = query.group_by(TransactionFieldValue.value).order_by(TransactionFieldValue.value.asc()).limit(50).all()
    return [r[0] for r in rows if r[0]]

