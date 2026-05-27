"""Abstract Fetcher with live-then-cache-fallback semantics.

Each concrete fetcher subclasses `Fetcher`, sets `source` (the cache
subfolder name), and implements `fetch_live(key)` to perform the actual
HTTP request and return `(parsed_data, source_url)`.

Calling `Fetcher.get(key)` then implements the contract:
    1. Try the live HTTP fetch.
    2. On success: write the parsed payload to cache and return it.
    3. On failure: read the cached snapshot, warn to stderr with cache
       age, and return the cached payload.
    4. On failure WITH no cached snapshot: raise `FetcherError` with a
       clear remediation hint.

This means a one-off network blip during seeding never blocks a demo
boot, but a fresh checkout with no internet still fails loudly so it
can be fixed instead of silently producing zero rows.
"""

from __future__ import annotations

import sys
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

from . import cache as cache_mod


class FetcherError(Exception):
    """Live fetch failed and no cached snapshot was available."""


@dataclass
class FetchResult:
    """Result of a Fetcher.get() call."""

    data: Any
    from_cache: bool
    age_seconds: int  # 0 for fresh live fetches
    source_url: str


class Fetcher(ABC):
    """Subclasses must set `source` (cache subfolder) and implement `fetch_live`.

    Subclasses may set `respects_robots = False` for documented public APIs
    whose usage policy is published separately from robots.txt -- e.g. the
    OpenStreetMap Nominatim API, which inhibits its `/search` endpoint via
    robots.txt for HTML crawlers while inviting API consumers to use the
    same endpoint at 1 RPS per its published Usage Policy. HTML scrapers
    leave this at the default (True).
    """

    source: str
    respects_robots: bool = True

    @abstractmethod
    def fetch_live(self, key: str) -> tuple[Any, str]:
        """Perform the live HTTP request for `key`.

        Return `(parsed_data, source_url)`. Raise on any error to
        trigger the cache-fallback path.
        """

    def get(self, key: str) -> FetchResult:
        """Try live first, fall back to cache on any error."""
        try:
            data, source_url = self.fetch_live(key)
        except Exception as live_exc:
            cached = cache_mod.read_cache(self.source, key)
            if cached is None:
                raise FetcherError(
                    f"Live fetch from source={self.source!r} key={key!r} failed and "
                    f"no cached snapshot exists at "
                    f"{cache_mod.cache_path(self.source, key)}. "
                    f"Reconnect to the network and retry, or check whether the "
                    f"upstream source has changed shape. "
                    f"Underlying error: {type(live_exc).__name__}: {live_exc}"
                ) from live_exc
            age = cache_mod.cache_age_seconds(self.source, key) or 0
            print(
                f"[{self.source}] WARN live fetch failed "
                f"({type(live_exc).__name__}: {live_exc}); "
                f"falling back to cache aged {age}s "
                f"({cache_mod.cache_path(self.source, key).name}).",
                file=sys.stderr,
            )
            return FetchResult(
                data=cached["data"],
                from_cache=True,
                age_seconds=age,
                source_url=cached["source_url"],
            )

        cache_mod.write_cache(self.source, key, data=data, source_url=source_url)
        return FetchResult(data=data, from_cache=False, age_seconds=0, source_url=source_url)
