from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Currency, User
from app.schemas.currencies import CurrencyOut
from app.services.fx import ensure_currency_catalog

router = APIRouter(prefix="/currencies")


@router.get("", response_model=list[CurrencyOut])
def list_enabled_currencies(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    ensure_currency_catalog(db)
    rows = (
        db.query(Currency)
        .filter(Currency.is_enabled.is_(True))
        .order_by(Currency.code.asc())
        .all()
    )
    return [CurrencyOut(code=r.code, name=r.name, is_enabled=bool(r.is_enabled)) for r in rows]

