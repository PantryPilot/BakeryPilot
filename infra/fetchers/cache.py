"""JSON snapshot cache for fetcher results.

Layout: `infra/data/cache/{source}/{key}.json`
Snapshot shape:
    {
      "fetched_at": "2026-05-26T19:30:00Z",
      "source_url": "https://nominatim.openstreetmap.org/search?...",
      "data":       <whatever the fetcher returned>
    }

The cache stores PARSED payloads, not raw HTML/JSON responses, so a
teammate can pop open a `.json` file and read the data directly. This
matches the project's "data appears in source control" preference --
snapshots are committable and review-friendly.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# CACHE_ROOT is determined at import time. infra/fetchers/cache.py -> infra/data/cache.
CACHE_ROOT = Path(__file__).resolve().parent.parent / "data" / "cache"


def _safe_key(key: str) -> str:
    """Convert a free-form cache key to a filesystem-safe filename."""
    safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in key)
    return safe[:200] or "_"


def cache_path(source: str, key: str) -> Path:
    return CACHE_ROOT / source / f"{_safe_key(key)}.json"


def read_cache(source: str, key: str) -> dict[str, Any] | None:
    """Return the full cache snapshot dict, or None if the file doesn't exist."""
    p = cache_path(source, key)
    if not p.exists():
        return None
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_cache(source: str, key: str, *, data: Any, source_url: str) -> Path:
    """Write a snapshot. Overwrites any existing file."""
    p = cache_path(source, key)
    p.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_url": source_url,
        "data": data,
    }
    with p.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, sort_keys=True, ensure_ascii=False)
        f.write("\n")
    return p


def cache_age_seconds(source: str, key: str) -> int | None:
    """Return cache age in seconds, or None if the cache is missing."""
    snap = read_cache(source, key)
    if snap is None:
        return None
    fetched = datetime.strptime(snap["fetched_at"], "%Y-%m-%dT%H:%M:%SZ").replace(
        tzinfo=timezone.utc
    )
    return int((datetime.now(timezone.utc) - fetched).total_seconds())
