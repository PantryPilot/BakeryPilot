"""BakeryPilot fetcher framework.

Each Fetcher subclass wraps one public source (REST API or HTML page).
The base class implements a live-first, cache-fallback contract so a
broken network or a redesigned upstream page degrades gracefully into
the last-known snapshot rather than blocking seed runs.

See docs in [infra/fetchers/base.py](infra/fetchers/base.py).
"""

from __future__ import annotations

from .base import Fetcher, FetcherError, FetchResult

__all__ = ["Fetcher", "FetcherError", "FetchResult"]
