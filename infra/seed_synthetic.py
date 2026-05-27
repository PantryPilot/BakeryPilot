#!/usr/bin/env -S uv run --quiet
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "psycopg[binary]>=3.1",
#   "pyyaml>=6.0",
# ]
# ///
"""Load the four labelled-synthetic seed tables from `infra/data/synthetic/*.yaml`.

These four tables (production_lines, warehouse_costs, allergen_changeovers,
production_formulas) have NO public source -- they're proprietary
operations / engineering data that no website or API publishes. Moving
them out of `infra/supabase/seed.sql` and into per-table YAML lets every
row carry an explicit `source: engineering_judgment_demo_only` tag so
observers can audit-trail demo-only data.

Each YAML file has a top-of-file comment block explaining why the data
is synthetic and how the values were calibrated. The schema is the same
as the previous SQL INSERTs; this script just hydrates them.

FK ordering: production_lines and warehouse_costs reference facilities
(seed via `make seed.toronto.facilities` first), and production_formulas
references skus + ingredients (seeded via `make schema.seed`).

Usage:
  uv run infra/seed_synthetic.py             # idempotent insert (ON CONFLICT DO NOTHING)
  uv run infra/seed_synthetic.py --dry-run   # print, do not write
  uv run infra/seed_synthetic.py --force     # DELETE existing rows then re-insert
                                             # (use after editing a YAML)

Matches the `--force` clean-and-reseed convention from infra/seed_demo.py.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

import psycopg
import yaml

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://bakery:bakery@localhost:5432/bakery",
)

SYNTHETIC_DIR = Path(__file__).resolve().parent / "data" / "synthetic"

# YAML file -> (top-level key, INSERT SQL).
TABLES: dict[str, tuple[str, str]] = {
    "production_lines.yaml": (
        "production_lines",
        """
        INSERT INTO production_lines
            (line_id, facility_id, name, capacity_kg_per_hour, supported_allergen_tags)
        VALUES
            (%(line_id)s, %(facility_id)s, %(name)s,
             %(capacity_kg_per_hour)s, %(supported_allergen_tags)s)
        ON CONFLICT (line_id) DO NOTHING
        """,
    ),
    "warehouse_costs.yaml": (
        "warehouse_costs",
        """
        INSERT INTO warehouse_costs
            (facility_id, storage_type, cost_per_kg_per_day, capacity_kg)
        VALUES
            (%(facility_id)s, %(storage_type)s,
             %(cost_per_kg_per_day)s, %(capacity_kg)s)
        ON CONFLICT (facility_id, storage_type) DO NOTHING
        """,
    ),
    "allergen_changeovers.yaml": (
        "allergen_changeovers",
        """
        INSERT INTO allergen_changeovers
            (from_allergen, to_allergen, changeover_minutes)
        VALUES
            (%(from_allergen)s, %(to_allergen)s, %(changeover_minutes)s)
        ON CONFLICT (from_allergen, to_allergen) DO NOTHING
        """,
    ),
    "production_formulas.yaml": (
        "production_formulas",
        """
        INSERT INTO production_formulas
            (sku_id, ingredient_id, kg_per_unit)
        VALUES
            (%(sku_id)s, %(ingredient_id)s, %(kg_per_unit)s)
        ON CONFLICT (sku_id, ingredient_id) DO NOTHING
        """,
    ),
}

# Meta-only YAML fields stripped before passing rows to psycopg.
META_FIELDS = {"source", "notes"}


def _load_rows(filename: str, key: str) -> list[dict[str, Any]]:
    path = SYNTHETIC_DIR / filename
    if not path.exists():
        raise FileNotFoundError(
            f"Missing synthetic YAML: {path}. "
            f"Each table has its own file under infra/data/synthetic/."
        )
    with path.open(encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    if key not in doc:
        raise ValueError(
            f"YAML file {path} has no top-level key {key!r}; got {sorted(doc)!r}."
        )
    rows = doc[key]
    if not isinstance(rows, list):
        raise ValueError(f"Top-level {key!r} in {path} must be a list.")

    cleaned: list[dict[str, Any]] = []
    for r in rows:
        if r.get("source") != "engineering_judgment_demo_only":
            raise ValueError(
                f"Row in {filename} is missing the audit tag "
                f"`source: engineering_judgment_demo_only`. "
                f"Every synthetic row must carry it. Row: {r!r}"
            )
        cleaned.append({k: v for k, v in r.items() if k not in META_FIELDS})
    return cleaned


def _clear(cur: psycopg.Cursor) -> None:
    """DELETE rows from the four synthetic tables in FK-safe order.

    production_formulas first because nothing references it; then the three
    parents which are referenced by production_schedules / production_runs /
    ingredient_lots etc. Those dependent rows must be cleared by seed_demo
    or other transactional seeders first -- this script will fail loudly
    if dependents still exist (psycopg raises ForeignKeyViolation).
    """
    for table in ("production_formulas", "production_lines", "warehouse_costs", "allergen_changeovers"):
        cur.execute(f"DELETE FROM {table}")
    print("[seed_synthetic] Cleared existing synthetic rows.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print row counts and exit without touching the database.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="DELETE existing rows from the four synthetic tables before re-inserting. "
             "Matches infra/seed_demo.py --force semantics.",
    )
    args = parser.parse_args()

    plan = {}
    for filename, (key, _sql) in TABLES.items():
        plan[key] = _load_rows(filename, key)

    if args.dry_run:
        print("[seed_synthetic] Dry run -- would insert (or skip via ON CONFLICT):")
        for key, rows in plan.items():
            print(f"  {key:22s}  {len(rows):>4d} rows")
        return 0

    inserted: dict[str, int] = {}
    with psycopg.connect(DATABASE_URL, autocommit=False) as conn:
        with conn.cursor() as cur:
            if args.force:
                _clear(cur)
            for filename, (key, sql) in TABLES.items():
                rows = plan[key]
                cur.executemany(sql, rows)
                inserted[key] = cur.rowcount
        conn.commit()

    print("[seed_synthetic] Inserted (or skipped via ON CONFLICT):")
    for key, n in inserted.items():
        print(f"  {key:22s}  {n:>4d} rows affected", file=sys.stdout)
    print(
        "[seed_synthetic] All rows tagged source=engineering_judgment_demo_only "
        "in their YAML.",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
