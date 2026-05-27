"""FRED — Federal Reserve Economic Data, official US Federal Reserve.

Public endpoint:  https://api.stlouisfed.org/fred
Docs:             https://fred.stlouisfed.org/docs/api/fred/
Auth:             FREE API key (instant signup at
                  https://fred.stlouisfed.org/docs/api/api_key.html)
Rate limit:       120 requests / minute per key — well above what the
                  framework's 1 RPS produces.
TTL:              series-specific. Daily series update each business day;
                  monthly series update once a month. The seeder pulls a
                  rolling window so the cache age is irrelevant past the
                  next refresh.

FRED hosts 800k+ time series from the US Federal Reserve and partner
agencies. Of interest to a bakery procurement system:

  - DCOILWTICO        Crude oil, WTI cushing OK (USD/barrel, daily)
  - DHHNGSP           Natural gas, Henry Hub spot (USD/MMBtu, daily)
  - GASREGW           Retail gasoline, regular grade (USD/gal, weekly)
  - PWHEAMTUSDM       Global wheat price, IMF (USD/metric ton, monthly)
  - PSUGAISAUSDM      Global sugar price, IMF (USD/lb, monthly)
  - CPIUFDSL          US food CPI (index, monthly)
  - DEXCAUS           CAD/USD exchange rate (CAD per 1 USD, daily)

This fetcher takes a series_id as the cache key and returns parsed
observations. Without an API key the fetcher raises a clear error so the
admin UI surfaces "Set FRED_API_KEY in .env" instead of an HTTP error.

Returns a dict shaped:
    {
      "series_id":   "DCOILWTICO",
      "title":       "Crude Oil Prices: West Texas Intermediate (WTI)...",
      "units":       "Dollars per Barrel",
      "frequency":   "Daily",
      "rows": [{"date": "2026-05-27", "value": 62.31}, ...]
    }

Cache key is `f"{series_id}_{recent}d"`; one snapshot per series under
`infra/data/cache/fred/`.
"""

from __future__ import annotations

import os
from datetime import date, timedelta
from typing import Any
from urllib.parse import urlencode

from . import http
from .base import Fetcher

FRED_BASE = "https://api.stlouisfed.org/fred"


class FredApiKeyMissing(RuntimeError):
    """Raised when FRED_API_KEY env var is unset or blank."""


class FredFetcher(Fetcher):
    source = "fred"
    # FRED publishes a permissive robots.txt and explicitly documents
    # programmatic access. Honor robots; framework UA + 1 RPS is fine.
    respects_robots = True

    def __init__(self, *, recent_days: int = 365):
        self.recent_days = recent_days
        self.api_key = (os.environ.get("FRED_API_KEY") or "").strip()

    def _require_key(self) -> str:
        if not self.api_key:
            raise FredApiKeyMissing(
                "FRED_API_KEY is not set. Get a free key at "
                "https://fred.stlouisfed.org/docs/api/api_key.html and "
                "add FRED_API_KEY=... to .env."
            )
        # FRED keys are 32-char lowercase alphanumeric — quick sanity check.
        if len(self.api_key) != 32 or not self.api_key.isalnum() or not self.api_key.islower():
            raise FredApiKeyMissing(
                "FRED_API_KEY does not look like a valid FRED key "
                "(should be 32 lowercase alphanumeric characters)."
            )
        return self.api_key

    def _fetch_meta(self, series_id: str) -> dict[str, Any]:
        """Pull the seriesDetail metadata so we can record units / frequency."""
        key = self._require_key()
        params = {"series_id": series_id, "api_key": key, "file_type": "json"}
        url = f"{FRED_BASE}/series?{urlencode(params)}"
        resp = http.get(url, check_robots=self.respects_robots)
        resp.raise_for_status()
        payload = resp.json()
        series = (payload.get("seriess") or [])
        return series[0] if series else {}

    def fetch_live(self, key: str) -> tuple[dict[str, Any], str]:
        # `key` is the series_id (e.g. "DCOILWTICO"). The cache key in
        # `get()` includes the window so different recencies don't collide.
        series_id = key.split("_")[0]
        api_key = self._require_key()

        end = date.today()
        start = end - timedelta(days=self.recent_days)
        params = {
            "series_id":          series_id,
            "api_key":            api_key,
            "file_type":          "json",
            "observation_start":  start.isoformat(),
            "observation_end":    end.isoformat(),
            "sort_order":         "asc",
        }
        url = f"{FRED_BASE}/series/observations?{urlencode(params)}"
        resp = http.get(url, check_robots=self.respects_robots)
        resp.raise_for_status()

        payload = resp.json()
        obs_raw = payload.get("observations") or []
        rows: list[dict[str, Any]] = []
        for obs in obs_raw:
            d = obs.get("date")
            v = obs.get("value")
            # FRED returns "." for missing observations — skip silently.
            if d is None or v in (None, "", "."):
                continue
            try:
                value = float(v)
            except (TypeError, ValueError):
                continue
            rows.append({"date": d, "value": value})

        if not rows:
            raise ValueError(f"FRED returned no observations for series {series_id!r}")

        meta = self._fetch_meta(series_id)

        return (
            {
                "series_id": series_id,
                "title":     meta.get("title", ""),
                "units":     meta.get("units", ""),
                "frequency": meta.get("frequency", ""),
                "rows":      rows,
            },
            url,
        )


def fetch_series(series_id: str, *, recent_days: int = 365) -> dict[str, Any]:
    """Convenience wrapper — live-then-cache-fallback FRED series history."""
    cache_key = f"{series_id}_{recent_days}d"
    return FredFetcher(recent_days=recent_days).get(cache_key).data
