#!/usr/bin/env -S uv run --quiet
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "psycopg[binary]>=3.1",
#   "httpx>=0.27",
# ]
# ///
"""Classify Open-Meteo daily forecasts into disruption_signals rows.

For each facility (using its latitude/longitude populated by
seed_toronto_facilities.py), fetch 21 days of daily weather (7 past + 14
forecast) from Open-Meteo and emit one disruption_signals row per
(facility, date, extreme-condition).

Thresholds (severity is clamped to 0..1):

  - heat        : tmax > 35°C            severity = min(1, (tmax-35)/10)
  - frost       : tmin < 0°C             severity = min(1, (-tmin)/15)
  - heavy_rain  : precip_mm > 25         severity = min(1, (precip-25)/50)
  - wind        : wind_gust_kmh > 60     severity = min(1, (gust-60)/40)

Refresh semantics
-----------------
disruption_signals has no natural unique key; this script uses a
DELETE-then-INSERT pattern scoped to its own source within a transaction:

    DELETE FROM disruption_signals
     WHERE source = 'open_meteo'
       AND observed_at > now() - interval '21 days';

so re-running stays idempotent without polluting history. If the script
crashes mid-run the transaction rolls back; the previous batch survives.

Usage:
  uv run infra/seed_weather_signals.py             # all facilities
  uv run infra/seed_weather_signals.py --dry-run   # print, no DB write
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetchers.open_meteo import OpenMeteoFetcher  # noqa: E402

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://bakery:bakery@localhost:5432/bakery",
)

# Threshold + severity-formula per condition. Returns severity (0..1) or
# None when the condition does not trigger.
def _heat(tmax: float | None) -> float | None:
    if tmax is None or tmax <= 35:
        return None
    return min(1.0, (tmax - 35) / 10)


def _frost(tmin: float | None) -> float | None:
    if tmin is None or tmin >= 0:
        return None
    return min(1.0, (-tmin) / 15)


def _heavy_rain(precip: float | None) -> float | None:
    if precip is None or precip <= 25:
        return None
    return min(1.0, (precip - 25) / 50)


def _wind(gust: float | None) -> float | None:
    if gust is None or gust <= 60:
        return None
    return min(1.0, (gust - 60) / 40)


_CONDITIONS = [
    ("heat",       "tmax",          _heat,       lambda r: f"tmax={r['tmax']}°C"),
    ("frost",      "tmin",          _frost,      lambda r: f"tmin={r['tmin']}°C"),
    ("heavy_rain", "precip_mm",     _heavy_rain, lambda r: f"precip={r['precip_mm']}mm"),
    ("wind",       "wind_gust_kmh", _wind,       lambda r: f"gust={r['wind_gust_kmh']}km/h"),
]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Seed weather risk into disruption_signals.")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print rows but do not write to the database.",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()

    with psycopg.connect(DATABASE_URL) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT facility_id, city, latitude, longitude
              FROM facilities
             WHERE latitude IS NOT NULL AND longitude IS NOT NULL
             ORDER BY facility_id
            """
        )
        facilities = cur.fetchall()

    if not facilities:
        print("[weather_signals] no facilities with lat/lng — run `make seed.toronto.facilities` first.",
              file=sys.stderr)
        sys.exit(1)

    fetcher = OpenMeteoFetcher()
    rows_to_insert: list[tuple] = []
    summary: dict[str, int] = {}

    for facility_id, city, lat, lng in facilities:
        if lat is None or lng is None:
            continue
        key = f"{float(lat):.4f},{float(lng):.4f}"
        print(f"[weather_signals] fetching {facility_id} ({city}, {key})…")
        try:
            result = fetcher.get(key)
        except Exception as exc:
            print(f"  SKIPPED ({type(exc).__name__}: {exc})", file=sys.stderr)
            summary[facility_id] = 0
            continue

        if result.from_cache:
            print(f"  cache used (age {result.age_seconds}s)")

        kept = 0
        for r in result.data["daily"]:
            try:
                d = datetime.strptime(r["date"], "%Y-%m-%d").date()
            except (ValueError, TypeError):
                continue
            for kind, field, classifier, fmt in _CONDITIONS:
                sev = classifier(r.get(field))
                if sev is None:
                    continue
                metrics = fmt(r)
                message = f"{kind} at {city} on {d.isoformat()}: {metrics}"
                # Anchor at facility's local noon — close enough for daily signal.
                observed_at = datetime.combine(d, datetime.min.time()).replace(hour=12)
                rows_to_insert.append(
                    (
                        None,            # supplier_id
                        None,            # ingredient_id
                        kind,            # kind
                        round(sev, 3),   # severity
                        "open_meteo",    # source
                        message,         # message
                        observed_at,     # observed_at (naive; cast at insert with AT TIME ZONE)
                    )
                )
                kept += 1
        summary[facility_id] = kept

    if args.dry_run:
        print(f"[dry-run] would write {len(rows_to_insert)} disruption_signals rows:")
        for row in rows_to_insert[:5]:
            print(" ", row)
        if len(rows_to_insert) > 5:
            print(f"  … and {len(rows_to_insert) - 5} more rows")
        for fid, n in summary.items():
            print(f"  {fid:<20} {n:>3} signals")
        return

    # Refresh: delete previous open_meteo signals from the recent window,
    # then bulk insert in the same transaction.
    with psycopg.connect(DATABASE_URL) as conn, conn.cursor() as cur:
        cur.execute(
            """
            DELETE FROM disruption_signals
             WHERE source = 'open_meteo'
               AND observed_at > now() - interval '21 days'
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

    print(f"[weather_signals] refreshed: deleted {deleted}, inserted {len(rows_to_insert)} rows")
    for fid, n in summary.items():
        print(f"  {fid:<20} {n:>3} signals")


if __name__ == "__main__":
    main()
