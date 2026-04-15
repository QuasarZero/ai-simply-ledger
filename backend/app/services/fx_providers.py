from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol

import httpx

from app.config import get_settings


class FxRateLimitError(RuntimeError):
    pass


class FxProviderError(RuntimeError):
    pass


class FxProvider(Protocol):
    name: str
    supports_historical: bool

    def fetch_rates_for_date(
        self,
        day: date,
        *,
        base: str = "USD",
        currencies: list[str] | None = None,
    ) -> dict[str, float]:
        """
        Return mapping CURRENCY -> rate where 1 BASE == rate * CURRENCY.
        Must include base itself with rate 1.0.
        """

    def fetch_currency_catalog(self) -> dict[str, str]:
        """Return mapping CODE -> name. Best-effort; may return {}."""


def _raise_if_rate_limited(resp: httpx.Response) -> None:
    if resp.status_code == 429:
        raise FxRateLimitError("rate limited")


def _as_upper_rates(rates: dict) -> dict[str, float]:
    out: dict[str, float] = {}
    for k, v in (rates or {}).items():
        code = str(k).strip().upper()
        if not code:
            continue
        try:
            out[code] = float(v)
        except Exception:
            continue
    return out


_provider_day_cache: dict[tuple[str, str], dict[str, float]] = {}


@dataclass(frozen=True)
class FrankfurterProvider:
    name: str = "frankfurter"
    supports_historical: bool = True
    base_url: str = "https://api.frankfurter.app"

    def fetch_rates_for_date(
        self, day: date, *, base: str = "USD", currencies: list[str] | None = None
    ) -> dict[str, float]:
        base_u = (base or "USD").strip().upper()
        url = f"{self.base_url.rstrip('/')}/{day.isoformat()}"
        params: dict[str, str] = {"from": base_u}
        if currencies:
            targets = sorted(
                {
                    c.strip().upper()
                    for c in currencies
                    if c and c.strip() and c.strip().upper() != base_u
                }
            )
            if targets:
                params["to"] = ",".join(targets)
        with httpx.Client(timeout=20) as client:
            resp = client.get(url, params=params)
            _raise_if_rate_limited(resp)
            resp.raise_for_status()
            data = resp.json()
        rates = _as_upper_rates(data.get("rates") or {})
        rates[base_u] = 1.0
        return rates

    def fetch_currency_catalog(self) -> dict[str, str]:
        url = f"{self.base_url.rstrip('/')}/currencies"
        with httpx.Client(timeout=20) as client:
            resp = client.get(url)
            _raise_if_rate_limited(resp)
            resp.raise_for_status()
            data = resp.json()
        if not isinstance(data, dict):
            return {}
        out: dict[str, str] = {}
        for k, v in data.items():
            code = str(k).strip().upper()
            if not code:
                continue
            out[code] = str(v).strip() if v is not None else code
        return out


@dataclass(frozen=True)
class FawazAhmedProvider:
    """
    https://github.com/fawazahmed0/exchange-api (currency-api)
    We use the JSDelivr NPM CDN endpoints.

    Example:
      https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2025-03-01/v1/currencies/usd.json
    """

    name: str = "fawazahmed"
    supports_historical: bool = True

    def fetch_rates_for_date(
        self, day: date, *, base: str = "USD", currencies: list[str] | None = None
    ) -> dict[str, float]:
        base_u = (base or "USD").strip().upper()
        if base_u != "USD":
            raise FxProviderError("fawazahmed provider only supports base USD in this app")

        d = day.isoformat()
        cache_key = (self.name, d)
        cached = _provider_day_cache.get(cache_key)
        if cached:
            rates = cached
        else:
            base_l = base_u.lower()
            url = f"https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{d}/v1/currencies/{base_l}.json"
            with httpx.Client(timeout=20) as client:
                resp = client.get(url)
                _raise_if_rate_limited(resp)
                resp.raise_for_status()
                data = resp.json()
            rates_raw = data.get(base_l) or {}
            rates = _as_upper_rates(rates_raw)
            rates[base_u] = 1.0
            _provider_day_cache[cache_key] = rates

        if currencies:
            want = {c.strip().upper() for c in currencies if c and c.strip()}
            return {k: v for k, v in rates.items() if k in want or k == base_u}
        return rates

    def fetch_currency_catalog(self) -> dict[str, str]:
        # No official catalog endpoint. Best-effort: infer from latest USD snapshot.
        url = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
        try:
            with httpx.Client(timeout=20) as client:
                resp = client.get(url)
                _raise_if_rate_limited(resp)
                resp.raise_for_status()
                data = resp.json()
            rates_raw = (data or {}).get("usd") or {}
            codes = sorted({str(k).strip().upper() for k in rates_raw.keys() if str(k).strip()})
            return {c: c for c in codes}
        except Exception:
            return {}


@dataclass(frozen=True)
class FloatRatesProvider:
    """
    http://www.floatrates.com/ provides latest daily rates (no historical range).
    We'll only use it for "today" as a fallback.
    """

    name: str = "floatrates"
    supports_historical: bool = False
    base_url: str = "http://www.floatrates.com"

    def fetch_rates_for_date(
        self, day: date, *, base: str = "USD", currencies: list[str] | None = None
    ) -> dict[str, float]:
        base_u = (base or "USD").strip().upper()
        if base_u != "USD":
            raise FxProviderError("floatrates provider only supports base USD in this app")
        # endpoint always returns latest; caller should decide day applicability.
        url = f"{self.base_url.rstrip('/')}/daily/usd.json"
        with httpx.Client(timeout=20, follow_redirects=True) as client:
            resp = client.get(url)
            _raise_if_rate_limited(resp)
            resp.raise_for_status()
            data = resp.json()
        out: dict[str, float] = {"USD": 1.0}
        if isinstance(data, dict):
            for code_l, obj in data.items():
                code = str(code_l).strip().upper()
                if not code:
                    continue
                rate = None
                if isinstance(obj, dict):
                    rate = obj.get("rate")
                if rate is None:
                    continue
                try:
                    out[code] = float(rate)
                except Exception:
                    continue
        if currencies:
            want = {c.strip().upper() for c in currencies if c and c.strip()}
            return {k: v for k, v in out.items() if k in want or k == "USD"}
        return out

    def fetch_currency_catalog(self) -> dict[str, str]:
        # FloatRates doesn't provide a dedicated catalog endpoint, but the daily USD snapshot
        # contains currency names and covers many currencies.
        url = f"{self.base_url.rstrip('/')}/daily/usd.json"
        try:
            with httpx.Client(timeout=20, follow_redirects=True) as client:
                resp = client.get(url)
                _raise_if_rate_limited(resp)
                resp.raise_for_status()
                data = resp.json()
        except Exception:
            return {}

        out: dict[str, str] = {"USD": "United States Dollar"}
        if not isinstance(data, dict):
            return out

        for code_l, obj in data.items():
            code = str(code_l).strip().upper()
            if not code:
                continue
            name = code
            if isinstance(obj, dict):
                # Common fields: "name" / "code" / "alphaCode"
                if obj.get("name"):
                    name = str(obj.get("name")).strip() or code
            out[code] = name
        return out


@dataclass(frozen=True)
class OpenExchangeRatesProvider:
    name: str = "openexchangerates"
    supports_historical: bool = True

    def fetch_rates_for_date(
        self, day: date, *, base: str = "USD", currencies: list[str] | None = None
    ) -> dict[str, float]:
        settings = get_settings()
        app_id = (settings.openexchangerates_app_id or "").strip()
        if not app_id:
            raise FxProviderError("OPENEXCHANGERATES_APP_ID not configured")
        base_u = (base or "USD").strip().upper()
        if base_u != "USD":
            raise FxProviderError("openexchangerates provider only supports base USD in this app")

        url = f"https://openexchangerates.org/api/historical/{day.isoformat()}.json"
        params: dict[str, str] = {"app_id": app_id}
        if currencies:
            targets = sorted({c.strip().upper() for c in currencies if c and c.strip() and c.strip().upper() != "USD"})
            if targets:
                params["symbols"] = ",".join(targets)

        with httpx.Client(timeout=20) as client:
            resp = client.get(url, params=params)
            _raise_if_rate_limited(resp)
            if resp.status_code in (401, 403):
                # Might be plan limitations or rate limit. Surface message.
                raise FxProviderError(f"openexchangerates error {resp.status_code}: {resp.text[:200]}")
            resp.raise_for_status()
            data = resp.json()

        rates = _as_upper_rates(data.get("rates") or {})
        rates["USD"] = 1.0
        return rates

    def fetch_currency_catalog(self) -> dict[str, str]:
        settings = get_settings()
        app_id = (settings.openexchangerates_app_id or "").strip()
        if not app_id:
            return {}
        url = "https://openexchangerates.org/api/currencies.json"
        with httpx.Client(timeout=20) as client:
            resp = client.get(url, params={"app_id": app_id})
            _raise_if_rate_limited(resp)
            resp.raise_for_status()
            data = resp.json()
        if not isinstance(data, dict):
            return {}
        out: dict[str, str] = {}
        for k, v in data.items():
            code = str(k).strip().upper()
            if not code:
                continue
            out[code] = str(v).strip() if v is not None else code
        return out


@dataclass(frozen=True)
class FreeCurrencyApiProvider:
    name: str = "freecurrencyapi"
    supports_historical: bool = True

    def fetch_rates_for_date(
        self, day: date, *, base: str = "USD", currencies: list[str] | None = None
    ) -> dict[str, float]:
        settings = get_settings()
        key = (settings.freecurrencyapi_key or "").strip()
        if not key:
            raise FxProviderError("FREECURRENCYAPI_KEY not configured")
        base_u = (base or "USD").strip().upper()
        if base_u != "USD":
            raise FxProviderError("freecurrencyapi provider only supports base USD in this app")

        url = "https://api.freecurrencyapi.com/v1/historical"
        params: dict[str, str] = {"apikey": key, "date": day.isoformat(), "base_currency": "USD"}
        if currencies:
            targets = sorted({c.strip().upper() for c in currencies if c and c.strip() and c.strip().upper() != "USD"})
            if targets:
                params["currencies"] = ",".join(targets)

        with httpx.Client(timeout=20) as client:
            resp = client.get(url, params=params)
            _raise_if_rate_limited(resp)
            if resp.status_code in (401, 403):
                raise FxProviderError(f"freecurrencyapi error {resp.status_code}: {resp.text[:200]}")
            resp.raise_for_status()
            data = resp.json()

        # data: { "data": { "2020-01-01": { "EUR": 0.89, ... } } }
        day_map = (data.get("data") or {}).get(day.isoformat()) or {}
        rates = _as_upper_rates(day_map)
        rates["USD"] = 1.0
        return rates

    def fetch_currency_catalog(self) -> dict[str, str]:
        settings = get_settings()
        key = (settings.freecurrencyapi_key or "").strip()
        if not key:
            return {}
        url = "https://api.freecurrencyapi.com/v1/currencies"
        with httpx.Client(timeout=20) as client:
            resp = client.get(url, params={"apikey": key})
            _raise_if_rate_limited(resp)
            resp.raise_for_status()
            data = resp.json()
        # data: { "data": { "USD": {"name":"United States Dollar", ...}, ... } }
        raw = (data.get("data") or {}) if isinstance(data, dict) else {}
        out: dict[str, str] = {}
        if isinstance(raw, dict):
            for k, v in raw.items():
                code = str(k).strip().upper()
                if not code:
                    continue
                name = code
                if isinstance(v, dict) and v.get("name"):
                    name = str(v.get("name")).strip() or code
                out[code] = name
        return out


def build_provider_chain() -> list[FxProvider]:
    settings = get_settings()
    order = [x.strip().lower() for x in (settings.fx_providers or "").split(",") if x.strip()]
    if not order:
        order = ["frankfurter"]
    providers: dict[str, FxProvider] = {
        "frankfurter": FrankfurterProvider(),
        "fawazahmed": FawazAhmedProvider(),
        "floatrates": FloatRatesProvider(),
        "openexchangerates": OpenExchangeRatesProvider(),
        "freecurrencyapi": FreeCurrencyApiProvider(),
    }
    out: list[FxProvider] = []
    for name in order:
        p = providers.get(name)
        if p:
            out.append(p)
    # Ensure at least frankfurter as final fallback for historical, if user omitted by mistake.
    if not any(p.name == "frankfurter" for p in out):
        out.append(FrankfurterProvider())
    return out
