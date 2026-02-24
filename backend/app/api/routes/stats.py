from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import Category, Transaction, User
from app.schemas.stats import ByCategory, ByDay, SummaryOut, Totals
from app.services.fx import convert_amount, get_rates

router = APIRouter(prefix="/stats")


def _to_date_str(dt: datetime) -> str:
    return dt.date().isoformat()


@router.get("/summary", response_model=SummaryOut)
def summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    start: date | None = None,
    end: date | None = None,
    base_currency: str = "CNY",
):
    base_currency = base_currency.upper()
    if not start:
        start = (datetime.now(timezone.utc) - timedelta(days=30)).date()
    if not end:
        end = datetime.now(timezone.utc).date()

    start_dt = datetime.combine(start, datetime.min.time()).replace(tzinfo=timezone.utc)
    end_dt = datetime.combine(end, datetime.max.time()).replace(tzinfo=timezone.utc)

    txs = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.id)
        .filter(Transaction.occurred_at >= start_dt, Transaction.occurred_at <= end_dt)
        .all()
    )

    rates = get_rates(base_currency)

    totals_income = 0.0
    totals_expense = 0.0
    by_day = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    by_category = defaultdict(lambda: {"income": 0.0, "expense": 0.0})

    for tx in txs:
        amt = convert_amount(float(tx.amount), tx.currency, base_currency, rates)
        day_key = _to_date_str(tx.occurred_at)
        if tx.type == "income":
            totals_income += amt
            by_day[day_key]["income"] += amt
        else:
            totals_expense += amt
            by_day[day_key]["expense"] += amt

        cat_rows = db.query(Category).join(Category.transactions).filter(Transaction.id == tx.id).all()
        for c in cat_rows:
            if tx.type == "income":
                by_category[c.id]["income"] += amt
            else:
                by_category[c.id]["expense"] += amt

    days: list[ByDay] = []
    cursor = start
    while cursor <= end:
        k = cursor.isoformat()
        days.append(ByDay(date=k, income=by_day[k]["income"], expense=by_day[k]["expense"]))
        cursor = cursor + timedelta(days=1)

    cat_ids = list(by_category.keys())
    cats: dict[int, str] = {}
    if cat_ids:
        for c in db.query(Category).filter(Category.id.in_(cat_ids)).all():
            cats[c.id] = c.name

    cats_out = [
        ByCategory(
            category_id=cid,
            name=cats.get(cid, f"#{cid}"),
            income=vals["income"],
            expense=vals["expense"],
        )
        for cid, vals in sorted(by_category.items(), key=lambda x: x[0])
    ]

    totals = Totals(
        income=totals_income,
        expense=totals_expense,
        net=totals_income - totals_expense,
        currency=base_currency,
    )
    return SummaryOut(totals=totals, by_day=days, by_category=cats_out)

