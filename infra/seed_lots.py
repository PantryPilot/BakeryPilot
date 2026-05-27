#!/usr/bin/env -S uv run --quiet
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "faker>=25.0",
#   "psycopg[binary]>=3.1",
# ]
# ///
"""Generate ingredient lots with realistic expiry dates and curated demo scenarios (F1.7).

Two layers, applied in order:

  1. Curated scenario layer (deterministic, pinned by lot_code).
     About 20 lots that hard-code the demo stories called out in
     docs/demo-seed-data-audit.md — critical near-expiry butter at Toronto,
     low-stock blueberries at Toronto with a healthy alternative at
     Mississauga, an expired cream-cheese lot at Hamilton, a supplier-linked
     cocoa lot at Mississauga, and per-facility staples (salt, yeast,
     flour) that never run out. These are the lots the agent and the
     alert SSE should latch onto.

  2. Faker bulk-fill (Faker seed=42 for reproducibility).
     ~140 lots with comfortable 30-180 day expiry windows across the
     remaining ingredients. No <3-day Faker lots: the red-badge inventory
     is owned entirely by the curated layer so the alert deck stays
     small and intelligible.

Usage:
  uv run infra/seed_lots.py             # replace existing lots
  uv run infra/seed_lots.py --once      # no-op if lots already present
  uv run infra/seed_lots.py --count 165 # override total lot count
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

# (facility, ingredient) pairs the Faker bulk-fill must never populate.
# These keep deliberately-engineered scenarios — e.g. "Toronto has zero
# yogurt so the paused Mini Naan order is a real blocker" — intact even
# though the curated layer doesn't actively insert anything at that pair.
EXCLUDED_PAIRS: set[tuple[str, str]] = {
    ("plant-toronto", "ing-yogurt-plain"),     # forces PO-3 paused state
    ("plant-montreal", "ing-yogurt-plain"),    # forces PO-8 to fail validation
    ("plant-montreal", "ing-milk-whole"),      # forces PO-8 to fail validation
}


CURATED_STORAGE_ZONES: dict[str, str] = {
    "ing-butter-unsalted": "refrigerated",
    "ing-cream-cheese":    "refrigerated",
    "ing-blueberry-frozen": "frozen",
    "ing-cocoa-powder":    "dry",
    "ing-flour-bread":     "dry",
    "ing-flour-ap":        "dry",
    "ing-salt-kosher":     "dry",
    "ing-yeast-instant":   "refrigerated",
    "ing-sugar-granulated": "dry",
    "ing-eggs-whole":      "refrigerated",
}


CURATED_LOTS: list[dict] = [
    # I-2 critical near-expiry butter at Toronto (drives 2 alerts)
    dict(lot_code="L-DEMO-BUT-001", facility="plant-toronto",     ingredient="ing-butter-unsalted",   qty=40,   days_to_expiry=1,   supplier="sup-valleydairy", unit_cost=4.10),
    dict(lot_code="L-DEMO-BUT-002", facility="plant-toronto",     ingredient="ing-butter-unsalted",   qty=25,   days_to_expiry=2,   supplier="sup-valleydairy", unit_cost=4.10),
    # I-6 transfer-opportunity surplus at Hamilton
    dict(lot_code="L-DEMO-BUT-003", facility="plant-hamilton",    ingredient="ing-butter-unsalted",   qty=420,  days_to_expiry=35,  supplier="sup-valleydairy", unit_cost=4.05),
    # I-3 expired cream cheese at Hamilton (drives a single past-expiry alert)
    dict(lot_code="L-DEMO-CRC-001", facility="plant-hamilton",    ingredient="ing-cream-cheese",      qty=12,   days_to_expiry=-2,  supplier="sup-valleydairy", unit_cost=5.60),
    # I-4 critically low blueberries at Toronto + I-1 healthy alternative at Mississauga
    dict(lot_code="L-DEMO-BLU-001", facility="plant-toronto",     ingredient="ing-blueberry-frozen",  qty=8,    days_to_expiry=4,   supplier="sup-coastalberry", unit_cost=3.20),
    dict(lot_code="L-DEMO-BLU-002", facility="plant-mississauga", ingredient="ing-blueberry-frozen",  qty=320,  days_to_expiry=90,  supplier="sup-coastalberry", unit_cost=3.15),
    # I-5 supplier-linked cocoa (CoastalBerry == disrupted)
    dict(lot_code="L-DEMO-COC-001", facility="plant-mississauga", ingredient="ing-cocoa-powder",      qty=110,  days_to_expiry=60,  supplier="sup-coastalberry", unit_cost=6.40),
    # I-1 headline healthy stock for flagship flour
    dict(lot_code="L-DEMO-FLR-001", facility="plant-toronto",     ingredient="ing-flour-bread",       qty=2200, days_to_expiry=120, supplier="sup-northgrain", unit_cost=0.72),
    # I-7 substitution-source flour at Mississauga
    dict(lot_code="L-DEMO-FLR-002", facility="plant-mississauga", ingredient="ing-flour-ap",          qty=1850, days_to_expiry=120, supplier="sup-northgrain", unit_cost=0.70),
    # I-1 cake flour buffer for Toronto cookies and naan dippers
    dict(lot_code="L-DEMO-FLR-003", facility="plant-hamilton",    ingredient="ing-flour-ap",          qty=1200, days_to_expiry=110, supplier="sup-northgrain", unit_cost=0.71),
    dict(lot_code="L-DEMO-FLR-004", facility="plant-montreal",    ingredient="ing-flour-ap",          qty=900,  days_to_expiry=105, supplier="sup-northgrain", unit_cost=0.71),
    # I-8 staples — one salt + one yeast lot per facility so every recipe can run
    dict(lot_code="L-DEMO-SLT-001", facility="plant-toronto",     ingredient="ing-salt-kosher",       qty=600,  days_to_expiry=365, supplier="sup-northgrain", unit_cost=0.45),
    dict(lot_code="L-DEMO-SLT-002", facility="plant-mississauga", ingredient="ing-salt-kosher",       qty=600,  days_to_expiry=365, supplier="sup-northgrain", unit_cost=0.45),
    dict(lot_code="L-DEMO-SLT-003", facility="plant-hamilton",    ingredient="ing-salt-kosher",       qty=600,  days_to_expiry=365, supplier="sup-northgrain", unit_cost=0.45),
    dict(lot_code="L-DEMO-SLT-004", facility="plant-montreal",    ingredient="ing-salt-kosher",       qty=600,  days_to_expiry=365, supplier="sup-northgrain", unit_cost=0.45),
    dict(lot_code="L-DEMO-YST-001", facility="plant-toronto",     ingredient="ing-yeast-instant",     qty=250,  days_to_expiry=60,  supplier="sup-newleaf", unit_cost=8.10),
    dict(lot_code="L-DEMO-YST-002", facility="plant-mississauga", ingredient="ing-yeast-instant",     qty=250,  days_to_expiry=60,  supplier="sup-newleaf", unit_cost=8.10),
    dict(lot_code="L-DEMO-YST-003", facility="plant-hamilton",    ingredient="ing-yeast-instant",     qty=250,  days_to_expiry=60,  supplier="sup-newleaf", unit_cost=8.10),
    dict(lot_code="L-DEMO-YST-004", facility="plant-montreal",    ingredient="ing-yeast-instant",     qty=250,  days_to_expiry=60,  supplier="sup-newleaf", unit_cost=8.10),
    # Recipe-critical bulks so common SKUs validate successfully at every plant
    dict(lot_code="L-DEMO-SGR-001", facility="plant-toronto",     ingredient="ing-sugar-granulated",  qty=1500, days_to_expiry=180, supplier="sup-prairiebulk", unit_cost=0.55),
    dict(lot_code="L-DEMO-SGR-002", facility="plant-mississauga", ingredient="ing-sugar-granulated",  qty=1500, days_to_expiry=180, supplier="sup-prairiebulk", unit_cost=0.55),
    dict(lot_code="L-DEMO-EGG-001", facility="plant-toronto",     ingredient="ing-eggs-whole",        qty=300,  days_to_expiry=14,  supplier="sup-valleydairy", unit_cost=2.40),
    dict(lot_code="L-DEMO-EGG-002", facility="plant-mississauga", ingredient="ing-eggs-whole",        qty=280,  days_to_expiry=14,  supplier="sup-valleydairy", unit_cost=2.40),
    # Toronto AP flour + oil + milk so PO-1 (producing Wonder loaf) can actually
    # be "Mark Produced" successfully end-to-end.
    dict(lot_code="L-DEMO-FAP-T01", facility="plant-toronto",     ingredient="ing-flour-ap",          qty=800,  days_to_expiry=120, supplier="sup-northgrain",  unit_cost=0.72),
    dict(lot_code="L-DEMO-OIL-T01", facility="plant-toronto",     ingredient="ing-oil-vegetable",     qty=120,  days_to_expiry=180, supplier="sup-northgrain",  unit_cost=1.65),
    dict(lot_code="L-DEMO-MLK-T01", facility="plant-toronto",     ingredient="ing-milk-whole",        qty=80,   days_to_expiry=10,  supplier="sup-valleydairy", unit_cost=1.20),
    # NOTE: deliberately NO ing-yogurt-plain at Toronto so the paused PO-3
    # (Stonefire Mini Naan, 600 units) maps to a real "waiting on Valley Dairy
    # yogurt" blocker that the agent and Materials page can both surface.
    dict(lot_code="L-DEMO-YOG-M01", facility="plant-mississauga", ingredient="ing-yogurt-plain",      qty=140,  days_to_expiry=14,  supplier="sup-valleydairy", unit_cost=2.15),
    dict(lot_code="L-DEMO-MLK-M01", facility="plant-mississauga", ingredient="ing-milk-whole",        qty=110,  days_to_expiry=10,  supplier="sup-valleydairy", unit_cost=1.20),
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true",
                        help="Skip if ingredient_lots already has rows.")
    parser.add_argument("--count", type=int, default=165,
                        help="Total lots to generate, including curated demo lots (default 165).")
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
                print(f"[seed_lots] Clearing {existing} existing lots (TRUNCATE CASCADE).")
                # inventory_events FKs to ingredient_lots and is append-only
                # (BEFORE DELETE trigger blocks row deletes). TRUNCATE bypasses
                # BEFORE-row triggers, so we use it with CASCADE to honor the FK.
                cur.execute("TRUNCATE ingredient_lots, inventory_events RESTART IDENTITY CASCADE")

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
    ingredient_lookup = {row[0]: (row[1], row[2]) for row in ingredients}
    facility_set = set(facility_ids)
    supplier_set = set(supplier_ids)

    # Layer 1: curated scenario lots (pinned by lot_code).
    for entry in CURATED_LOTS:
        ing_id = entry["ingredient"]
        if ing_id not in ingredient_lookup:
            continue
        if entry["facility"] not in facility_set:
            continue
        zone, shelf = ingredient_lookup[ing_id]
        zone = CURATED_STORAGE_ZONES.get(ing_id, zone)
        supplier_id = entry.get("supplier") if entry.get("supplier") in supplier_set else None

        days = entry["days_to_expiry"]
        expiry = today + timedelta(days=days)
        # Received-date: most recent realistic window so the lot looks plausible.
        recv_offset = max(1, min(shelf - max(days, 0), 30))
        received = today - timedelta(days=recv_offset)
        if received > today:
            received = today

        rows.append({
            "facility_id": entry["facility"],
            "ingredient_id": ing_id,
            "supplier_id": supplier_id,
            "quantity_kg": round(float(entry["qty"]), 2),
            "received_date": received,
            "expiry_date": expiry,
            "storage_zone": zone,
            "unit_cost": round(float(entry.get("unit_cost", 2.50)), 2),
            "lot_code": entry["lot_code"],
        })

    # Layer 2: Faker bulk-fill. Excludes any (facility, ingredient) pair that
    # already has a curated lot, plus the EXCLUDED_PAIRS set that keeps
    # deliberately-empty scenario buckets empty.
    curated_pairs = {(r["facility_id"], r["ingredient_id"]) for r in rows}
    blocked_pairs = curated_pairs | EXCLUDED_PAIRS
    remaining = max(count - len(rows), 0)
    attempts = 0
    while len(rows) - len(CURATED_LOTS) < remaining and attempts < remaining * 4:
        attempts += 1
        ing_id, zone, shelf = fake.random_element(ingredients)
        facility_id = fake.random_element(facility_ids)
        if (facility_id, ing_id) in blocked_pairs:
            continue
        # Comfortable 30-180 day window so the alert deck stays small.
        days_until_expiry = fake.random_int(30, min(max(shelf, 30), 180))
        rows.append(_make_lot(
            fake, today, ing_id, zone, shelf,
            facility_ids, supplier_ids, days_until_expiry,
            facility_id=facility_id,
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
    *,
    facility_id: str | None = None,
) -> dict:
    expiry = today + timedelta(days=days_until_expiry)
    received = expiry - timedelta(days=min(shelf_life_default, fake.random_int(7, 60)))
    if received > today:
        received = today

    quantity_kg = round(fake.random_int(60, 800) + fake.random.random(), 2)
    unit_cost = round(fake.random.uniform(0.80, 12.50), 2)

    return {
        "facility_id": facility_id or fake.random_element(facility_ids),
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
    curated_codes = {entry["lot_code"] for entry in CURATED_LOTS}
    curated = sum(1 for r in rows if r["lot_code"] in curated_codes)
    red = sum(1 for r in rows if 0 <= (r["expiry_date"] - today).days < 3)
    past = sum(1 for r in rows if r["expiry_date"] < today)
    amber = sum(1 for r in rows if 3 <= (r["expiry_date"] - today).days <= 7)
    green = sum(1 for r in rows if (r["expiry_date"] - today).days > 7)
    print(f"[seed_lots] Inserted {len(rows)} lots ({curated} curated, {len(rows) - curated} Faker): "
          f"{red} red (<3d), {past} past expiry, {amber} amber (3-7d), {green} green (>7d).")


if __name__ == "__main__":
    raise SystemExit(main())
