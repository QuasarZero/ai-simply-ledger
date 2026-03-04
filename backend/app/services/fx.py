from __future__ import annotations

import bisect
from datetime import date, timedelta

import httpx

from app.config import get_settings
from app.models import Currency, FxRate
from app.services.fx_providers import FxRateLimitError, FxProviderError, build_provider_chain


def fetch_rates_for_date(day: date, base: str = "USD", currencies: list[str] | None = None) -> dict[str, float]:
    # Backward-compatible helper: use the first configured provider.
    base_u = (base or "USD").strip().upper()
    providers = build_provider_chain()
    if not providers:
        raise ValueError("No FX providers configured")
    p0 = providers[0]
    rates = p0.fetch_rates_for_date(day, base=base_u, currencies=currencies)
    rates[base_u] = 1.0
    return rates


def fetch_currency_catalog() -> dict[str, str]:
    # Best-effort: ask providers in order until one returns a non-empty catalog.
    for p in build_provider_chain():
        try:
            catalog = p.fetch_currency_catalog() or {}
        except (FxRateLimitError, FxProviderError, httpx.HTTPError):
            continue
        if catalog:
            return catalog
    return {}


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
    # FX_CURRENCIES is used ONLY as initial defaults for enabling currencies on first seed.
    enabled_defaults = set(settings.fx_currency_list)

    if existing >= 20:
        # Do not override admin-managed currency enablement after initial seed.
        try:
            enabled_cnt = int(db.query(Currency).filter(Currency.is_enabled.is_(True)).count() or 0)
            if enabled_cnt == 0:
                # Keep system usable: ensure USD is enabled.
                cur = db.query(Currency).filter(Currency.code == "USD").first()
                if cur:
                    cur.is_enabled = True
                else:
                    db.add(Currency(code="USD", name="USD", is_enabled=True))
                db.commit()
        except Exception:
            db.rollback()
        return

    try:
        catalog = fetch_currency_catalog()
    except Exception:
        return
    if not catalog:
        # If providers are unreachable and db is empty, seed USD minimally to keep the system usable.
        if existing == 0:
            try:
                cur = db.query(Currency).filter(Currency.code == "USD").first()
                if not cur:
                    db.add(Currency(code="USD", name="USD", is_enabled=True))
                else:
                    cur.is_enabled = True
                db.commit()
            except Exception:
                db.rollback()
        return

    for code, name in catalog.items():
        cur = db.query(Currency).filter(Currency.code == code).first()
        if cur:
            if not cur.name and name:
                cur.name = name
            # do not override is_enabled here
            continue
        db.add(Currency(code=code, name=name, is_enabled=(code in enabled_defaults)))
    try:
        db.commit()
    except Exception:
        db.rollback()

    # Ensure there is at least one enabled currency to keep the system usable.
    try:
        enabled_cnt = int(db.query(Currency).filter(Currency.is_enabled.is_(True)).count() or 0)
        if enabled_cnt == 0:
            cur = db.query(Currency).filter(Currency.code == "USD").first()
            if cur:
                cur.is_enabled = True
            else:
                db.add(Currency(code="USD", name="USD", is_enabled=True))
            db.commit()
    except Exception:
        db.rollback()


def get_enabled_currency_codes(db) -> list[str]:
    ensure_currency_catalog(db)
    rows = db.query(Currency.code).filter(Currency.is_enabled.is_(True)).order_by(Currency.code.asc()).all()
    out = [r[0] for r in rows] if rows else []
    if not out:
        # Safety net: ensure at least USD is enabled.
        try:
            cur = db.query(Currency).filter(Currency.code == "USD").first()
            if cur:
                cur.is_enabled = True
            else:
                db.add(Currency(code="USD", name="USD", is_enabled=True))
            db.commit()
        except Exception:
            db.rollback()
        rows = db.query(Currency.code).filter(Currency.is_enabled.is_(True)).order_by(Currency.code.asc()).all()
        out = [r[0] for r in rows] if rows else ["USD"]
    if "USD" not in out:
        out = ["USD", *out]
    return sorted({c.strip().upper() for c in out if c and c.strip()})


def sync_fx_rates(
    db,
    start: date,
    end: date,
    currencies: list[str] | None = None,
    source: str | None = None,
    progress_cb=None,
) -> dict[str, int]:
    """
    Sync daily FX rates into database, storing USD->currency rates (usd_rate).
    Upserts by (rate_date, currency).
    """
    settings = get_settings()
    if start > end:
        start, end = end, start

    providers = build_provider_chain()
    source_name = (source or (providers[0].name if providers else "fx")).strip()[:64]
    if currencies is None:
        cur_list = get_enabled_currency_codes(db)
    else:
        cur_list = sorted({c.strip().upper() for c in currencies if c and c.strip()})
        if "USD" not in cur_list:
            cur_list = ["USD", *cur_list]

    # Optional validation against catalogs (best-effort, only if some provider returns a catalog).
    try:
        supported = fetch_currency_catalog()
        supported_codes = {k.upper() for k in supported.keys()}
        if supported_codes:
            unsupported = sorted({c for c in cur_list if c.upper() not in supported_codes and c.upper() != "USD"})
            if unsupported:
                raise ValueError("Unsupported currency codes for FX providers: " + ", ".join(unsupported))
    except Exception:
        pass

    # Compute missing pairs first to allow multi-provider fill.
    missing_by_day: dict[date, set[str]] = {}
    day = start
    while day <= end:
        missing_by_day[day] = set(cur_list)
        day = day + timedelta(days=1)

    existing = (
        db.query(FxRate.rate_date, FxRate.currency)
        .filter(FxRate.rate_date >= start, FxRate.rate_date <= end)
        .filter(FxRate.currency.in_(cur_list))
        .all()
    )
    for d, c in existing:
        s = missing_by_day.get(d)
        if s is not None:
            s.discard(str(c).upper())

    def count_missing() -> int:
        return sum(len(v) for v in missing_by_day.values())

    missing_total = count_missing()
    rows_upserted = 0
    days_total = (end - start).days + 1

    if progress_cb:
        progress_cb(
            {
                "status": "running",
                "provider": None,
                "provider_index": 0,
                "provider_total": len(providers),
                "day_total": days_total,
                "day_done": 0,
                "missing_total": missing_total,
                "missing_remaining": missing_total,
                "rows_upserted": 0,
                "message": "starting",
            }
        )

    today = date.today()
    provider_index = 0
    for p in providers:
        provider_index += 1
        if count_missing() == 0:
            break

        if progress_cb:
            progress_cb(
                {
                    "status": "running",
                    "provider": p.name,
                    "provider_index": provider_index,
                    "provider_total": len(providers),
                    "day_total": days_total,
                    "day_done": 0,
                    "missing_total": missing_total,
                    "missing_remaining": count_missing(),
                    "rows_upserted": rows_upserted,
                    "message": f"using provider {p.name}",
                }
            )

        # If provider cannot serve historical, only try to fill "today".
        if not getattr(p, "supports_historical", True):
            days_iter = [today] if start <= today <= end else []
        else:
            days_iter = [start + timedelta(days=i) for i in range(days_total)]

        day_done = 0
        rate_limited = False
        for d in days_iter:
            day_done += 1
            want = missing_by_day.get(d)
            if not want:
                continue
            want_list = sorted(want)
            try:
                rates = p.fetch_rates_for_date(d, base="USD", currencies=want_list)
            except FxRateLimitError:
                rate_limited = True
                if progress_cb:
                    progress_cb(
                        {
                            "status": "running",
                            "provider": p.name,
                            "provider_index": provider_index,
                            "provider_total": len(providers),
                            "day_total": days_total,
                            "day_done": day_done,
                            "missing_total": missing_total,
                            "missing_remaining": count_missing(),
                            "rows_upserted": rows_upserted,
                            "message": f"{p.name} rate limited; skipping provider",
                        }
                    )
                break
            except FxProviderError as e:
                # Provider is misconfigured or doesn't support the requested operation; skip provider entirely.
                if progress_cb:
                    progress_cb(
                        {
                            "status": "running",
                            "provider": p.name,
                            "provider_index": provider_index,
                            "provider_total": len(providers),
                            "day_total": days_total,
                            "day_done": day_done,
                            "missing_total": missing_total,
                            "missing_remaining": count_missing(),
                            "rows_upserted": rows_upserted,
                            "message": f"{p.name} unavailable: {str(e)[:160]}",
                        }
                    )
                break
            except Exception as e:
                # Provider errors should not abort overall sync; continue to next provider/day.
                if progress_cb:
                    progress_cb(
                        {
                            "status": "running",
                            "provider": p.name,
                            "provider_index": provider_index,
                            "provider_total": len(providers),
                            "day_total": days_total,
                            "day_done": day_done,
                            "missing_total": missing_total,
                            "missing_remaining": count_missing(),
                            "rows_upserted": rows_upserted,
                            "message": f"{p.name} error on {d.isoformat()}: {str(e)[:120]}",
                        }
                    )
                continue

            for cur in list(want_list):
                cur_u = cur.upper()
                usd_rate = rates.get(cur_u)
                if usd_rate is None:
                    continue
                existing_row = (
                    db.query(FxRate)
                    .filter(FxRate.rate_date == d, FxRate.currency == cur_u)
                    .first()
                )
                if existing_row:
                    existing_row.usd_rate = float(usd_rate)
                    existing_row.source = p.name
                else:
                    db.add(FxRate(rate_date=d, currency=cur_u, usd_rate=float(usd_rate), source=p.name))
                rows_upserted += 1
                want.discard(cur_u)

            db.commit()
            if progress_cb:
                progress_cb(
                    {
                        "status": "running",
                        "provider": p.name,
                        "provider_index": provider_index,
                        "provider_total": len(providers),
                        "day_total": days_total,
                        "day_done": day_done,
                        "missing_total": missing_total,
                        "missing_remaining": count_missing(),
                        "rows_upserted": rows_upserted,
                        "message": f"{p.name} synced {d.isoformat()}",
                    }
                )

        if rate_limited:
            continue

    result = {"days": days_total, "rows_upserted": rows_upserted, "currencies": len(cur_list)}
    if progress_cb:
        progress_cb(
            {
                "status": "success" if count_missing() == 0 else "partial",
                "provider": None,
                "provider_index": len(providers),
                "provider_total": len(providers),
                "day_total": days_total,
                "day_done": days_total,
                "missing_total": missing_total,
                "missing_remaining": count_missing(),
                "rows_upserted": rows_upserted,
                "message": "completed",
                "result": result,
            }
        )
    return result


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
