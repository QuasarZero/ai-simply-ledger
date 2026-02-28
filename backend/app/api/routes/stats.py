from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.config import get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models import Transaction, User
from app.schemas.stats import (
    ByCategory,
    ByDay,
    DashboardOut,
    PieSlice,
    SummaryOut,
    TopItem,
    TopTransaction,
    Totals,
)
from app.services.fx import convert_amount, get_rates

router = APIRouter(prefix="/stats")
settings = get_settings()


def _to_date_str(dt: datetime) -> str:
    return dt.date().isoformat()


@router.get("/summary", response_model=SummaryOut)
def summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    start: date | None = None,
    end: date | None = None,
    base_currency: str = "CNY",
    user_id: int | None = None,
):
    base_currency = base_currency.upper()
    if not start:
        start = (datetime.now(settings.tzinfo) - timedelta(days=30)).date()
    if not end:
        end = datetime.now(settings.tzinfo).date()

    start_dt = datetime.combine(start, datetime.min.time()).replace(tzinfo=settings.tzinfo)
    end_dt = datetime.combine(end, datetime.max.time()).replace(tzinfo=settings.tzinfo)

    query = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories))
        .filter(Transaction.is_voided.is_(False))
        .filter(Transaction.occurred_at >= start_dt, Transaction.occurred_at <= end_dt)
    )
    if current_user.is_admin and user_id is not None:
        if user_id != 0:
            query = query.filter(Transaction.user_id == user_id)
    else:
        query = query.filter(Transaction.user_id == current_user.id)
    txs = query.all()

    rates = get_rates(base_currency)

    totals_income = 0.0
    totals_expense = 0.0
    by_day = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    by_category = defaultdict(lambda: {"income": 0.0, "expense": 0.0})

    cats: dict[int, str] = {}
    for tx in txs:
        amt = convert_amount(float(tx.amount), tx.currency, base_currency, rates)
        day_key = _to_date_str(tx.occurred_at)
        if tx.type == "income":
            totals_income += amt
            by_day[day_key]["income"] += amt
        else:
            totals_expense += amt
            by_day[day_key]["expense"] += amt

        # Note: summary's by_category is best-effort; dashboard provides richer breakdowns.
        for c in tx.categories:
            cats[c.id] = c.name
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


def _split_add(mapping: dict[int, float], ids: list[int], value: float, empty_id: int = 0) -> None:
    if not ids:
        mapping[empty_id] = mapping.get(empty_id, 0.0) + value
        return
    share = value / float(len(ids))
    for _id in ids:
        mapping[_id] = mapping.get(_id, 0.0) + share


def _count_add(mapping: dict[int, float], ids: list[int], empty_id: int = 0) -> None:
    if not ids:
        mapping[empty_id] = mapping.get(empty_id, 0.0) + 1.0
        return
    for _id in ids:
        mapping[_id] = mapping.get(_id, 0.0) + 1.0


def _top_items(values: dict[int, float], names: dict[int, str], limit: int = 10) -> list[TopItem]:
    pairs = sorted(values.items(), key=lambda x: x[1], reverse=True)[:limit]
    return [TopItem(id=k, name=names.get(k, f"#{k}"), value=float(v)) for k, v in pairs]


def _to_pie(values: dict[int, float], names: dict[int, str], limit: int = 30) -> list[PieSlice]:
    pairs = sorted(values.items(), key=lambda x: x[1], reverse=True)
    head = pairs[:limit]
    tail_sum = sum(v for _, v in pairs[limit:])
    out = [PieSlice(id=k, name=names.get(k, f"#{k}"), value=float(v)) for k, v in head]
    if tail_sum > 0:
        out.append(PieSlice(id=-1, name="Other", value=float(tail_sum)))
    return out


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    start: date | None = None,
    end: date | None = None,
    base_currency: str = "CNY",
    user_id: int | None = None,
):
    base_currency = base_currency.upper()
    if not start:
        start = (datetime.now(settings.tzinfo) - timedelta(days=30)).date()
    if not end:
        end = datetime.now(settings.tzinfo).date()

    start_dt = datetime.combine(start, datetime.min.time()).replace(tzinfo=settings.tzinfo)
    end_dt = datetime.combine(end, datetime.max.time()).replace(tzinfo=settings.tzinfo)

    query = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories), joinedload(Transaction.tags))
        .filter(Transaction.is_voided.is_(False))
        .filter(Transaction.occurred_at >= start_dt, Transaction.occurred_at <= end_dt)
    )
    requested_user_id = user_id
    effective_user_id: int | None
    if current_user.is_admin and user_id is not None:
        if user_id != 0:
            query = query.filter(Transaction.user_id == user_id)
            effective_user_id = int(user_id)
        else:
            effective_user_id = None
    else:
        query = query.filter(Transaction.user_id == current_user.id)
        effective_user_id = int(current_user.id)
    txs = query.all()

    rates = get_rates(base_currency)

    totals_income = 0.0
    totals_expense = 0.0
    by_day = defaultdict(lambda: {"income": 0.0, "expense": 0.0})

    cat_amount: dict[int, float] = {}
    cat_count: dict[int, float] = {}
    tag_amount: dict[int, float] = {}
    tag_count: dict[int, float] = {}

    cat_names: dict[int, str] = {0: "Uncategorized"}
    tag_names: dict[int, str] = {0: "No Tag"}

    expense_tx_rows: list[TopTransaction] = []
    income_tx_rows: list[TopTransaction] = []

    for tx in txs:
        amt_base = convert_amount(float(tx.amount), tx.currency, base_currency, rates)
        day_key = _to_date_str(tx.occurred_at)

        if tx.type == "income":
            totals_income += amt_base
            by_day[day_key]["income"] += amt_base
            income_tx_rows.append(
                TopTransaction(
                    id=tx.id,
                    occurred_at=tx.occurred_at.isoformat(),
                    amount_base=float(amt_base),
                    currency=tx.currency,
                    amount_raw=float(tx.amount),
                    note=tx.note,
                    categories=[c.name for c in tx.categories] or [cat_names[0]],
                    tags=[t.name for t in tx.tags] or [tag_names[0]],
                )
            )
        else:
            totals_expense += amt_base
            by_day[day_key]["expense"] += amt_base

            cat_ids = [c.id for c in tx.categories]
            for c in tx.categories:
                cat_names[c.id] = c.name
            _split_add(cat_amount, cat_ids, amt_base, empty_id=0)
            _count_add(cat_count, cat_ids, empty_id=0)

            tag_ids = [t.id for t in tx.tags]
            for t in tx.tags:
                tag_names[t.id] = t.name
            _split_add(tag_amount, tag_ids, amt_base, empty_id=0)
            _count_add(tag_count, tag_ids, empty_id=0)

            expense_tx_rows.append(
                TopTransaction(
                    id=tx.id,
                    occurred_at=tx.occurred_at.isoformat(),
                    amount_base=float(amt_base),
                    currency=tx.currency,
                    amount_raw=float(tx.amount),
                    note=tx.note,
                    categories=[c.name for c in tx.categories] or [cat_names[0]],
                    tags=[t.name for t in tx.tags] or [tag_names[0]],
                )
            )

    days: list[ByDay] = []
    cursor = start
    while cursor <= end:
        k = cursor.isoformat()
        days.append(ByDay(date=k, income=by_day[k]["income"], expense=by_day[k]["expense"]))
        cursor = cursor + timedelta(days=1)

    totals = Totals(
        income=totals_income,
        expense=totals_expense,
        net=totals_income - totals_expense,
        currency=base_currency,
    )

    income_expense_pie = [
        PieSlice(id=1, name="Income", value=float(totals_income)),
        PieSlice(id=2, name="Expense", value=float(totals_expense)),
    ]

    expense_tx_rows.sort(key=lambda x: x.amount_base, reverse=True)
    income_tx_rows.sort(key=lambda x: x.amount_base, reverse=True)

    return DashboardOut(
        requested_user_id=requested_user_id,
        effective_user_id=effective_user_id,
        totals=totals,
        by_day=days,
        income_expense_pie=income_expense_pie,
        category_pie_amount=_to_pie(cat_amount, cat_names),
        category_pie_count=_to_pie(cat_count, cat_names),
        tag_pie_amount=_to_pie(tag_amount, tag_names),
        tag_pie_count=_to_pie(tag_count, tag_names),
        top_expense_transactions=expense_tx_rows[:10],
        top_income_transactions=income_tx_rows[:10],
        top_expense_categories_amount=_top_items(cat_amount, cat_names, limit=10),
        top_expense_tags_amount=_top_items(tag_amount, tag_names, limit=10),
        top_categories_count=_top_items(cat_count, cat_names, limit=10),
        top_tags_count=_top_items(tag_count, tag_names, limit=10),
    )
