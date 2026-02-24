from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import Category
from app.schemas.categories import CategoryCreate, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/categories")


@router.get("", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    items = db.query(Category).order_by(Category.name.asc()).all()
    return [CategoryOut(id=c.id, name=c.name, description=c.description, created_at=c.created_at) for c in items]


@router.post("", response_model=CategoryOut, dependencies=[Depends(require_admin)])
def create_category(payload: CategoryCreate, db: Session = Depends(get_db)):
    if db.query(Category).filter(Category.name == payload.name).first():
        raise HTTPException(status_code=400, detail="Name already exists")
    c = Category(name=payload.name, description=payload.description)
    db.add(c)
    db.commit()
    db.refresh(c)
    return CategoryOut(id=c.id, name=c.name, description=c.description, created_at=c.created_at)


@router.patch("/{category_id}", response_model=CategoryOut, dependencies=[Depends(require_admin)])
def update_category(category_id: int, payload: CategoryUpdate, db: Session = Depends(get_db)):
    c = db.query(Category).filter(Category.id == category_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    if payload.name and payload.name != c.name:
        if db.query(Category).filter(Category.name == payload.name).first():
            raise HTTPException(status_code=400, detail="Name already exists")
        c.name = payload.name
    if payload.description is not None:
        c.description = payload.description
    db.commit()
    db.refresh(c)
    return CategoryOut(id=c.id, name=c.name, description=c.description, created_at=c.created_at)


@router.delete("/{category_id}", dependencies=[Depends(require_admin)])
def delete_category(category_id: int, db: Session = Depends(get_db)):
    c = db.query(Category).filter(Category.id == category_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(c)
    db.commit()
    return {"ok": True}

