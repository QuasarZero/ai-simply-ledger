from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import require_admin
from app.models import Tag
from app.schemas.tags import TagCreate, TagOut, TagUpdate

router = APIRouter(prefix="/tags")


@router.get("", response_model=list[TagOut])
def list_tags(db: Session = Depends(get_db)):
    items = db.query(Tag).order_by(Tag.name.asc()).all()
    return [TagOut(id=t.id, name=t.name, created_at=t.created_at) for t in items]


@router.post("", response_model=TagOut, dependencies=[Depends(require_admin)])
def create_tag(payload: TagCreate, db: Session = Depends(get_db)):
    if db.query(Tag).filter(Tag.name == payload.name).first():
        raise HTTPException(status_code=400, detail="Name already exists")
    t = Tag(name=payload.name)
    db.add(t)
    db.commit()
    db.refresh(t)
    return TagOut(id=t.id, name=t.name, created_at=t.created_at)


@router.patch("/{tag_id}", response_model=TagOut, dependencies=[Depends(require_admin)])
def update_tag(tag_id: int, payload: TagUpdate, db: Session = Depends(get_db)):
    t = db.query(Tag).filter(Tag.id == tag_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    if payload.name and payload.name != t.name:
        if db.query(Tag).filter(Tag.name == payload.name).first():
            raise HTTPException(status_code=400, detail="Name already exists")
        t.name = payload.name
    db.commit()
    db.refresh(t)
    return TagOut(id=t.id, name=t.name, created_at=t.created_at)


@router.delete("/{tag_id}", dependencies=[Depends(require_admin)])
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    t = db.query(Tag).filter(Tag.id == tag_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(t)
    db.commit()
    return {"ok": True}

