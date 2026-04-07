from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.audit import audit_log, diff
from app.db import get_db
from app.deps import require_admin
from app.models import Category, CategoryField, User
from app.schemas.categories import CategoryCreate, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/categories")


@router.get("", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    fields_count = (
        db.query(func.count(CategoryField.id))
        .filter(CategoryField.category_id == Category.id)
        .correlate(Category)
        .scalar_subquery()
    )
    items = db.query(Category, fields_count.label("fields_count")).order_by(Category.name.asc()).all()
    return [
        CategoryOut(
            id=c.id,
            name=c.name,
            description=c.description,
            created_at=c.created_at,
            fields_count=int(cnt or 0),
        )
        for (c, cnt) in items
    ]


@router.post("", response_model=CategoryOut, dependencies=[Depends(require_admin)])
def create_category(
    payload: CategoryCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if db.query(Category).filter(Category.name == payload.name).first():
        raise HTTPException(status_code=400, detail="Name already exists")
    c = Category(name=payload.name, description=payload.description)
    db.add(c)
    db.commit()
    db.refresh(c)
    audit_log(
        action="category.create",
        actor=current_user,
        entity="category",
        entity_id=c.id,
        changes={
            "name": {"from": None, "to": c.name},
            "description": {"from": None, "to": c.description},
        },
        request=request,
    )
    return CategoryOut(id=c.id, name=c.name, description=c.description, created_at=c.created_at, fields_count=0)


@router.patch("/{category_id}", response_model=CategoryOut, dependencies=[Depends(require_admin)])
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    c = db.query(Category).filter(Category.id == category_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    before = {"name": c.name, "description": c.description}
    if payload.name and payload.name != c.name:
        if db.query(Category).filter(Category.name == payload.name).first():
            raise HTTPException(status_code=400, detail="Name already exists")
        c.name = payload.name
    # Allow clearing description by sending explicit null.
    if "description" in payload.model_fields_set:
        c.description = payload.description
    db.commit()
    db.refresh(c)
    changes = diff(before, {"name": c.name, "description": c.description})
    if changes:
        audit_log(
            action="category.update",
            actor=current_user,
            entity="category",
            entity_id=c.id,
            changes=changes,
            request=request,
        )
    fields_count = int(db.query(func.count(CategoryField.id)).filter(CategoryField.category_id == c.id).scalar() or 0)
    return CategoryOut(
        id=c.id,
        name=c.name,
        description=c.description,
        created_at=c.created_at,
        fields_count=fields_count,
    )


@router.delete("/{category_id}", dependencies=[Depends(require_admin)])
def delete_category(
    category_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    c = db.query(Category).filter(Category.id == category_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    snapshot = {"name": c.name, "description": c.description}
    db.delete(c)
    db.commit()
    audit_log(
        action="category.delete",
        actor=current_user,
        entity="category",
        entity_id=category_id,
        changes={"deleted": {"from": False, "to": True}, **{k: {"from": v, "to": None} for k, v in snapshot.items()}},
        request=request,
    )
    return {"ok": True}
