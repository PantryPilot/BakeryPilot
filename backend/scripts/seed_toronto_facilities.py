#!/usr/bin/env -S uv run --quiet
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "psycopg[binary]>=3.1",
#   "httpx>=0.27",
#   "beautifulsoup4>=4.12",
#   "pyyaml>=6.0",
# ]
# ///
"""Live-fetch facility addresses + lat/lng and seed the four FGF plants.

This script is the canonical source of truth for the `facilities` table
after the live-fetcher refactor. `infra/supabase/seed.sql` no longer
contains a `facilities` INSERT block; instead, this script:

  1. Reads operational defaults (timezone, capacities, name) from
     [infra/data/demo_placeholders/facilities.yaml](infra/data/demo_placeholders/facilities.yaml).
     Those fields have no public source and are tagged
     `source: engineering_judgment_demo_only` per row.

  2. For `plant-toronto` (kind=literal_fgf): scrapes the address block
     from https://www.fgfbrands.com/contact/ via
     [infra/fetchers/fgf_contact.py](infra/fetchers/fgf_contact.py),
     then geocodes that address via OpenStreetMap Nominatim.

  3. For the three `plant-mississauga` / `plant-hamilton` /
     `plant-montreal` rows (kind=demo_placeholder): geocodes each
     placeholder address (a public city landmark) via Nominatim. FGF
     does not publicly disclose plants in those cities; the placeholder
     anchors the multi-region demo narrative on real coordinates.

  4. INSERT ... ON CONFLICT (facility_id) DO UPDATE SET ... so re-runs
     idempotently refresh whatever live data has changed (e.g. if FGF
     moves their HQ).

Live-with-cache-fallback semantics live in
[infra/fetchers/base.py](infra/fetchers/base.py): every HTTP call is
attempted live first, falls back to a cached snapshot on network
failure with a printed warning, and fails loudly only if both live and
cache are missing.

Usage:
  uv run infra/seed_toronto_facilities.py             # live fetch + write
  uv run infra/seed_toronto_facilities.py --dry-run   # fetch + print, no write
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import psycopg
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fetchers.fgf_contact import fgf_contact_address  # noqa: E402
from fetchers.nominatim import geocode  # noqa: E402

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://bakery:bakery@localhost:5432/bakery",
)

CONFIG_PATH = Path(__file__).resolve().parent / "data" / "demo_placeholders" / "facilities.yaml"

# Idempotent: re-running is a no-op if the columns already exist. Mirrors the
# additive ALTER block in infra/supabase/schema.sql so fresh-volume bootstraps
# converge with existing volumes.
ALTER_SQL = """
ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS street_address text,
  ADD COLUMN IF NOT EXISTS postal_code    text,
  ADD COLUMN IF NOT EXISTS latitude       numeric,
  ADD COLUMN IF NOT EXISTS longitude      numeric;
"""

UPSERT_SQL = """
INSERT INTO facilities (
    facility_id, name, city, province, timezone,
    cold_capacity_kg, dry_capacity_kg,
    street_address, postal_code, latitude, longitude
)
VALUES (
    %(facility_id)s, %(name)s, %(city)s, %(province)s, %(timezone)s,
    %(cold_capacity_kg)s, %(dry_capacity_kg)s,
    %(street_address)s, %(postal_code)s, %(latitude)s, %(longitude)s
)
ON CONFLICT (facility_id) DO UPDATE SET
    name             = EXCLUDED.name,
    city             = EXCLUDED.city,
    province         = EXCLUDED.province,
    timezone         = EXCLUDED.timezone,
    cold_capacity_kg = EXCLUDED.cold_capacity_kg,
    dry_capacity_kg  = EXCLUDED.dry_capacity_kg,
    street_address   = EXCLUDED.street_address,
    postal_code      = EXCLUDED.postal_code,
    latitude         = EXCLUDED.latitude,
    longitude        = EXCLUDED.longitude
"""

# Two-letter province codes for the schema's `province` column. FGF's
# contact page returns full names ("Ontario"); we normalize.
PROVINCE_CODES = {
    "ontario": "ON",
    "on": "ON",
    "quebec": "QC",
    "québec": "QC",
    "qc": "QC",
    "british columbia": "BC",
    "bc": "BC",
    "alberta": "AB",
    "ab": "AB",
}


def _province_code(name: str) -> str:
    return PROVINCE_CODES.get(name.strip().lower(), name.strip()[:2].upper())


def _load_config() -> list[dict[str, Any]]:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"Missing facility seed config: {CONFIG_PATH}. "
            f"This file declares the operational defaults that have no "
            f"public source (timezone, capacities, plant name)."
        )
    with CONFIG_PATH.open(encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    return doc["facilities"]


def resolve_facilities() -> list[dict[str, Any]]:
    """Combine YAML operational defaults with live address + coordinates."""
    config = _load_config()
    rows: list[dict[str, Any]] = []

    for entry in config:
        if entry.get("source") != "engineering_judgment_demo_only":
            raise ValueError(
                f"Facility {entry.get('facility_id')!r} in {CONFIG_PATH} is "
                f"missing the audit tag `source: engineering_judgment_demo_only`."
            )

        kind = entry["kind"]
        if kind == "literal_fgf":
            fgf = fgf_contact_address()
            street = fgf["street"]
            city = fgf["city"] or "Toronto"
            postal = fgf["postal_code"]
            province_code = _province_code(fgf["province"] or "Ontario")
        elif kind == "demo_placeholder":
            street = entry["placeholder_address"]
            city = entry["placeholder_city"]
            postal = entry["placeholder_postal"]
            province_code = entry["placeholder_province"]
        else:
            raise ValueError(f"Unknown kind={kind!r} for {entry['facility_id']!r}")

        # Geocode the resolved address. Live-then-cache fallback inside.
        query = f"{street}, {city}, {province_code}, Canada"
        geo = geocode(query)

        rows.append(
            {
                "facility_id": entry["facility_id"],
                "name": entry["name"],
                "city": city,
                "province": province_code,
                "timezone": entry["timezone"],
                "cold_capacity_kg": entry["cold_capacity_kg"],
                "dry_capacity_kg": entry["dry_capacity_kg"],
                "street_address": street,
                "postal_code": postal,
                "latitude": geo["lat"],
                "longitude": geo["lng"],
                "kind": kind,
            }
        )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Live-fetch, print the resolved rows, and exit without writing.",
    )
    args = parser.parse_args()

    print(
        f"[seed_toronto_facilities] Resolving 4 facilities via live fetchers "
        f"(fgf_contact + nominatim)..."
    )
    facilities = resolve_facilities()

    if args.dry_run:
        _print_plan(facilities)
        return 0

    # Strip the YAML-only `kind` field before handing rows to psycopg.
    rows_for_db = [{k: v for k, v in f.items() if k != "kind"} for f in facilities]

    with psycopg.connect(DATABASE_URL, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(ALTER_SQL)
            cur.executemany(UPSERT_SQL, rows_for_db)
        conn.commit()

    print(f"[seed_toronto_facilities] Upserted {len(facilities)} facility rows.")
    _summarize_by_kind(facilities)
    return 0


def _print_plan(facilities: list[dict[str, Any]]) -> None:
    print(f"[seed_toronto_facilities] Dry run -- {len(facilities)} facilities resolved:")
    for f in facilities:
        coords = f"({f['latitude']:>8.4f}, {f['longitude']:>9.4f})"
        print(
            f"  {f['facility_id']:20s}  {f['kind']:18s}  {coords}  "
            f"{f['street_address']}, {f['city']} {f['postal_code']}"
        )
    _summarize_by_kind(facilities)


def _summarize_by_kind(facilities: list[dict[str, Any]]) -> None:
    counts = Counter(f["kind"] for f in facilities)
    line = "  ".join(f"{kind}={n}" for kind, n in sorted(counts.items()))
    print(f"[seed_toronto_facilities] By kind: {line}")


if __name__ == "__main__":
    raise SystemExit(main())
