#!/usr/bin/env -S uv run --quiet
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "psycopg[binary]>=3.1",
#   "httpx>=0.27",
# ]
# ///
"""Pull daily ECB-sourced FX rates from Frankfurter into commodity_prices.

Source: https://api.frankfurter.dev/v1  (free, no API key, ECB-sourced)
Live-then-cache-fallback via infra/fetchers/frankfurter.py.
Cache snapshots under infra/data/cache/frankfurter/.

Why this exists alongside seed_fx_rates.py (Bank of Canada):
  - BoC publishes only CAD-quoted pairs (FXCADUSD, FXCADEUR, ...).
  - Frankfurter wraps the European Central Bank's reference table which
    covers 30+ currencies. Useful when a supplier quotes in JPY/CHF/MXN
    and the procurement agent needs a defensible cross-rate.

Rates land in `commodity_prices` with `fx-{base}-{quote}` commodity_ids,
e.g. `fx-usd-eur`, `fx-usd-jpy`. `close_price` = USD's value in the quote
currency (i.e. "how many quote units per 1 USD" — Frankfurter convention).

Idempotent: ON CONFLICT (commodity_id, price_date) DO UPDATE.

Usage:
  uv run infra/seed_fx_world.py                  # last 90 days
  uv run infra/seed_fx_world.py --days 365       # last year
  uv run infra/seed_fx_world.py --dry-run        # print, no DB write
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetchers.frankfurter import FrankfurterFetcher  # noqa: E402

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://bakery:bakery@localhost:5432/bakery",
)

# Quote currencies we want vs. USD. Each becomes `fx-usd-{quote}` in
# commodity_prices. Add or remove freely — Frankfurter supports any
# ECB-listed currency code.
QUOTE_SYMBOLS: tuple[str, ...] = (
    "EUR", "GBP", "JPY", "CHF", "CAD", "MXN", "CNY", "AUD",
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Seed worldwide FX rates from Frankfurter (ECB-sourced).")
    p.add_argument(
        "--days",
        type=int,
        default=90,
        help="Trailing window size in days (default 90).",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print rows but do not write to the database.",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    cutoff = date.today() - timedelta(days=args.days)

    fetcher = FrankfurterFetcher(base="USD", days=args.days, symbols=QUOTE_SYMBOLS)
    cache_key = f"USD_{args.days}d"
    print(f"[fx_world] fetching {len(QUOTE_SYMBOLS)} USD pairs from Frankfurter (range {cache_key})…")
    try:
        result = fetcher.get(cache_key)
    except Exception as exc:
        print(f"[fx_world] FAILED ({type(exc).__name__}: {exc})", file=sys.stderr)
        sys.exit(1)
    if result.from_cache:
        print(f"  cache used (age {result.age_seconds}s)")

    rates_by_date = result.data["rates"]
    rows_to_insert: list[tuple] = []
    per_pair: dict[str, int] = {q: 0 for q in QUOTE_SYMBOLS}

    for date_str, quotes in rates_by_date.items():
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue
        if d < cutoff:
            continue
        for quote_code in QUOTE_SYMBOLS:
            rate = quotes.get(quote_code)
            if rate is None:
                continue
            commodity_id = f"fx-usd-{quote_code.lower()}"
            unit = f"{quote_code.lower()}_per_usd"
            rows_to_insert.append(
                (
                    commodity_id, d,
                    None, None, None,     # no OHL for FX
                    rate, None,           # close, volume
                    unit, "frankfurter", result.source_url,
                )
            )
            per_pair[quote_code] += 1

    if args.dry_run:
        print(f"[dry-run] would upsert {len(rows_to_insert)} rows:")
        for row in rows_to_insert[:5]:
            print(" ", row)
        if len(rows_to_insert) > 5:
            print(f"  … and {len(rows_to_insert) - 5} more rows")
        for q, n in per_pair.items():
            print(f"  fx-usd-{q.lower():<4} {n:>4} rows")
        return

    with psycopg.connect(DATABASE_URL) as conn, conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO commodity_prices (
                commodity_id, price_date,
                open_price, high_price, low_price, close_price, volume,
                unit, source, source_url
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (commodity_id, price_date) DO UPDATE SET
                open_price  = EXCLUDED.open_price,
                high_price  = EXCLUDED.high_price,
                low_price   = EXCLUDED.low_price,
                close_price = EXCLUDED.close_price,
                volume      = EXCLUDED.volume,
                source      = EXCLUDED.source,
                source_url  = EXCLUDED.source_url,
                fetched_at  = now()
            """,
            rows_to_insert,
        )
        conn.commit()

    print(f"[fx_world] upserted {len(rows_to_insert)} rows total ({len(QUOTE_SYMBOLS)} pairs):")
    for q, n in per_pair.items():
        print(f"  fx-usd-{q.lower():<4} {n:>4} rows")


if __name__ == "__main__":
    main()
