"""Frankfurter.app — ECB-sourced daily FX reference rates, free and keyless.

Public endpoint:  https://api.frankfurter.dev/v1
Docs:             https://www.frankfurter.app/docs/
Auth:             none (keyless, public, documented)
Rate limit:       none published; framework default 1 RPS is well within bounds.
TTL:              daily — ECB publishes once per business day around 16:00 CET.

Frankfurter wraps the European Central Bank's published rates (the same
table central banks reference for reporting). Coverage is broader than
the Bank of Canada Valet feed (30+ currencies vs. CAD-only) and lets us
build cross-currency landed-cost math for any supplier currency.

Key contract: pass a single ISO-4217 base currency code (e.g. "USD") and
the seed script enumerates the symbols it wants from the response. The
cache stores the full multi-currency response so a single fetch backs
many `fx-*` rows.

Returns a dict shaped:
    {
      "base":  "USD",
      "start": "2026-04-01",
      "end":   "2026-05-27",
      "rates": {
        "2026-04-01": {"CAD": 1.3894, "CHF": 0.79199, "EUR": 0.8617, ...},
        "2026-04-02": {...},
        ...
      }
    }

Cache key is `f"{base}_{days}d"` so we don't fragment by exact date.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from urllib.parse import urlencode

from . import http
from .base import Fetcher

FRANKFURTER_BASE = "https://api.frankfurter.dev/v1"

# Default symbol set — major currencies bakery suppliers may quote in.
# Override per call via the seeder if you need a different basket.
DEFAULT_SYMBOLS = ("EUR", "GBP", "JPY", "CHF", "CAD", "MXN", "CNY", "AUD")


class FrankfurterFetcher(Fetcher):
    source = "frankfurter"
    # Frankfurter publishes a permissive robots.txt and explicitly invites
    # API consumption. Honor robots; framework UA + 1 RPS is fine.
    respects_robots = True

    def __init__(self, *, base: str = "USD", days: int = 90,
                 symbols: tuple[str, ...] = DEFAULT_SYMBOLS):
        self.base = base.upper()
        self.days = days
        self.symbols = tuple(s.upper() for s in symbols)

    def fetch_live(self, key: str) -> tuple[dict[str, Any], str]:
        # Ignore the cache key from the abstract base; we encode the
        # request shape in this object's __init__ args. The cache key
        # the base class uses is just the string passed to get() — we
        # accept any key and document the convention in the seeder.
        end = date.today()
        start = end - timedelta(days=self.days)
        # Frankfurter range URL: /v1/{start}..{end}?base={base}&symbols=...
        params = {"base": self.base, "symbols": ",".join(self.symbols)}
        url = f"{FRANKFURTER_BASE}/{start.isoformat()}..{end.isoformat()}?{urlencode(params)}"
        resp = http.get(url, check_robots=self.respects_robots)
        resp.raise_for_status()

        payload = resp.json()
        rates_by_date = payload.get("rates") or {}
        if not rates_by_date:
            raise ValueError(f"Frankfurter returned no rates for base={self.base!r}")

        return (
            {
                "base":  payload.get("base", self.base),
                "start": payload.get("start_date"),
                "end":   payload.get("end_date"),
                "rates": rates_by_date,
            },
            url,
        )


def fetch_fx(base: str = "USD", *, days: int = 90,
             symbols: tuple[str, ...] = DEFAULT_SYMBOLS) -> dict[str, Any]:
    """Convenience wrapper — live-then-cache-fallback FX history."""
    cache_key = f"{base.upper()}_{days}d"
    return FrankfurterFetcher(base=base, days=days, symbols=symbols).get(cache_key).data
