"""Bank of Canada Valet API — official daily FX reference rates.

Public endpoint:  https://www.bankofcanada.ca/valet/observations/{series}/json
Docs:             https://www.bankofcanada.ca/valet/docs
Auth:             none (keyless, public, documented)
Rate limit:       none published; framework default 1 RPS is well within bounds.
TTL:              daily — reference rates publish once per business day.

Common series we use:
  - FXCADUSD   CAD per 1 USD (daily reference)
  - FXCADEUR   CAD per 1 EUR (daily reference)

Returns a dict shaped:
    {
      "series": "FXCADUSD",
      "label":  "CAD/USD",
      "rows":   [{"date": "2026-05-26", "rate": 1.3621}, ...]
    }

The cache key is the BoC series code; one snapshot per series under
`infra/data/cache/bank_of_canada/`.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

from . import http
from .base import Fetcher

VALET_BASE = "https://www.bankofcanada.ca/valet/observations"


class BankOfCanadaFetcher(Fetcher):
    source = "bank_of_canada"
    # BoC's robots.txt is permissive for /valet/. We honor it like any
    # other documented public API and pass the polite User-Agent + 1 RPS
    # rate limit enforced by fetchers.http.
    respects_robots = True

    def __init__(self, *, recent: int = 90):
        self.recent = recent

    def fetch_live(self, key: str) -> tuple[dict[str, Any], str]:
        params = {"recent": self.recent}
        url = f"{VALET_BASE}/{key}/json?{urlencode(params)}"
        resp = http.get(url, check_robots=self.respects_robots)
        resp.raise_for_status()

        payload = resp.json()
        series_detail = (payload.get("seriesDetail") or {}).get(key) or {}
        observations = payload.get("observations") or []
        if not observations:
            raise ValueError(f"BoC returned no observations for series {key!r}")

        rows: list[dict[str, Any]] = []
        for obs in observations:
            d = obs.get("d")
            cell = obs.get(key) or {}
            v = cell.get("v")
            if d is None or v in (None, ""):
                # Weekends / holidays publish empty values — skip.
                continue
            try:
                rate = float(v)
            except (TypeError, ValueError):
                continue
            rows.append({"date": d, "rate": rate})

        if not rows:
            raise ValueError(f"BoC observations for series {key!r} were all empty")

        return (
            {
                "series": key,
                "label":  series_detail.get("label", key),
                "rows":   rows,
            },
            url,
        )


def fetch_series(series: str, *, recent: int = 90) -> dict[str, Any]:
    """Convenience wrapper — live-then-cache-fallback daily FX series."""
    return BankOfCanadaFetcher(recent=recent).get(series).data
