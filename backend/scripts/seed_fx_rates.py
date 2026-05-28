#!/usr/bin/env -S uv run --quiet
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "psycopg[binary]>=3.1",
#   "httpx>=0.27",
# ]
# ///
"""Pull daily FX reference rates from Bank of Canada Valet into commodity_prices.

Source: https://www.bankofcanada.ca/valet/observations/{series}/json
  - Free, no API key, official central bank reference rates.
  - Live-then-cache-fallback via infra/fetchers/bank_of_canada.py.
  - Cache snapshots under infra/data/cache/bank_of_canada/.

Rates land in the same `commodity_prices` table the wheat/sugar/etc. seeders
write to, using FX-shaped commodity_ids like `fx-cad-usd`. `close_price`
holds the daily reference rate; `open/high/low/volume` are NULL (BoC only
publishes the single daily mid-rate, not OHLC).

Idempotent: ON CONFLICT (commodity_id, price_date) DO UPDATE refreshes
the rate and the fetched_at timestamp.

Current series (extend FX_SERIES below to add more — each entry maps a
stable internal commodity_id to a BoC series code + a unit label):

  - fx-cad-usd  : CAD per 1 USD  (BoC daily reference, series FXCADUSD)
                  Used by ProcurementAgent to convert USD-quoted supplier
                  invoices into CAD landed cost.
  - fx-cad-eur  : CAD per 1 EUR  (BoC daily reference, series FXCADEUR)

Usage:
  uv run infra/seed_fx_rates.py                # last 90 days
  uv run infra/seed_fx_rates.py --days 365     # last year
  uv run infra/seed_fx_rates.py --dry-run      # print, no DB write
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import psycopg

# Allow `from fetchers.bank_of_canada import ...` when run as a standalone script
# (no package install — uv run resolves inline deps and adds infra/ to sys.path).
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetchers.bank_of_canada import BankOfCanadaFetcher  # noqa: E402

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://bakery:bakery@localhost:5432/bakery",
)

# Internal commodity_id -> (boc_series_code, unit_label, description)
FX_SERIES: dict[str, tuple[str, str, str]] = {
    "fx-cad-usd": ("FXCADUSD", "cad_per_usd", "CAD per 1 USD (BoC daily reference)"),
    "fx-cad-eur": ("FXCADEUR", "cad_per_eur", "CAD per 1 EUR (BoC daily reference)"),
    # Add more by appending here, e.g.:
    # "fx-cad-gbp": ("FXCADGBP", "cad_per_gbp", "CAD per 1 GBP (BoC daily reference)"),
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Seed daily FX rates from Bank of Canada Valet.")
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

    # BoC's `recent=N` parameter caps observations from the server side; if
    # the caller asks for more than 90 days we expand the BoC window too.
    boc_recent = max(90, args.days + 10)
    fetcher = BankOfCanadaFetcher(recent=boc_recent)

    rows_to_insert: list[tuple] = []
    summary: dict[str, dict] = {}

    for commodity_id, (series, unit, desc) in FX_SERIES.items():
        print(f"[fx_rates] fetching {commodity_id} ({series})…")
        result = fetcher.get(series)
        if result.from_cache:
            print(f"  cache used (age {result.age_seconds}s)")

        kept = 0
        for r in result.data["rows"]:
            try:
                d = datetime.strptime(r["date"], "%Y-%m-%d").date()
            except (ValueError, TypeError):
                continue
            if d < cutoff:
                continue
            rows_to_insert.append(
                (
                    commodity_id, d,
                    None, None, None,     # open/high/low — BoC publishes single mid-rate
                    r["rate"], None,      # close, volume
                    unit, "bank_of_canada", result.source_url,
                )
            )
            kept += 1
        summary[commodity_id] = {"rows": kept, "series": series, "unit": unit, "desc": desc}

    if args.dry_run:
        print(f"[dry-run] would upsert {len(rows_to_insert)} rows:")
        for row in rows_to_insert[:5]:
            print(" ", row)
        if len(rows_to_insert) > 5:
            print(f"  … and {len(rows_to_insert) - 5} more rows")
        for cid, s in summary.items():
            print(f"  {cid:<14} {s['series']:<10} {s['unit']:<14} {s['rows']:>4} rows  ({s['desc']})")
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

    print(f"[fx_rates] upserted {len(rows_to_insert)} rows total:")
    for cid, s in summary.items():
        print(f"  {cid:<14} {s['series']:<10} {s['unit']:<14} {s['rows']:>4} rows  ({s['desc']})")


if __name__ == "__main__":
    main()
