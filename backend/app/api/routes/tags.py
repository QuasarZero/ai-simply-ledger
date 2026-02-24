from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user, require_admin
from app.models import Tag, transaction_tags, User
from app.schemas.tags import TagCreate, TagOut, TagUpdate

router = APIRouter(prefix="/tags")


@router.get("", response_model=list[TagOut])
def list_tags(db: Session = Depends(get_db)):
    rows = (
        db.query(
            Tag.id,
            Tag.name,
            Tag.created_at,
            func.count(transaction_tags.c.transaction_id).label("used_count"),
        )
        .outerjoin(transaction_tags, Tag.id == transaction_tags.c.tag_id)
        .group_by(Tag.id)
        .order_by(Tag.name.asc())
        .all()
    )
    return [
        TagOut(id=r.id, name=r.name, created_at=r.created_at, used_count=int(r.used_count or 0))
        for r in rows
    ]


@router.post("", response_model=TagOut)
def create_tag(payload: TagCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    if db.query(Tag).filter(Tag.name == payload.name).first():
        raise HTTPException(status_code=400, detail="Name already exists")
    t = Tag(name=payload.name)
    db.add(t)
    db.commit()
    db.refresh(t)
    return TagOut(id=t.id, name=t.name, created_at=t.created_at, used_count=0)


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
    used_count = (
        db.query(func.count(transaction_tags.c.transaction_id))
        .filter(transaction_tags.c.tag_id == t.id)
        .scalar()
        or 0
    )
    return TagOut(id=t.id, name=t.name, created_at=t.created_at, used_count=int(used_count))


@router.delete("/{tag_id}", dependencies=[Depends(require_admin)])
def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    t = db.query(Tag).filter(Tag.id == tag_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(t)
    db.commit()
    return {"ok": True}
