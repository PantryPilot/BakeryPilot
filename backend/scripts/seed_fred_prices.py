#!/usr/bin/env -S uv run --quiet
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "psycopg[binary]>=3.1",
#   "httpx>=0.27",
# ]
# ///
"""Pull official US Federal Reserve commodity + macro series into commodity_prices.

Source: https://api.stlouisfed.org/fred  (free, requires FRED_API_KEY)
Get a key (instant signup): https://fred.stlouisfed.org/docs/api/api_key.html

Why this exists alongside seed_commodity_prices.py (Yahoo Finance):
  - Yahoo's v8 chart endpoint is undocumented; reliable but unsupported.
  - FRED is the official US Federal Reserve / BLS series and is the
    benchmark cited in trade publications and economic research. Use as
    a defensible second source (and a fallback if Yahoo breaks).

Each FRED series lands in `commodity_prices` with a stable `commodity_id`
of the form `<commodity-or-indicator>-fred-<series_id>`. close_price = the
FRED observation value; unit = the FRED-reported units (e.g. "Dollars per
Barrel"); source = "fred"; source_url = the live API URL.

Idempotent: ON CONFLICT (commodity_id, price_date) DO UPDATE.

If FRED_API_KEY is unset the script exits 2 with a clear instruction —
the admin panel surfaces this in the data-source card's "Last message"
strip so the operator knows what to do.

Usage:
  uv run infra/seed_fred_prices.py                 # last 365 days
  uv run infra/seed_fred_prices.py --days 90       # shorter window
  uv run infra/seed_fred_prices.py --dry-run       # print, no DB write
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetchers.fred import FredApiKeyMissing, FredFetcher  # noqa: E402

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://bakery:bakery@localhost:5432/bakery",
)

# Internal commodity_id -> (FRED series_id, unit_override_or_None, description)
# unit_override lets us record a more specific label than FRED's free-text units.
FRED_SERIES: dict[str, tuple[str, str | None, str]] = {
    "crude-fred-wti":          ("DCOILWTICO",      "usd_per_barrel",
                                 "WTI crude oil spot (St. Louis Fed / Cushing OK)"),
    "natgas-fred-hh":          ("DHHNGSP",          "usd_per_mmbtu",
                                 "Natural gas Henry Hub spot (St. Louis Fed)"),
    "gasoline-fred-regw":      ("GASREGW",          "usd_per_gallon",
                                 "Retail gasoline regular grade, US average (St. Louis Fed)"),
    "wheat-fred-imf":          ("PWHEAMTUSDM",      "usd_per_metric_ton",
                                 "Global wheat price (IMF, via FRED)"),
    "sugar-fred-imf":          ("PSUGAISAUSDM",     "usd_per_pound",
                                 "Global sugar price (IMF, via FRED)"),
    "food-cpi-fred":           ("CPIUFDSL",         "index_1982_84_100",
                                 "US CPI food (St. Louis Fed)"),
    "fx-cad-usd-fred":         ("DEXCAUS",          "cad_per_usd",
                                 "CAD per 1 USD (St. Louis Fed)"),
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Seed FRED commodity + macro series.")
    p.add_argument(
        "--days",
        type=int,
        default=365,
        help="Trailing window size in days (default 365). FRED keeps long history; "
             "we default to a year so monthly series have a few points.",
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

    fetcher = FredFetcher(recent_days=args.days)
    # Early API-key check so we fail with a useful message before iterating.
    try:
        fetcher._require_key()  # noqa: SLF001 — internal probe is fine here
    except FredApiKeyMissing as exc:
        print(f"[fred_prices] {exc}", file=sys.stderr)
        sys.exit(2)

    rows_to_insert: list[tuple] = []
    summary: dict[str, dict] = {}

    for commodity_id, (series_id, unit_override, desc) in FRED_SERIES.items():
        cache_key = f"{series_id}_{args.days}d"
        print(f"[fred_prices] fetching {commodity_id} ({series_id})…")
        try:
            result = fetcher.get(cache_key)
        except Exception as exc:
            print(f"  SKIPPED ({type(exc).__name__}: {exc})", file=sys.stderr)
            summary[commodity_id] = {"rows": 0, "series": series_id, "unit": "n/a", "desc": f"SKIPPED — {desc}"}
            continue

        if result.from_cache:
            print(f"  cache used (age {result.age_seconds}s)")

        payload = result.data
        fred_units = payload.get("units") or ""
        unit = unit_override or _normalize_unit(fred_units)

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
                    None, None, None,
                    r["value"], None,
                    unit, "fred", result.source_url,
                )
            )
            kept += 1
        summary[commodity_id] = {"rows": kept, "series": series_id, "unit": unit, "desc": desc}

    if args.dry_run:
        print(f"[dry-run] would upsert {len(rows_to_insert)} rows:")
        for row in rows_to_insert[:5]:
            print(" ", row)
        if len(rows_to_insert) > 5:
            print(f"  … and {len(rows_to_insert) - 5} more rows")
        for cid, s in summary.items():
            print(f"  {cid:<22} {s['series']:<14} {s['unit']:<22} {s['rows']:>4} rows")
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

    print(f"[fred_prices] upserted {len(rows_to_insert)} rows total:")
    for cid, s in summary.items():
        print(f"  {cid:<22} {s['series']:<14} {s['unit']:<22} {s['rows']:>4} rows  ({s['desc']})")


def _normalize_unit(fred_units: str) -> str:
    """Map FRED's free-text units to slugged labels we store in commodity_prices.unit.

    FRED examples: 'Dollars per Barrel', 'Dollars per Million BTU',
                   'Index 1982-1984=100', 'Canadian Dollars to One U.S. Dollar'.
    Fallback: lowercase the string, replace spaces with underscores.
    """
    if not fred_units:
        return "unknown"
    s = fred_units.lower().strip()
    # Common substitutions.
    s = s.replace("dollars per barrel", "usd_per_barrel")
    s = s.replace("dollars per million btu", "usd_per_mmbtu")
    s = s.replace("dollars per gallon", "usd_per_gallon")
    s = s.replace("dollars per metric ton", "usd_per_metric_ton")
    s = s.replace("dollars per pound", "usd_per_pound")
    s = s.replace(" ", "_").replace(",", "").replace("=", "_")
    return s


if __name__ == "__main__":
    main()
