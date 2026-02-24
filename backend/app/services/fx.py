from __future__ import annotations

import time
from dataclasses import dataclass

import httpx

from app.config import get_settings


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

