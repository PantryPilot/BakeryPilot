#!/usr/bin/env -S uv run --quiet
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "psycopg[binary]>=3.1",
#   "httpx>=0.27",
# ]
# ///
"""Pull negative-tone supply-chain news from GDELT into disruption_signals.

For each keyword in KEYWORD_BUNDLE below, we query GDELT 2.0 DOC API with
the tone filter pushed into the query (`tone<-2`) and English source
filter (`sourcelang:english`), then emit one disruption_signals row per
returned article.

Because GDELT's artlist mode does NOT return per-article tone, severity
is fixed per row at 0.4 (moderate concern; can be tuned later). The
KEYWORD_BUNDLE optionally maps a keyword to the most relevant ingredient
ID so the agent can scope the signal cleanly.

Refresh semantics
-----------------
disruption_signals has no natural unique key; this script uses a
DELETE-then-INSERT pattern scoped to its own source within a transaction:

    DELETE FROM disruption_signals
     WHERE source = 'gdelt'
       AND observed_at > now() - interval '8 days';

so re-running stays idempotent without polluting history.

Usage:
  uv run infra/seed_news_signals.py             # all keywords
  uv run infra/seed_news_signals.py --dry-run   # print, no DB write
"""

from __future__ import annotations

import argparse
import html
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetchers.gdelt import GdeltFetcher  # noqa: E402

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://bakery:bakery@localhost:5432/bakery",
)

# Keyword -> optional ingredient_id mapping. Keys are exact GDELT queries
# (we'll append `sourcelang:english tone<-2` to each at query time).
KEYWORD_BUNDLE: dict[str, str | None] = {
    "wheat shortage":   "ing-flour-bread",
    "sugar prices":     None,
    "port congestion":  None,
    "freight strike":   None,
    "bakery recall":    None,
    "food safety":      None,
    "blueberry harvest": None,
}

# Fixed severity — GDELT artlist mode doesn't surface per-article tone,
# and the query-level `tone<-2` already filters to elevated-concern items.
DEFAULT_SEVERITY = 0.4

MAX_ROWS_PER_KEYWORD = 8  # cap to keep the demo signal list digestible
MESSAGE_MAX_LEN = 500


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Seed news risk into disruption_signals from GDELT.")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print rows but do not write to the database.",
    )
    return p.parse_args()


def _parse_seendate(seendate: str | None) -> datetime | None:
    """GDELT seendate is `YYYYMMDDTHHMMSSZ` — parse to aware UTC datetime."""
    if not seendate or len(seendate) < 15:
        return None
    try:
        return datetime.strptime(seendate, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def main() -> None:
    args = parse_args()

    fetcher = GdeltFetcher(timespan="7d", maxrecords=50, sort="hybridrel")
    rows_to_insert: list[tuple] = []
    summary: dict[str, dict] = {}

    for keyword, ingredient_id in KEYWORD_BUNDLE.items():
        # Push tone + language filters into the GDELT query so the server
        # only returns negative-tone English articles.
        query = f"{keyword} sourcelang:english tone<-2"
        print(f"[news_signals] querying GDELT for {keyword!r}…")
        try:
            result = fetcher.get(query)
        except Exception as exc:
            print(f"  SKIPPED ({type(exc).__name__}: {exc})", file=sys.stderr)
            summary[keyword] = {"kept": 0, "ingredient_id": ingredient_id}
            continue

        if result.from_cache:
            print(f"  cache used (age {result.age_seconds}s)")

        articles = result.data.get("articles", [])
        # Dedupe by domain — keep the top-ranked article per domain to
        # avoid 5 stories from the same outlet.
        seen_domains: set[str] = set()
        kept = 0
        for art in articles:
            domain = art.get("domain") or "unknown"
            if domain in seen_domains:
                continue
            seen_domains.add(domain)

            title = html.unescape((art.get("title") or "").strip())
            if not title:
                continue
            message = f"{title} ({domain})"
            if len(message) > MESSAGE_MAX_LEN:
                message = message[: MESSAGE_MAX_LEN - 1] + "…"

            observed_at = _parse_seendate(art.get("seendate"))
            if observed_at is None:
                continue

            rows_to_insert.append(
                (
                    None,                  # supplier_id
                    ingredient_id,         # ingredient_id (may be NULL)
                    "news",                # kind
                    DEFAULT_SEVERITY,      # severity
                    "gdelt",               # source
                    message,               # message
                    observed_at,           # observed_at (UTC aware)
                )
            )
            kept += 1
            if kept >= MAX_ROWS_PER_KEYWORD:
                break

        summary[keyword] = {"kept": kept, "ingredient_id": ingredient_id}

    if args.dry_run:
        print(f"[dry-run] would write {len(rows_to_insert)} disruption_signals rows:")
        for row in rows_to_insert[:5]:
            print(" ", row)
        if len(rows_to_insert) > 5:
            print(f"  … and {len(rows_to_insert) - 5} more rows")
        for kw, s in summary.items():
            tag = s["ingredient_id"] or "—"
            print(f"  {kw:<20} -> {tag:<22} {s['kept']:>3} signals")
        return

    with psycopg.connect(DATABASE_URL) as conn, conn.cursor() as cur:
        cur.execute(
            """
            DELETE FROM disruption_signals
             WHERE source = 'gdelt'
               AND observed_at > now() - interval '8 days'
            """
        )
        deleted = cur.rowcount
        if rows_to_insert:
            cur.executemany(
                """
                INSERT INTO disruption_signals (
                    supplier_id, ingredient_id, kind, severity, source, message, observed_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                rows_to_insert,
            )
        conn.commit()

    print(f"[news_signals] refreshed: deleted {deleted}, inserted {len(rows_to_insert)} rows")
    for kw, s in summary.items():
        tag = s["ingredient_id"] or "—"
        print(f"  {kw:<20} -> {tag:<22} {s['kept']:>3} signals")


if __name__ == "__main__":
    main()
