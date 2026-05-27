"""OpenStreetMap Nominatim geocoder.

Public API:    https://nominatim.openstreetmap.org/search
Auth:          none (keyless, public)
Rate limit:    1 request per second per host (enforced in fetchers.http)
Usage policy:  https://operations.osmfoundation.org/policies/nominatim/
TTL:           90 days (street-level coordinates rarely change)

Returns a dict shaped:
    {
      "lat":         43.7531,
      "lng":         -79.5532,
      "display_name": "1295 Ormont Drive, Toronto, ...",
      "address":     {<full Nominatim address payload>},
    }

The cache key is the free-form query string passed to `geocode()`, so
"1295 Ormont Drive, Toronto, ON, Canada" and "Mississauga civic centre,
ON, Canada" each get their own snapshot under
`infra/data/cache/nominatim/`.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

from . import http
from .base import Fetcher

NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search"


class NominatimFetcher(Fetcher):
    source = "nominatim"
    # Nominatim's robots.txt disallows `/search` for HTML crawlers but their
    # public Usage Policy explicitly invites API consumers to use the same
    # endpoint at 1 RPS with a polite identifying User-Agent. We comply with
    # the policy (rate limit + UA enforced in fetchers.http) and bypass the
    # robots check for this specific documented-API source.
    respects_robots = False

    def fetch_live(self, key: str) -> tuple[dict[str, Any], str]:
        params = {
            "q": key,
            "format": "json",
            "limit": 1,
            "addressdetails": 1,
        }
        url = f"{NOMINATIM_BASE}?{urlencode(params)}"
        resp = http.get(url, check_robots=self.respects_robots)
        resp.raise_for_status()

        results = resp.json()
        if not results:
            raise ValueError(f"Nominatim returned 0 results for query {key!r}")

        first = results[0]
        return (
            {
                "lat": float(first["lat"]),
                "lng": float(first["lon"]),
                "display_name": first.get("display_name"),
                "address": first.get("address", {}),
            },
            url,
        )


def geocode(address: str) -> dict[str, Any]:
    """Convenience wrapper -- live-then-cache-fallback geocode of `address`."""
    return NominatimFetcher().get(address).data
