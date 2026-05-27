#!/usr/bin/env -S uv run --quiet
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "psycopg[binary]>=3.1",
#   "httpx>=0.27",
# ]
# ///
"""Pull daily commodity prices from Yahoo Finance into commodity_prices.

Source: https://query1.finance.yahoo.com/v8/finance/chart/{symbol}
  - Free, no API key, undocumented but stable for ~10 years.
  - Live-then-cache-fallback via infra/fetchers/yahoo_finance.py.
  - Cache snapshots under infra/data/cache/yahoo_finance/.

Idempotent: ON CONFLICT (commodity_id, price_date) DO UPDATE refreshes
the OHLCV and the fetched_at timestamp. Re-run any time to pick up the
latest close after a trading session.

Current commodities (extend COMMODITIES below to add more — each entry
maps a stable internal commodity_id to a Yahoo symbol + the unit Yahoo
reports the price in):

  - wheat-cbot-zw  : CBOT wheat futures continuous front-month
                     (Yahoo symbol ZW=F, currency USX = US cents / bushel)
                     Used by the ProcurementAgent for price-drift detection
                     and as a negotiation trigger when a supplier contract
                     price drifts above the commodity benchmark.

Usage:
  uv run infra/seed_commodity_prices.py                    # last 90 days
  uv run infra/seed_commodity_prices.py --days 365         # last year
  uv run infra/seed_commodity_prices.py --dry-run          # print, no DB write
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import psycopg

# Allow `from fetchers.yahoo_finance import ...` when run as a standalone script
# (no package install — uv run resolves inline deps and adds infra/ to sys.path).
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetchers.yahoo_finance import YahooFinanceFetcher  # noqa: E402

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://bakery:bakery@localhost:5432/bakery",
)

# Yahoo currency code -> internal unit label.
# USX is Yahoo's code for US cents (1/100 USD), used for grain futures.
_CURRENCY_UNIT = {
    "USX": "usd_cents_per_unit",
    "USD": "usd_per_unit",
}

# Internal commodity_id -> (yahoo_symbol, unit_override_or_None, description)
# unit_override lets us record a more specific label than the currency-based
# default (e.g. 'usd_cents_per_bushel' instead of 'usd_cents_per_unit').
COMMODITIES: dict[str, tuple[str, str | None, str]] = {
    "wheat-cbot-zw": ("ZW=F", "usd_cents_per_bushel", "CBOT wheat futures, front-month"),
    # Add more by appending here, e.g.:
    # "sugar-ice-sb": ("SB=F", "usd_cents_per_pound", "ICE sugar #11 futures"),
    # "corn-cbot-zc": ("ZC=F", "usd_cents_per_bushel", "CBOT corn futures, front-month"),
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Seed daily commodity prices from Yahoo Finance.")
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

    # Pull a slightly larger window from Yahoo so the cache snapshot has
    # back-history available for future runs / back-tests even when this
    # invocation only wants the last 90 days.
    yahoo_range = "1y" if args.days <= 365 else "2y"
    fetcher = YahooFinanceFetcher(range_window=yahoo_range)

    rows_to_insert: list[tuple] = []
    summary: dict[str, dict] = {}

    for commodity_id, (symbol, unit_override, desc) in COMMODITIES.items():
        print(f"[commodity_prices] fetching {commodity_id} ({symbol})…")
        result = fetcher.get(symbol)
        if result.from_cache:
            print(f"  cache used (age {result.age_seconds}s)")

        payload = result.data
        currency = payload.get("currency")
        unit = unit_override or _CURRENCY_UNIT.get(currency, currency or "unknown")

        kept = 0
        for r in payload["rows"]:
            try:
                d = datetime.strptime(r["date"], "%Y-%m-%d").date()
            except (ValueError, TypeError):
                continue
            if d < cutoff:
                continue
            rows_to_insert.append(
                (
                    commodity_id, d,
                    r.get("open"), r.get("high"), r.get("low"),
                    r["close"], r.get("volume"),
                    unit, "yahoo_finance", result.source_url,
                )
            )
            kept += 1
        summary[commodity_id] = {"rows": kept, "symbol": symbol, "unit": unit, "desc": desc}

    if args.dry_run:
        print(f"[dry-run] would upsert {len(rows_to_insert)} rows:")
        for row in rows_to_insert[:5]:
            print(" ", row)
        if len(rows_to_insert) > 5:
            print(f"  … and {len(rows_to_insert) - 5} more rows")
        for cid, s in summary.items():
            print(f"  {cid:<18} {s['symbol']:<6} {s['unit']:<28} {s['rows']:>4} rows  ({s['desc']})")
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

    print(f"[commodity_prices] upserted {len(rows_to_insert)} rows total:")
    for cid, s in summary.items():
        print(f"  {cid:<18} {s['symbol']:<6} {s['unit']:<28} {s['rows']:>4} rows  ({s['desc']})")


if __name__ == "__main__":
    main()
