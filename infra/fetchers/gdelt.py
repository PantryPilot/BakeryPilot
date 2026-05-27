"""GDELT 2.0 DOC API — worldwide news/event metadata, free and keyless.

Public endpoint:  https://api.gdeltproject.org/api/v2/doc/doc
Docs:             https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
Auth:             none (keyless, public, documented)
Rate limit:       GDELT's published policy is 1 request per 5 seconds —
                  stricter than the framework's 1 RPS default. We enforce
                  this here with a module-level pacing guard so the seed
                  script can iterate keywords without 429s.
TTL:              hourly is plenty (news cycle), but daily refresh from
                  the seeder is sufficient for risk-signal classification.

GDELT 2.0 DOC `mode=artlist` does NOT include per-article tone fields.
To filter for negative-sentiment news we push the tone filter into the
GDELT query string itself (e.g. `wheat shortage tone<-2`) — GDELT applies
the filter server-side. The seed script also adds `sourcelang:english`
to keep messages parseable in the action-card UI.

Returns a dict shaped:
    {
      "query":    "wheat shortage sourcelang:english tone<-2",
      "articles": [
        {"url": "...", "title": "...", "seendate": "20260526T140000Z",
         "domain": "news.example.com", "language": "English",
         "sourcecountry": "United States"},
        ...
      ]
    }

Cache key is the raw query string; one snapshot per query under
`infra/data/cache/gdelt/`.
"""

from __future__ import annotations

import time
from typing import Any
from urllib.parse import urlencode

from . import http
from .base import Fetcher

GDELT_BASE = "https://api.gdeltproject.org/api/v2/doc/doc"

# Module-level rate-limit guard: GDELT publishes 1 request per 5 seconds but
# in practice throttles 429 on bursts even at that pace. 8 s leaves comfortable
# margin while keeping a 7-keyword sweep under a minute.
_MIN_INTERVAL_SECONDS = 8.0
_last_call_at: float = 0.0


def _gdelt_pace() -> None:
    global _last_call_at
    elapsed = time.monotonic() - _last_call_at
    if elapsed < _MIN_INTERVAL_SECONDS:
        time.sleep(_MIN_INTERVAL_SECONDS - elapsed)
    _last_call_at = time.monotonic()


class GdeltFetcher(Fetcher):
    source = "gdelt"
    # GDELT's robots.txt disallows generic crawlers on gdeltproject.org but
    # api.gdeltproject.org is the explicitly documented public consumption
    # surface. Mirror the Nominatim/Yahoo rationale: honor the published
    # usage policy (5 s pacing above + polite UA from fetchers.http) and
    # bypass the robots check.
    respects_robots = False

    def __init__(self, *, timespan: str = "7d", maxrecords: int = 50, sort: str = "hybridrel"):
        self.timespan = timespan
        self.maxrecords = maxrecords
        self.sort = sort

    def fetch_live(self, key: str) -> tuple[dict[str, Any], str]:
        _gdelt_pace()

        params = {
            "query":      key,
            "mode":       "artlist",
            "format":     "json",
            "maxrecords": self.maxrecords,
            "sort":       self.sort,
            "timespan":   self.timespan,
        }
        url = f"{GDELT_BASE}?{urlencode(params)}"
        resp = http.get(url, check_robots=self.respects_robots, max_retries=2)
        resp.raise_for_status()

        # GDELT occasionally returns HTML error pages or rate-limit text
        # with HTTP 200 — guard before json().
        ctype = resp.headers.get("content-type", "").lower()
        if "json" not in ctype:
            raise ValueError(
                f"GDELT returned non-JSON content-type {ctype!r} for query {key!r}: "
                f"{resp.text[:200]}"
            )

        try:
            payload = resp.json()
        except ValueError as exc:
            raise ValueError(f"GDELT returned unparseable JSON for query {key!r}") from exc

        articles_raw = payload.get("articles") or []
        articles: list[dict[str, Any]] = []
        for a in articles_raw:
            articles.append(
                {
                    "url":           a.get("url"),
                    "title":         a.get("title"),
                    "seendate":      a.get("seendate"),  # YYYYMMDDTHHMMSSZ
                    "domain":        a.get("domain"),
                    "language":      a.get("language"),
                    "sourcecountry": a.get("sourcecountry"),
                }
            )

        return ({"query": key, "articles": articles}, url)


def fetch_articles(query: str, *, timespan: str = "7d") -> dict[str, Any]:
    """Convenience wrapper — live-then-cache-fallback news articles for a query."""
    return GdeltFetcher(timespan=timespan).get(query).data
