"""Yahoo Finance v8 chart endpoint — daily OHLCV for futures, stocks, indices.

Public endpoint: https://query1.finance.yahoo.com/v8/finance/chart/{symbol}
Auth:            none (keyless, public, widely consumed)
Rate limit:      none published; framework default 1 RPS is well within bounds.
TTL:             daily — close prices update once per trading session.

The endpoint is undocumented but stable for ~10 years and is the same one
the `yfinance` library uses. Yahoo's robots.txt disallows generic crawlers
on /quote/ HTML pages but the v8 chart JSON API is consumed by third-party
tools at scale without challenge; we mirror the Nominatim pattern of
`respects_robots = False` with a polite identifying User-Agent + 1 RPS.

Common symbols we use:
  - ZW=F   CBOT wheat futures (continuous front-month), USD cents / bushel.
  - SB=F   ICE sugar #11 futures, USD cents / lb (future use).
  - ZC=F   CBOT corn futures (continuous front-month), USD cents / bushel.

Returns a list of daily OHLCV dicts (oldest first):
    [
      {"date": "2026-02-09", "open": 528.0, "high": 530.5, "low": 525.0,
       "close": 528.75, "volume": 12345},
      ...
    ]

The cache key is the Yahoo symbol; one snapshot per symbol under
`infra/data/cache/yahoo_finance/`.
"""

from __future__ import annotations

from datetime import date, timezone
from datetime import datetime as dt
from typing import Any
from urllib.parse import urlencode

from . import http
from .base import Fetcher

YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"


class YahooFinanceFetcher(Fetcher):
    source = "yahoo_finance"
    # See module docstring for rationale.
    respects_robots = False

    def __init__(self, *, range_window: str = "1y", interval: str = "1d"):
        self.range_window = range_window
        self.interval = interval

    def fetch_live(self, key: str) -> tuple[list[dict[str, Any]], str]:
        # Yahoo's v8 chart endpoint 404s on unknown symbols; we let
        # `raise_for_status()` raise so the base class can fall back to cache.
        params = {"range": self.range_window, "interval": self.interval}
        url = f"{YAHOO_BASE}/{key}?{urlencode(params)}"
        resp = http.get(url, check_robots=self.respects_robots)
        resp.raise_for_status()

        payload = resp.json()
        results = (payload.get("chart") or {}).get("result") or []
        if not results:
            raise ValueError(f"Yahoo returned no chart result for symbol {key!r}")

        result = results[0]
        timestamps: list[int] = result.get("timestamp") or []
        quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
        opens = quote.get("open") or []
        highs = quote.get("high") or []
        lows = quote.get("low") or []
        closes = quote.get("close") or []
        volumes = quote.get("volume") or []

        if not timestamps or not closes:
            raise ValueError(f"Yahoo returned empty OHLCV arrays for symbol {key!r}")

        rows: list[dict[str, Any]] = []
        for i, ts in enumerate(timestamps):
            close = closes[i] if i < len(closes) else None
            if close is None:
                continue  # market closed / partial bar; skip
            d = dt.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
            rows.append(
                {
                    "date":   d,
                    "open":   opens[i] if i < len(opens) else None,
                    "high":   highs[i] if i < len(highs) else None,
                    "low":    lows[i] if i < len(lows) else None,
                    "close":  close,
                    "volume": volumes[i] if i < len(volumes) else None,
                }
            )

        if not rows:
            raise ValueError(f"Yahoo returned only null closes for symbol {key!r}")

        meta = result.get("meta") or {}
        currency = meta.get("currency")  # e.g. 'USX' for cents, 'USD' for dollars
        # Attach currency at the list level via a sidecar key so callers can
        # interpret cents-vs-dollars without re-querying meta.
        return ({"currency": currency, "rows": rows}, url)


def fetch_daily(symbol: str, *, range_window: str = "1y") -> dict[str, Any]:
    """Convenience wrapper — live-then-cache-fallback daily history for a symbol."""
    return YahooFinanceFetcher(range_window=range_window).get(symbol).data
