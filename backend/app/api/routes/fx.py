from __future__ import annotations

from fastapi import APIRouter, Depends

from app.deps import get_current_user
from app.models import User
from app.services.fx import get_rates

router = APIRouter(prefix="/fx")


@router.get("/rates")
def rates(base: str = "CNY", current_user: User = Depends(get_current_user)):
    return {"base": base.upper(), "rates": get_rates(base.upper())}

