#!/usr/bin/env -S uv run --quiet
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "faker>=25.0",
#   "psycopg[binary]>=3.1",
# ]
# ///
"""Generate 150+ ingredient lots with realistic expiry dates (F1.7).

Deterministic via Faker(seed=42) so every teammate produces the same data.
Distribution targets:
  - >= 5 lots with expiry within 3 days (forces red badges in /materials demo)
  - 3 lots already past expiry (audit edge case)
  - balance spread across 7-180 day expiry windows

Usage:
  uv run infra/seed_lots.py             # replace existing lots
  uv run infra/seed_lots.py --once      # no-op if lots already present
  uv run infra/seed_lots.py --count 200 # override total lot count
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, timedelta

import psycopg
from faker import Faker

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://bakery:bakery@localhost:5432/bakery",
)

FAKER_SEED = int(os.environ.get("FAKER_SEED", "42"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true",
                        help="Skip if ingredient_lots already has rows.")
    parser.add_argument("--count", type=int, default=180,
                        help="Total lots to generate (default 180).")
    args = parser.parse_args()

    fake = Faker()
    Faker.seed(FAKER_SEED)

    with psycopg.connect(DATABASE_URL, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM ingredient_lots")
            existing = cur.fetchone()[0]

            if args.once and existing > 0:
                print(f"[seed_lots] --once: {existing} rows already present, skipping.")
                return 0

            cur.execute("""
                SELECT ingredient_id, default_storage_zone, shelf_life_days_default
                FROM ingredients
            """)
            ingredients = cur.fetchall()
            if not ingredients:
                print("[seed_lots] ERROR: no ingredients found. Run schema.seed first.",
                      file=sys.stderr)
                return 1

            cur.execute("SELECT facility_id FROM facilities")
            facility_ids = [r[0] for r in cur.fetchall()]

            cur.execute("SELECT supplier_id FROM suppliers")
            supplier_ids = [r[0] for r in cur.fetchall()]

            if existing > 0:
                print(f"[seed_lots] Clearing {existing} existing lots (CASCADE).")
                # inventory_events FKs to ingredient_lots; CASCADE keeps the FK honest.
                cur.execute("DELETE FROM inventory_events")
                cur.execute("DELETE FROM ingredient_lots")

            rows = _generate_lots(
                fake=fake,
                count=args.count,
                ingredients=ingredients,
                facility_ids=facility_ids,
                supplier_ids=supplier_ids,
            )

            cur.executemany(
                """
                INSERT INTO ingredient_lots
                  (facility_id, ingredient_id, supplier_id,
                   quantity_kg, received_date, expiry_date,
                   storage_zone, unit_cost, lot_code)
                VALUES
                  (%(facility_id)s, %(ingredient_id)s, %(supplier_id)s,
                   %(quantity_kg)s, %(received_date)s, %(expiry_date)s,
                   %(storage_zone)s, %(unit_cost)s, %(lot_code)s)
                """,
                rows,
            )

        conn.commit()

    _summarize(rows)
    return 0


def _generate_lots(
    *,
    fake: Faker,
    count: int,
    ingredients: list[tuple[str, str, int]],
    facility_ids: list[str],
    supplier_ids: list[str],
) -> list[dict]:
    today = date.today()
    rows: list[dict] = []

    # Bucket 1: 5 lots with expiry in <3 days (force red badges).
    for _ in range(5):
        ing_id, zone, shelf = fake.random_element(ingredients)
        days_until_expiry = fake.random_int(0, 2)
        rows.append(_make_lot(
            fake, today, ing_id, zone, shelf,
            facility_ids, supplier_ids, days_until_expiry,
        ))

    # Bucket 2: 3 lots already past expiry (audit edge case).
    for _ in range(3):
        ing_id, zone, shelf = fake.random_element(ingredients)
        days_until_expiry = -fake.random_int(1, 4)
        rows.append(_make_lot(
            fake, today, ing_id, zone, shelf,
            facility_ids, supplier_ids, days_until_expiry,
        ))

    # Bucket 3: remaining lots — realistic spread.
    remaining = count - len(rows)
    for _ in range(remaining):
        ing_id, zone, shelf = fake.random_element(ingredients)
        # Most lots have plenty of life; weight toward fresh.
        days_until_expiry = fake.random_int(7, min(shelf, 180))
        rows.append(_make_lot(
            fake, today, ing_id, zone, shelf,
            facility_ids, supplier_ids, days_until_expiry,
        ))

    return rows


def _make_lot(
    fake: Faker,
    today: date,
    ingredient_id: str,
    storage_zone: str,
    shelf_life_default: int,
    facility_ids: list[str],
    supplier_ids: list[str],
    days_until_expiry: int,
) -> dict:
    expiry = today + timedelta(days=days_until_expiry)
    received = expiry - timedelta(days=min(shelf_life_default, fake.random_int(7, 60)))
    if received > today:
        received = today

    quantity_kg = round(fake.random_int(20, 800) + fake.random.random(), 2)
    unit_cost = round(fake.random.uniform(0.80, 12.50), 2)

    return {
        "facility_id": fake.random_element(facility_ids),
        "ingredient_id": ingredient_id,
        "supplier_id": fake.random_element(supplier_ids) if fake.boolean(85) else None,
        "quantity_kg": quantity_kg,
        "received_date": received,
        "expiry_date": expiry,
        "storage_zone": storage_zone,
        "unit_cost": unit_cost,
        "lot_code": f"L{fake.random_int(100000, 999999)}",
    }


def _summarize(rows: list[dict]) -> None:
    today = date.today()
    red = sum(1 for r in rows if (r["expiry_date"] - today).days < 3
              and (r["expiry_date"] - today).days >= 0)
    past = sum(1 for r in rows if r["expiry_date"] < today)
    amber = sum(1 for r in rows if 3 <= (r["expiry_date"] - today).days <= 7)
    green = sum(1 for r in rows if (r["expiry_date"] - today).days > 7)
    print(f"[seed_lots] Inserted {len(rows)} lots: "
          f"{red} red (<3d), {past} past expiry, {amber} amber (3-7d), {green} green (>7d).")


if __name__ == "__main__":
    raise SystemExit(main())
