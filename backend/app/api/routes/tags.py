from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.audit import audit_log, diff
from app.db import get_db
from app.deps import get_current_user
from app.models import Tag, Transaction, transaction_tags, User
from app.schemas.tags import TagCreate, TagOut, TagUpdate

router = APIRouter(prefix="/tags")


@router.get("", response_model=list[TagOut])
def list_tags(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (
        db.query(
            Tag.id,
            Tag.name,
            Tag.created_at,
            func.count(transaction_tags.c.transaction_id).label("used_count"),
        )
        .outerjoin(transaction_tags, Tag.id == transaction_tags.c.tag_id)
        .outerjoin(Transaction, Transaction.id == transaction_tags.c.transaction_id)
        .filter((Transaction.id.is_(None)) | (Transaction.is_voided.is_(False)))
        .group_by(Tag.id)
        .order_by(Tag.name.asc())
        .all()
    )
    return [
        TagOut(id=r.id, name=r.name, created_at=r.created_at, used_count=int(r.used_count or 0))
        for r in rows
    ]


@router.post("", response_model=TagOut)
def create_tag(
    payload: TagCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.query(Tag).filter(Tag.name == payload.name).first():
        raise HTTPException(status_code=400, detail="Name already exists")
    t = Tag(name=payload.name)
    db.add(t)
    db.commit()
    db.refresh(t)
    audit_log(
        action="tag.create",
        actor=current_user,
        entity="tag",
        entity_id=t.id,
        changes={"name": {"from": None, "to": t.name}},
        request=request,
    )
    return TagOut(id=t.id, name=t.name, created_at=t.created_at, used_count=0)


@router.patch("/{tag_id}", response_model=TagOut)
def update_tag(
    tag_id: int,
    payload: TagUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(Tag).filter(Tag.id == tag_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    before = {"name": t.name}
    if payload.name and payload.name != t.name:
        if db.query(Tag).filter(Tag.name == payload.name).first():
            raise HTTPException(status_code=400, detail="Name already exists")
        t.name = payload.name
    db.commit()
    db.refresh(t)
    changes = diff(before, {"name": t.name})
    used_count = (
        db.query(func.count(transaction_tags.c.transaction_id))
        .filter(transaction_tags.c.tag_id == t.id)
        .scalar()
        or 0
    )
    if changes:
        audit_log(
            action="tag.update",
            actor=current_user,
            entity="tag",
            entity_id=t.id,
            changes=changes,
            request=request,
        )
    return TagOut(id=t.id, name=t.name, created_at=t.created_at, used_count=int(used_count))


@router.delete("/{tag_id}")
def delete_tag(
    tag_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(Tag).filter(Tag.id == tag_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    snapshot = {"name": t.name}
    db.delete(t)
    db.commit()
    audit_log(
        action="tag.delete",
        actor=current_user,
        entity="tag",
        entity_id=tag_id,
        changes={"deleted": {"from": False, "to": True}, **{k: {"from": v, "to": None} for k, v in snapshot.items()}},
        request=request,
    )
    return {"ok": True}
