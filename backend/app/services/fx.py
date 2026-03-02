from __future__ import annotations

import bisect
import time
from dataclasses import dataclass
from datetime import date, timedelta

import httpx

from app.config import get_settings
from app.models import Currency, FxRate


@dataclass
class FxCacheEntry:
    ts: float
    base: str
    rates: dict[str, float]


_cache: dict[str, FxCacheEntry] = {}


def get_rates(base: str) -> dict[str, float]:
    settings = get_settings()
    base = base.upper()
    now = time.time()

    entry = _cache.get(base)
    if entry and now - entry.ts <= settings.fx_cache_ttl_seconds:
        return entry.rates

    url = f"{settings.fx_base_url.rstrip('/')}/latest"
    with httpx.Client(timeout=10) as client:
        resp = client.get(url, params={"from": base})
        resp.raise_for_status()
        data = resp.json()
        rates = data.get("rates") or {}

    rates = {k.upper(): float(v) for k, v in rates.items()}
    rates[base] = 1.0
    _cache[base] = FxCacheEntry(ts=now, base=base, rates=rates)
    return rates


def convert_amount(amount: float, from_currency: str, to_currency: str, rates_base_to_other: dict[str, float]) -> float:
    from_currency = from_currency.upper()
    to_currency = to_currency.upper()
    if from_currency == to_currency:
        return float(amount)

    # rates_base_to_other is from get_rates(base=to_currency):
    # 1 to_currency == rates[FROM] * FROM  => FROM -> to_currency = amount / rates[FROM]
    rate = rates_base_to_other.get(from_currency)
    if not rate:
        raise ValueError(f"Missing FX rate for {from_currency} (base {to_currency})")
    return float(amount) / float(rate)


def fetch_rates_for_date(day: date, base: str = "USD", currencies: list[str] | None = None) -> dict[str, float]:
    """
    Fetch historical daily rates for a given day.
    Uses the configured FX provider (default: Frankfurter) which supports /YYYY-MM-DD endpoints.

    Returns mapping: CURRENCY -> rate where 1 BASE == rate * CURRENCY.
    """
    settings = get_settings()
    base = base.upper()
    url = f"{settings.fx_base_url.rstrip('/')}/{day.isoformat()}"
    params: dict[str, str] = {"from": base}
    if currencies:
        targets = sorted({c.strip().upper() for c in currencies if c and c.strip() and c.strip().upper() != base})
        if targets:
            params["to"] = ",".join(targets)

    with httpx.Client(timeout=20) as client:
        resp = client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()
        rates = data.get("rates") or {}

    out = {k.upper(): float(v) for k, v in rates.items()}
    out[base] = 1.0
    return out


def fetch_currency_catalog() -> dict[str, str]:
    """
    Fetch currency catalog from FX provider (default: Frankfurter).
    Frankfurter returns mapping: CODE -> name.
    """
    settings = get_settings()
    url = f"{settings.fx_base_url.rstrip('/')}/currencies"
    with httpx.Client(timeout=20) as client:
        resp = client.get(url)
        resp.raise_for_status()
        data = resp.json()
    if not isinstance(data, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in data.items():
        code = str(k).strip().upper()
        if not code:
            continue
        name = str(v).strip() if v is not None else code
        out[code] = name or code
    return out


def ensure_currency_catalog(db) -> None:
    """
    Best-effort: if currency table looks empty (or only has a few seeds),
    pull provider catalog once and persist it. Never raises.
    """
    try:
        existing = int(db.query(Currency).count() or 0)
    except Exception:
        return
    settings = get_settings()
    enabled = set(settings.fx_currency_list)

    # If admin disabled everything, re-enable env defaults to keep system usable.
    try:
        enabled_cnt = int(db.query(Currency).filter(Currency.is_enabled.is_(True)).count() or 0)
        if enabled_cnt == 0 and enabled:
            for c in enabled:
                db.query(Currency).filter(Currency.code == c).update({"is_enabled": True})
            db.commit()
    except Exception:
        db.rollback()

    if existing >= 20:
        return

    try:
        catalog = fetch_currency_catalog()
    except Exception:
        return
    if not catalog:
        return

    for code, name in catalog.items():
        cur = db.query(Currency).filter(Currency.code == code).first()
        if cur:
            if not cur.name and name:
                cur.name = name
            # do not override is_enabled here
            continue
        db.add(Currency(code=code, name=name, is_enabled=(code in enabled)))
    try:
        db.commit()
    except Exception:
        db.rollback()

    # Ensure there is at least one enabled currency to keep the system usable.
    try:
        enabled_cnt = int(db.query(Currency).filter(Currency.is_enabled.is_(True)).count() or 0)
        if enabled_cnt == 0 and enabled:
            for c in enabled:
                db.query(Currency).filter(Currency.code == c).update({"is_enabled": True})
            db.commit()
    except Exception:
        db.rollback()


def get_enabled_currency_codes(db) -> list[str]:
    settings = get_settings()
    ensure_currency_catalog(db)
    rows = db.query(Currency.code).filter(Currency.is_enabled.is_(True)).order_by(Currency.code.asc()).all()
    out = [r[0] for r in rows] if rows else []
    # fallback to env if db empty
    if not out:
        out = settings.fx_currency_list
    if "USD" not in out:
        out = ["USD", *out]
    return sorted({c.strip().upper() for c in out if c and c.strip()})


def sync_fx_rates(
    db,
    start: date,
    end: date,
    currencies: list[str] | None = None,
    source: str | None = None,
) -> dict[str, int]:
    """
    Sync daily FX rates into database, storing USD->currency rates (usd_rate).
    Upserts by (rate_date, currency).
    """
    settings = get_settings()
    if start > end:
        start, end = end, start

    source_name = (source or settings.fx_source or settings.fx_base_url).strip()[:64]
    if currencies is None:
        cur_list = get_enabled_currency_codes(db)
    else:
        cur_list = sorted({c.strip().upper() for c in currencies if c and c.strip()})
        if "USD" not in cur_list:
            cur_list = ["USD", *cur_list]

    # Validate against provider-supported currencies (best-effort).
    try:
        supported = fetch_currency_catalog()
        supported_codes = {k.upper() for k in supported.keys()}
        if supported_codes:
            unsupported = sorted({c for c in cur_list if c.upper() not in supported_codes and c.upper() != "USD"})
            if unsupported:
                raise ValueError(
                    "Unsupported currency codes for FX provider: " + ", ".join(unsupported)
                )
    except httpx.HTTPError:
        # If provider is temporarily unreachable, don't block syncing; it will fail later per-request anyway.
        pass

    rows_upserted = 0
    days = 0

    day = start
    while day <= end:
        rates = fetch_rates_for_date(day, base="USD", currencies=cur_list)
        for cur in cur_list:
            cur_u = cur.upper()
            usd_rate = rates.get(cur_u)
            if usd_rate is None:
                continue
            existing = (
                db.query(FxRate)
                .filter(FxRate.rate_date == day, FxRate.currency == cur_u)
                .first()
            )
            if existing:
                existing.usd_rate = float(usd_rate)
                existing.source = source_name
            else:
                db.add(
                    FxRate(
                        rate_date=day,
                        currency=cur_u,
                        usd_rate=float(usd_rate),
                        source=source_name,
                    )
                )
            rows_upserted += 1
        db.commit()
        days += 1
        day = day + timedelta(days=1)

    return {"days": days, "rows_upserted": rows_upserted, "currencies": len(cur_list)}


def _nearest_rate_on_or_before(dates: list[date], rates: list[float], target: date) -> float | None:
    """
    Find the latest rate on or before target date.
    If there is no earlier/equal rate, return None (do NOT forward-fill from future rates).
    """
    if not dates:
        return None
    idx = bisect.bisect_right(dates, target) - 1
    if idx < 0:
        return None
    return rates[idx]


def load_usd_rate_series(db, currencies: set[str], max_date: date) -> dict[str, tuple[list[date], list[float]]]:
    """
    Load FX series from db for currencies up to max_date (inclusive).
    Result mapping: currency -> (dates[], rates[]) where rate is 1 USD -> rate * currency.
    """
    cur_set = {c.strip().upper() for c in currencies if c and c.strip()}
    series: dict[str, tuple[list[date], list[float]]] = {}
    for cur in sorted(cur_set):
        if cur == "USD":
            series[cur] = ([date.min], [1.0])
            continue
        rows = (
            db.query(FxRate)
            .filter(FxRate.currency == cur, FxRate.rate_date <= max_date)
            .order_by(FxRate.rate_date.asc())
            .all()
        )
        ds = [r.rate_date for r in rows]
        rs = [float(r.usd_rate) for r in rows]
        series[cur] = (ds, rs)
    return series


def convert_amount_by_usd_series(
    amount: float,
    from_currency: str,
    to_currency: str,
    day: date,
    series: dict[str, tuple[list[date], list[float]]],
) -> float | None:
    """
    Convert using stored USD daily rates (preferred) for the given day.
    Returns None if missing either currency series.
    """
    from_currency = from_currency.upper()
    to_currency = to_currency.upper()
    if from_currency == to_currency:
        return float(amount)

    from_series = series.get(from_currency)
    to_series = series.get(to_currency)
    if not from_series or not to_series:
        return None
    rate_from = _nearest_rate_on_or_before(from_series[0], from_series[1], day)
    rate_to = _nearest_rate_on_or_before(to_series[0], to_series[1], day)
    if not rate_from or not rate_to:
        return None
    # 1 USD = rate_from * FROM ; 1 USD = rate_to * TO
    # FROM -> TO = amount * (rate_to / rate_from)
    return float(amount) * (float(rate_to) / float(rate_from))
