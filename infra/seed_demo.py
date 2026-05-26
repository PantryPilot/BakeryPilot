#!/usr/bin/env -S uv run --quiet
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "psycopg[binary]>=3.1",
# ]
# ///
"""Seed transactional demo data from mock_data.py into PostgreSQL.

Inserts production_schedules, production_runs, waste_events,
finished_goods_pallets, supplier_orders (+items), action_cards,
negotiation_drafts, and weekly_summaries.

Usage:
  uv run infra/seed_demo.py             # insert if tables are empty
  uv run infra/seed_demo.py --force     # clear and re-insert
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://bakery:bakery@localhost:5432/bakery",
)

FACILITY_MAP: dict[str, str] = {
    "plant_1": "plant-toronto",
    "plant_2": "plant-hamilton",
    "plant_3": "plant-mississauga",
    "plant_4": "plant-montreal",
}

SUPPLIER_MAP: dict[str, str] = {
    "sup_a": "sup-northgrain",
    "sup_b": "sup-valleydairy",
    "sup_c": "sup-prairiebulk",
    "sup_d": "sup-coastalberry",
    "sup_e": "sup-newleaf",
}

INGREDIENT_MAP: dict[str, str] = {
    "ing_flour":      "ing-flour-ap",
    "ing_butter":     "ing-butter-unsalted",
    "ing_blueberries":"ing-blueberry-frozen",
    "ing_sugar":      "ing-sugar-granulated",
    "ing_choc_chips": "ing-chocolate-chips-dark",
    "ing_sesame":     "ing-sesame-seeds",
}

SKU_MAP: dict[str, str] = {
    "sku_blueberry_muffin": "sku-blueberry-muffin-4pk",
    "sku_lemon_poppy":      "sku-lemon-poppy-muffin-4pk",
    "sku_chocolate_chip":   "sku-choc-chip-muffin-4pk",
    "sku_croissant":        "sku-croissant-butter-4pk",
    "sku_naan":             "sku-bagel-plain-6pk",
    "sku_sesame_bagel":     "sku-bagel-sesame-6pk",
}

LINE_MAP: dict[str, str] = {
    "line_1": "line-toronto-1",
    "line_2": "line-toronto-2",
    "line_3": "line-mississauga-1",
}

STAKEHOLDER_MAP: dict[str, str] = {
    "stk_1":  "sh-procurement-lead",
    "stk_2":  "sh-plant-mgr-toronto",
    "stk_3":  "sh-costco-buyer",
    "stk_4":  "sh-sup-northgrain",
    "stk_5":  "sh-esg-officer",
    "stk_6":  "sh-sup-valleydairy",
    "stk_7":  "sh-supply-chain-vp",
    "stk_8":  "sh-sup-prairiebulk",
    "stk_9":  "sh-operations-analyst",
    "stk_10": "sh-finance-controller",
}


def _load_mock_data():
    path = Path(__file__).parent.parent / "backend" / "app" / "mock_data.py"
    spec = importlib.util.spec_from_file_location("mock_data", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _fac(v: str) -> str:
    return FACILITY_MAP.get(v, v)

def _sup(v: str) -> str:
    return SUPPLIER_MAP.get(v, v)

def _ing(v: str) -> str:
    return INGREDIENT_MAP.get(v, v)

def _sku(v: str) -> str:
    return SKU_MAP.get(v, v)

def _line(v: str) -> str:
    return LINE_MAP.get(v, v)


def _clear(cur: psycopg.Cursor) -> None:
    tables = [
        "weekly_summaries",
        "negotiation_drafts",
        "notification_drafts",
        "waste_events",
        "finished_goods_pallets",
        "production_runs",
        "production_schedules",
        "supplier_order_items",
        "supplier_orders",
        "action_cards",
    ]
    for t in tables:
        cur.execute(f"DELETE FROM {t}")
    print("[seed_demo] Cleared existing demo data.")


def seed_action_cards(cur: psycopg.Cursor, m) -> dict[str, str]:
    """Insert action cards; return mock_id -> real card_id mapping."""
    id_map: dict[str, str] = {}

    cards = [
        {
            "mock_id": "card_order_001",
            "kind": "supplier_order",
            "payload": {
                "supplier_id": _sup("sup_a"),
                "supplier_name": "NorthGrain Mills Co.",
                "items": [{"ingredient_id": _ing("ing_flour"), "quantity_kg": 1200.0, "unit_price": 0.72}],
                "delivery_date": (date.today() + timedelta(days=3)).isoformat(),
                "landed_cost_breakdown": {"unit_cost": 864.0, "overage_cost": 0.0, "holding_cost": 19.2, "total": 883.2},
            },
            "state": "confirmed",
            "decided_at": datetime.utcnow() - timedelta(days=2),
            "decided_by": "sarah.kim@fgf.example",
        },
        {
            "mock_id": "card_order_002",
            "kind": "supplier_order",
            "payload": {
                "supplier_id": _sup("sup_b"),
                "supplier_name": "Valley Dairy Cooperative",
                "items": [{"ingredient_id": _ing("ing_butter"), "quantity_kg": 400.0, "unit_price": 4.10}],
                "delivery_date": (date.today() + timedelta(days=6)).isoformat(),
                "landed_cost_breakdown": {"unit_cost": 1640.0, "overage_cost": 41.0, "holding_cost": 24.0, "total": 1705.0},
            },
            "state": "pending",
            "decided_at": None,
            "decided_by": None,
        },
        {
            "mock_id": "card_schedule_001",
            "kind": "schedule_change",
            "payload": {
                "facility_id": _fac("plant_1"),
                "line_id": _line("line_1"),
                "changes": [
                    {
                        "kind": "reschedule",
                        "sku_id": _sku("sku_blueberry_muffin"),
                        "reason": "Use expiring blueberry lot before spoilage — lot expires in 2 days",
                        "waste_avoided_kg": 12.0,
                    }
                ],
            },
            "state": "confirmed",
            "decided_at": datetime.utcnow() - timedelta(days=1),
            "decided_by": "priya.nair@fgf.example",
        },
        {
            "mock_id": "card_notify_001",
            "kind": "notify",
            "payload": {
                "stakeholders": [_fac("plant_1"), "sh-operations-analyst"],
                "subject_template": "Yield alert on {{line_id}}",
                "body_template": "Variance of {{variance_pct}}% detected on run {{run_id}}.",
                "render_context": {"line_id": _line("line_2"), "variance_pct": "23.3", "run_id": "recent"},
            },
            "state": "pending",
            "decided_at": None,
            "decided_by": None,
        },
        {
            "mock_id": "card_work_order_001",
            "kind": "work_order",
            "payload": {
                "equipment_id": "mixer-toronto-1",
                "suggested_window": (datetime.utcnow() + timedelta(days=3)).isoformat(),
                "reason": "Dough divider calibration drift — over-portioning on 2 consecutive runs. Last calibrated 47 days ago (spec: 30 days).",
            },
            "state": "pending",
            "decided_at": None,
            "decided_by": None,
        },
        {
            "mock_id": "card_order_003",
            "kind": "supplier_order",
            "payload": {
                "supplier_id": _sup("sup_c"),
                "supplier_name": "Prairie Bulk Sugar Ltd.",
                "items": [{"ingredient_id": _ing("ing_flour"), "quantity_kg": 2500.0, "unit_price": 0.68}],
                "delivery_date": (date.today() + timedelta(days=7)).isoformat(),
                "landed_cost_breakdown": {"unit_cost": 1700.0, "overage_cost": 0.0, "holding_cost": 54.0, "total": 1754.0},
            },
            "state": "rejected",
            "decided_at": datetime.utcnow() - timedelta(hours=5),
            "decided_by": "sarah.kim@fgf.example",
        },
    ]

    for c in cards:
        cur.execute(
            """
            INSERT INTO action_cards (kind, payload, state, created_at, decided_at, decided_by)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING card_id
            """,
            (
                c["kind"],
                json.dumps(c["payload"]),
                c["state"],
                datetime.utcnow() - timedelta(hours=48),
                c.get("decided_at"),
                c.get("decided_by"),
            ),
        )
        real_id = cur.fetchone()[0]
        id_map[c["mock_id"]] = str(real_id)

    print(f"[seed_demo] Inserted {len(cards)} action_cards.")
    return id_map


def seed_supplier_orders(cur: psycopg.Cursor, m, card_map: dict[str, str]) -> dict[str, str]:
    id_map: dict[str, str] = {}
    orders = [
        {
            "mock_id": "ord_001",
            "supplier_id": _sup("sup_a"), "facility_id": _fac("plant_1"),
            "status": "confirmed",
            "confirmed_at": datetime.utcnow() - timedelta(days=2),
            "action_card_id": card_map.get("card_order_001"),
            "external_po_number": "PO-NG-2026-0412",
            "delivery_date": date.today() + timedelta(days=3),
            "items": [("ing-flour-ap", 1200.0, 0.72)],
        },
        {
            "mock_id": "ord_002",
            "supplier_id": _sup("sup_b"), "facility_id": _fac("plant_1"),
            "status": "sent",
            "confirmed_at": datetime.utcnow() - timedelta(days=1),
            "action_card_id": None,
            "external_po_number": "PO-VD-2026-0308",
            "delivery_date": date.today() + timedelta(days=5),
            "items": [("ing-sugar-granulated", 800.0, 0.55)],
        },
        {
            "mock_id": "ord_003",
            "supplier_id": _sup("sup_c"), "facility_id": _fac("plant_3"),
            "status": "draft",
            "confirmed_at": None,
            "action_card_id": card_map.get("card_order_003"),
            "external_po_number": None,
            "delivery_date": date.today() + timedelta(days=7),
            "items": [("ing-flour-bread", 2500.0, 0.68)],
        },
        {
            "mock_id": "ord_004",
            "supplier_id": _sup("sup_d"), "facility_id": _fac("plant_2"),
            "status": "confirmed",
            "confirmed_at": datetime.utcnow() - timedelta(hours=18),
            "action_card_id": None,
            "external_po_number": "PO-CB-2026-0509",
            "delivery_date": date.today() + timedelta(days=4),
            "items": [("ing-blueberry-frozen", 300.0, 3.20)],
        },
        {
            "mock_id": "ord_005",
            "supplier_id": _sup("sup_e"), "facility_id": _fac("plant_4"),
            "status": "confirmed",
            "confirmed_at": datetime.utcnow() - timedelta(days=3),
            "action_card_id": None,
            "external_po_number": "PO-NL-2026-0401",
            "delivery_date": date.today() + timedelta(days=6),
            "items": [("ing-butter-unsalted", 400.0, 4.10)],
        },
        {
            "mock_id": "ord_006",
            "supplier_id": _sup("sup_a"), "facility_id": _fac("plant_1"),
            "status": "pending_confirm",
            "confirmed_at": None,
            "action_card_id": card_map.get("card_order_002"),
            "external_po_number": None,
            "delivery_date": date.today() + timedelta(days=9),
            "items": [
                ("ing-sesame-seeds", 150.0, 2.85),
                ("ing-chocolate-chips-dark", 200.0, 3.50),
            ],
        },
    ]

    for o in orders:
        cur.execute(
            """
            INSERT INTO supplier_orders
              (supplier_id, facility_id, status, created_at, confirmed_at,
               action_card_id, external_po_number, delivery_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING order_id
            """,
            (
                o["supplier_id"], o["facility_id"], o["status"],
                datetime.utcnow() - timedelta(days=4),
                o["confirmed_at"],
                o["action_card_id"],
                o["external_po_number"],
                o["delivery_date"],
            ),
        )
        real_id = cur.fetchone()[0]
        id_map[o["mock_id"]] = str(real_id)

        for ing_id, qty, price in o["items"]:
            cur.execute(
                "INSERT INTO supplier_order_items (order_id, ingredient_id, quantity_kg, unit_price) VALUES (%s, %s, %s, %s)",
                (real_id, ing_id, qty, price),
            )

    print(f"[seed_demo] Inserted {len(orders)} supplier_orders with items.")
    return id_map


def seed_production_schedules(cur: psycopg.Cursor) -> dict[str, str]:
    id_map: dict[str, str] = {}
    now = datetime.utcnow()

    schedules = [
        # Historical completed (basis for production_runs)
        ("mock_sched_01", "plant-toronto",     "line-toronto-1",     "sku-blueberry-muffin-4pk",  now - timedelta(days=12, hours=-6),  now - timedelta(days=12, hours=-10), 1200, "complete", 34.5),
        ("mock_sched_02", "plant-toronto",     "line-toronto-3",     "sku-choc-chip-cookie-12pk", now - timedelta(days=11, hours=-7),  now - timedelta(days=11, hours=-12), 1800, "complete", 12.8),
        ("mock_sched_03", "plant-toronto",     "line-toronto-2",     "sku-croissant-butter-4pk",  now - timedelta(days=10, hours=-6),  now - timedelta(days=10, hours=-9),  900,  "complete", 0.0),
        ("mock_sched_04", "plant-mississauga", "line-mississauga-1", "sku-bagel-sesame-6pk",      now - timedelta(days=9,  hours=-6),  now - timedelta(days=9,  hours=-11), 1500, "complete", 0.0),
        ("mock_sched_05", "plant-hamilton",    "line-hamilton-1",    "sku-lemon-poppy-muffin-4pk",now - timedelta(days=8,  hours=-6),  now - timedelta(days=8,  hours=-10), 1050, "complete", 18.3),
        ("mock_sched_06", "plant-hamilton",    "line-hamilton-2",    "sku-oatmeal-cookie-12pk",   now - timedelta(days=7,  hours=-6),  now - timedelta(days=7,  hours=-11), 1600, "complete", 6.1),
        ("mock_sched_07", "plant-montreal",    "line-montreal-1",    "sku-cinnamon-roll-6pk",     now - timedelta(days=6,  hours=-7),  now - timedelta(days=6,  hours=-11), 800,  "complete", 31.4),
        ("mock_sched_08", "plant-toronto",     "line-toronto-1",     "sku-banana-bread-loaf",     now - timedelta(days=5,  hours=-6),  now - timedelta(days=5,  hours=-10), 1100, "complete", 0.0),
        ("mock_sched_09", "plant-toronto",     "line-toronto-3",     "sku-choc-chip-cookie-12pk", now - timedelta(days=4,  hours=-7),  now - timedelta(days=4,  hours=-12), 1900, "complete", 15.7),
        ("mock_sched_10", "plant-mississauga", "line-mississauga-2", "sku-sourdough-loaf",        now - timedelta(days=3,  hours=-7),  now - timedelta(days=3,  hours=-11), 1400, "complete", 22.0),
        ("mock_sched_11", "plant-hamilton",    "line-hamilton-1",    "sku-choc-chip-muffin-4pk",  now - timedelta(days=2,  hours=-6),  now - timedelta(days=2,  hours=-10), 1300, "complete", 27.9),
        ("mock_sched_12", "plant-toronto",     "line-toronto-2",     "sku-almond-danish-4pk",     now - timedelta(days=1,  hours=-6),  now - timedelta(days=1,  hours=-9),  700,  "complete", 41.0),
        # Active approved (current shift)
        ("mock_sched_13", "plant-toronto",     "line-toronto-1",     "sku-blueberry-muffin-4pk",  now + timedelta(hours=2),            now + timedelta(hours=6),            1400, "approved", 0.0),
        ("mock_sched_14", "plant-toronto",     "line-toronto-3",     "sku-choc-chip-cookie-12pk", now + timedelta(hours=1),            now + timedelta(hours=6),            2000, "approved", 0.0),
        ("mock_sched_15", "plant-mississauga", "line-mississauga-2", "sku-banana-bread-loaf",     now + timedelta(hours=3),            now + timedelta(hours=8),            1100, "approved", 0.0),
        ("mock_sched_16", "plant-hamilton",    "line-hamilton-2",    "sku-oatmeal-cookie-12pk",   now + timedelta(hours=1),            now + timedelta(hours=6),            1600, "approved", 0.0),
        ("mock_sched_17", "plant-montreal",    "line-montreal-1",    "sku-cinnamon-roll-6pk",     now + timedelta(hours=4),            now + timedelta(hours=8),            900,  "approved", 0.0),
        # Suggested (pending approval)
        ("mock_sched_18", "plant-toronto",     "line-toronto-2",     "sku-almond-danish-4pk",     now + timedelta(days=1),             now + timedelta(days=1, hours=4),    800,  "suggested", 12.0),
        ("mock_sched_19", "plant-mississauga", "line-mississauga-1", "sku-bagel-plain-6pk",       now + timedelta(days=1),             now + timedelta(days=1, hours=5),    2400, "suggested", 8.0),
        ("mock_sched_20", "plant-montreal",    "line-montreal-2",    "sku-almond-danish-4pk",     now + timedelta(days=2),             now + timedelta(days=2, hours=4),    700,  "suggested", 41.0),
    ]

    for mock_id, fac, line, sku, start, end, qty, status, waste in schedules:
        cur.execute(
            """
            INSERT INTO production_schedules
              (facility_id, line_id, sku_id, start_at, end_at, quantity_units, status, waste_avoided_kg)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING schedule_id
            """,
            (fac, line, sku, start, end, qty, status, waste),
        )
        real_id = cur.fetchone()[0]
        id_map[mock_id] = str(real_id)

    print(f"[seed_demo] Inserted {len(schedules)} production_schedules.")
    return id_map


def seed_production_runs(cur: psycopg.Cursor, sched_map: dict[str, str]) -> None:
    now = datetime.utcnow()

    runs = [
        # (mock_sched_key, line, facility, sku, operator, start_offset_days, duration_h, planned_kg, actual_kg, status, consumption_json)
        (
            "mock_sched_01", "line-toronto-1", "plant-toronto", "sku-blueberry-muffin-4pk", "op-martinez",
            -12, 4, 216.0, 218.2, "complete",
            {"ing-flour-ap": {"planned_kg": 216.0, "actual_kg": 218.2, "variance_pct": 1.02},
             "ing-sugar-granulated": {"planned_kg": 108.0, "actual_kg": 108.5, "variance_pct": 0.46},
             "ing-butter-unsalted": {"planned_kg": 72.0, "actual_kg": 73.1, "variance_pct": 1.53},
             "ing-eggs-whole": {"planned_kg": 54.0, "actual_kg": 54.3, "variance_pct": 0.56},
             "ing-blueberry-frozen": {"planned_kg": 84.0, "actual_kg": 85.2, "variance_pct": 1.43}},
        ),
        (
            "mock_sched_02", "line-toronto-3", "plant-toronto", "sku-choc-chip-cookie-12pk", "op-chen",
            -11, 5, 432.0, 504.5, "complete",
            {"ing-flour-ap": {"planned_kg": 432.0, "actual_kg": 451.0, "variance_pct": 4.40},
             "ing-sugar-brown-light": {"planned_kg": 216.0, "actual_kg": 219.0, "variance_pct": 1.39},
             "ing-butter-unsalted": {"planned_kg": 270.0, "actual_kg": 271.8, "variance_pct": 0.67},
             "ing-chocolate-chips-dark": {"planned_kg": 324.0, "actual_kg": 386.0, "variance_pct": 19.14}},
        ),
        (
            "mock_sched_03", "line-toronto-2", "plant-toronto", "sku-croissant-butter-4pk", "op-patel",
            -10, 3, 162.0, 164.1, "complete",
            {"ing-flour-bread": {"planned_kg": 216.0, "actual_kg": 218.2, "variance_pct": 1.02},
             "ing-butter-unsalted": {"planned_kg": 162.0, "actual_kg": 163.4, "variance_pct": 0.86},
             "ing-milk-whole": {"planned_kg": 72.0, "actual_kg": 72.8, "variance_pct": 1.11}},
        ),
        (
            "mock_sched_04", "line-mississauga-1", "plant-mississauga", "sku-bagel-sesame-6pk", "op-nguyen",
            -9, 5, 630.0, 700.8, "complete",
            {"ing-flour-bread": {"planned_kg": 630.0, "actual_kg": 634.0, "variance_pct": 0.63},
             "ing-sesame-seeds": {"planned_kg": 27.0, "actual_kg": 47.5, "variance_pct": 75.93},
             "ing-salt-kosher": {"planned_kg": 12.0, "actual_kg": 12.1, "variance_pct": 0.83}},
        ),
        (
            "mock_sched_05", "line-hamilton-1", "plant-hamilton", "sku-lemon-poppy-muffin-4pk", "op-desouza",
            -8, 4, 189.0, 190.4, "complete",
            {"ing-flour-ap": {"planned_kg": 189.0, "actual_kg": 190.4, "variance_pct": 0.74},
             "ing-butter-unsalted": {"planned_kg": 63.0, "actual_kg": 63.5, "variance_pct": 0.79},
             "ing-lemon-fresh": {"planned_kg": 31.5, "actual_kg": 31.8, "variance_pct": 0.95},
             "ing-poppy-seeds": {"planned_kg": 8.4, "actual_kg": 8.5, "variance_pct": 1.19}},
        ),
        (
            "mock_sched_06", "line-hamilton-2", "plant-hamilton", "sku-oatmeal-cookie-12pk", "op-johnson",
            -7, 5, 288.0, 304.5, "complete",
            {"ing-flour-ap": {"planned_kg": 288.0, "actual_kg": 295.0, "variance_pct": 2.43},
             "ing-oats-rolled": {"planned_kg": 240.0, "actual_kg": 257.0, "variance_pct": 7.08},
             "ing-raisins": {"planned_kg": 176.0, "actual_kg": 188.0, "variance_pct": 6.82}},
        ),
        (
            "mock_sched_07", "line-montreal-1", "plant-montreal", "sku-cinnamon-roll-6pk", "op-tremblay",
            -6, 4, 288.0, 346.8, "complete",
            {"ing-flour-bread": {"planned_kg": 288.0, "actual_kg": 295.0, "variance_pct": 2.43},
             "ing-butter-unsalted": {"planned_kg": 144.0, "actual_kg": 177.0, "variance_pct": 22.92},
             "ing-cinnamon-ground": {"planned_kg": 9.6, "actual_kg": 9.8, "variance_pct": 2.08}},
        ),
        (
            "mock_sched_08", "line-toronto-1", "plant-toronto", "sku-banana-bread-loaf", "op-martinez",
            -5, 4, 308.0, 310.2, "complete",
            {"ing-flour-ap": {"planned_kg": 308.0, "actual_kg": 310.2, "variance_pct": 0.71},
             "ing-butter-unsalted": {"planned_kg": 121.0, "actual_kg": 122.0, "variance_pct": 0.83},
             "ing-banana-fresh": {"planned_kg": 242.0, "actual_kg": 243.8, "variance_pct": 0.74}},
        ),
        (
            "mock_sched_09", "line-toronto-3", "plant-toronto", "sku-choc-chip-cookie-12pk", "op-chen",
            -4, 5, 456.0, 459.1, "complete",
            {"ing-flour-ap": {"planned_kg": 456.0, "actual_kg": 458.5, "variance_pct": 0.55},
             "ing-chocolate-chips-dark": {"planned_kg": 342.0, "actual_kg": 344.2, "variance_pct": 0.64},
             "ing-vanilla-extract": {"planned_kg": 11.4, "actual_kg": 11.5, "variance_pct": 0.88}},
        ),
        (
            "mock_sched_10", "line-mississauga-2", "plant-mississauga", "sku-sourdough-loaf", "op-kumar",
            -3, 4, 612.0, 672.8, "complete",
            {"ing-flour-bread": {"planned_kg": 612.0, "actual_kg": 641.0, "variance_pct": 4.74},
             "ing-yeast-active-dry": {"planned_kg": 5.44, "actual_kg": 7.0, "variance_pct": 28.68},
             "ing-salt-kosher": {"planned_kg": 13.6, "actual_kg": 14.0, "variance_pct": 2.94}},
        ),
        (
            "mock_sched_11", "line-hamilton-1", "plant-hamilton", "sku-choc-chip-muffin-4pk", "op-desouza",
            -2, 4, 234.0, 248.5, "complete",
            {"ing-flour-ap": {"planned_kg": 234.0, "actual_kg": 237.5, "variance_pct": 1.50},
             "ing-chocolate-chips-dark": {"planned_kg": 104.0, "actual_kg": 118.5, "variance_pct": 13.94},
             "ing-eggs-whole": {"planned_kg": 58.5, "actual_kg": 59.1, "variance_pct": 1.03}},
        ),
        (
            "mock_sched_12", "line-toronto-2", "plant-toronto", "sku-almond-danish-4pk", "op-patel",
            -1, 3, 154.0, 156.8, "complete",
            {"ing-flour-pastry": {"planned_kg": 154.0, "actual_kg": 156.8, "variance_pct": 1.82},
             "ing-butter-unsalted": {"planned_kg": 112.0, "actual_kg": 113.2, "variance_pct": 1.07},
             "ing-almonds-sliced": {"planned_kg": 28.0, "actual_kg": 28.4, "variance_pct": 1.43}},
        ),
    ]

    inserted = 0
    for row in runs:
        mock_key, line, fac, sku, op, day_offset, dur_h, planned, actual, status, consumption = row
        sched_id = sched_map.get(mock_key)
        start = now + timedelta(days=day_offset)
        end = start + timedelta(hours=dur_h)
        notes = None
        if consumption.get("ing-chocolate-chips-dark", {}).get("variance_pct", 0) > 15:
            notes = "Chocolate chip hopper over-dispense — calibration recommended"
        elif consumption.get("ing-butter-unsalted", {}).get("variance_pct", 0) > 15:
            notes = "Butter pump drift — pressure sensor flagged 3 events"
        elif consumption.get("ing-sesame-seeds", {}).get("variance_pct", 0) > 15:
            notes = "Sesame hopper sensor mis-dispense — last cleaned 12 days ago"
        elif consumption.get("ing-yeast-active-dry", {}).get("variance_pct", 0) > 15:
            notes = "Yeast dispenser scale drift — last calibrated 52 days ago (spec: 30)"

        cur.execute(
            """
            INSERT INTO production_runs
              (schedule_id, line_id, facility_id, sku_id, operator_id,
               started_at, ended_at, planned_kg, actual_kg, status,
               actual_ingredient_consumption, equipment_notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (sched_id, line, fac, sku, op, start, end, planned, actual, status,
             json.dumps(consumption), notes),
        )
        inserted += 1

    print(f"[seed_demo] Inserted {inserted} production_runs.")


def seed_waste_events(cur: psycopg.Cursor, m) -> None:
    now = datetime.utcnow()

    events = [
        # (event_at_offset_h, kind, kg, dollar_value, co2e_kg, avoided, facility_id, ingredient_id)
        # Avoided spoilage (rescheduling and transfers)
        (-1.3,  "spoilage", 12.0, 48.0,   20.4, True,  "plant-toronto",     "ing-blueberry-frozen"),
        (-1.9,  "spoilage",  0.8,  3.2,    1.4, True,  "plant-toronto",     "ing-blueberry-frozen"),
        (-2.8,  "spoilage", 15.0, 900.0,  25.5, True,  "plant-toronto",     "ing-butter-unsalted"),
        (-4.2,  "spoilage", 34.5, 138.0,  58.7, True,  "plant-toronto",     "ing-blueberry-frozen"),
        (-27,   "spoilage", 18.3,  73.2,  31.1, True,  "plant-hamilton",    "ing-lemon-fresh"),
        (-30,   "spoilage",  6.1,  24.4,  10.4, True,  "plant-hamilton",    "ing-butter-unsalted"),
        (-51,   "spoilage", 31.4, 125.6,  53.4, True,  "plant-montreal",    "ing-butter-frozen"),
        (-72,   "spoilage", 12.8,  51.2,  21.8, True,  "plant-toronto",     "ing-chocolate-chips-dark"),
        (-96,   "spoilage", 22.0, 110.0,  37.4, True,  "plant-mississauga", "ing-butter-unsalted"),
        (-120,  "spoilage", 15.7,  62.8,  26.7, True,  "plant-toronto",     "ing-chocolate-chips-dark"),
        (-144,  "spoilage",  5.2,  20.8,   8.8, True,  "plant-mississauga", "ing-blueberry-frozen"),
        (-168,  "spoilage", 27.9, 111.6,  47.4, True,  "plant-hamilton",    "ing-butter-unsalted"),
        (-192,  "spoilage", 41.0, 164.0,  69.7, True,  "plant-montreal",    "ing-butter-frozen"),
        (-216,  "spoilage",  8.7,  34.8,  14.8, True,  "plant-toronto",     "ing-banana-fresh"),
        (-240,  "spoilage", 18.2,  72.8,  31.0, True,  "plant-toronto",     "ing-butter-unsalted"),
        # Actual losses (not avoided)
        (-1.3,  "yield_loss",  2.4,  18.0,  4.1, False, "plant-toronto",     None),
        (-4.2,  "yield_loss",  6.8,  89.0, 11.6, False, "plant-toronto",     "ing-chocolate-chips-dark"),
        (-27,   "yield_loss",  4.1,  31.0,  7.0, False, "plant-hamilton",    "ing-sesame-seeds"),
        (-51,   "yield_loss", 12.0,  48.0, 20.4, False, "plant-hamilton",    "ing-oats-rolled"),
        (-51,   "yield_loss", 12.0,  48.0, 20.4, False, "plant-hamilton",    "ing-raisins"),
        (-72,   "yield_loss", 33.0, 132.0, 56.1, False, "plant-montreal",    "ing-butter-unsalted"),
        (-96,   "yield_loss", 62.0, 248.0,105.4, False, "plant-toronto",     "ing-chocolate-chips-dark"),
        (-120,  "yield_loss", 20.5,  82.0, 34.9, False, "plant-mississauga", "ing-sesame-seeds"),
        (-144,  "yield_loss", 18.3,  11.0, 31.1, False, "plant-toronto",     "ing-flour-ap"),
        (-168,  "yield_loss", 14.5,  58.0, 24.7, False, "plant-hamilton",    "ing-chocolate-chips-dark"),
        (-192,  "yield_loss", 28.7, 114.8, 48.8, False, "plant-mississauga", "ing-yeast-active-dry"),
        # MOQ overages
        (-336,  "moq_overage", 1200.0, 4800.0, 2040.0, False, "plant-toronto",     "ing-butter-unsalted"),
        (-240,  "moq_overage",  840.0, 3360.0, 1428.0, False, "plant-toronto",     "ing-butter-unsalted"),
        (-120,  "moq_overage", 1725.0, 1897.5, 2932.5, False, "plant-mississauga", "ing-sugar-granulated"),
        (-96,   "moq_overage",  200.0,  760.0,  340.0, False, "plant-hamilton",    "ing-blueberry-frozen"),
        # Expired pallets
        (-192,  "expired_pallet", 48.0, 192.0,  81.6, False, "plant-montreal",    None),
        (-120,  "expired_pallet", 24.0,  96.0,  40.8, False, "plant-hamilton",    None),
        (-48,   "expired_pallet", 36.0, 144.0,  61.2, False, "plant-toronto",     None),
    ]

    for offset_h, kind, kg, dollar, co2e, avoided, fac, ing in events:
        cur.execute(
            """
            INSERT INTO waste_events
              (event_at, kind, kg, dollar_value, co2e_kg, avoided, facility_id, ingredient_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (now + timedelta(hours=offset_h), kind, kg, dollar, co2e, avoided, fac, ing),
        )

    print(f"[seed_demo] Inserted {len(events)} waste_events.")


def seed_finished_goods_pallets(cur: psycopg.Cursor) -> None:
    now = datetime.utcnow()
    pallets = [
        # Critical: ≤2 days remaining
        ("sku-blueberry-muffin-4pk",   "plant-toronto",     -4,  5,  120, "in_warehouse"),
        ("sku-croissant-butter-4pk",   "plant-toronto",     -2,  3,   80, "in_warehouse"),
        ("sku-cinnamon-roll-6pk",      "plant-montreal",    -4,  5,   95, "in_warehouse"),
        ("sku-almond-danish-4pk",      "plant-montreal",    -3,  4,   45, "in_warehouse"),
        ("sku-blueberry-muffin-4pk",   "plant-hamilton",    -4,  5,   88, "in_warehouse"),
        ("sku-croissant-butter-4pk",   "plant-mississauga", -2,  3,   60, "in_warehouse"),
        # Warning: 3-4 days remaining
        ("sku-lemon-poppy-muffin-4pk", "plant-toronto",     -2,  5,  144, "in_warehouse"),
        ("sku-choc-chip-muffin-4pk",   "plant-hamilton",    -2,  5,  156, "in_warehouse"),
        ("sku-banana-bread-loaf",      "plant-toronto",     -4,  7,  110, "in_warehouse"),
        ("sku-cinnamon-roll-6pk",      "plant-toronto",     -2,  5,   96, "in_warehouse"),
        ("sku-almond-danish-4pk",      "plant-toronto",     -1,  4,  112, "in_warehouse"),
        ("sku-blueberry-muffin-4pk",   "plant-mississauga", -2,  5,  200, "in_warehouse"),
        # Good: 5-14 days remaining
        ("sku-choc-chip-cookie-12pk",  "plant-toronto",     -1, 14,  240, "in_warehouse"),
        ("sku-oatmeal-cookie-12pk",    "plant-toronto",     -2, 14,  180, "in_warehouse"),
        ("sku-bagel-plain-6pk",        "plant-mississauga", -1,  7,  300, "in_warehouse"),
        ("sku-bagel-sesame-6pk",       "plant-mississauga", -2,  7,  250, "in_warehouse"),
        ("sku-sourdough-loaf",         "plant-mississauga", -1,  7,  140, "in_warehouse"),
        ("sku-banana-bread-loaf",      "plant-hamilton",    -1,  7,  120, "in_warehouse"),
        ("sku-choc-chip-cookie-12pk",  "plant-hamilton",    -3, 14,  160, "in_warehouse"),
        ("sku-oatmeal-cookie-12pk",    "plant-hamilton",    -1, 14,  190, "in_warehouse"),
        ("sku-bagel-plain-6pk",        "plant-toronto",     -2,  7,  280, "in_warehouse"),
        ("sku-sourdough-loaf",         "plant-toronto",     -3,  7,  100, "in_warehouse"),
        ("sku-cinnamon-roll-6pk",      "plant-hamilton",    -1,  5,  130, "in_warehouse"),
        ("sku-banana-bread-loaf",      "plant-montreal",    -2,  7,   90, "in_warehouse"),
        ("sku-choc-chip-muffin-4pk",   "plant-toronto",     -1,  5,  176, "in_warehouse"),
        ("sku-lemon-poppy-muffin-4pk", "plant-hamilton",    -1,  5,  148, "in_warehouse"),
        ("sku-blueberry-muffin-4pk",   "plant-montreal",    -1,  5,  168, "in_warehouse"),
        ("sku-choc-chip-cookie-12pk",  "plant-montreal",    -1, 14,  200, "in_warehouse"),
        ("sku-bagel-plain-6pk",        "plant-montreal",    -2,  7,  220, "in_warehouse"),
        # Shipped
        ("sku-blueberry-muffin-4pk",   "plant-toronto",     -3,  5,  240, "shipped"),
        ("sku-choc-chip-cookie-12pk",  "plant-toronto",     -3, 14,  320, "shipped"),
        ("sku-banana-bread-loaf",      "plant-mississauga", -2,  7,  180, "shipped"),
        ("sku-bagel-plain-6pk",        "plant-mississauga", -2,  7,  360, "shipped"),
        ("sku-cinnamon-roll-6pk",      "plant-toronto",     -3,  5,  150, "shipped"),
        ("sku-almond-danish-4pk",      "plant-montreal",    -2,  4,   96, "shipped"),
        # Written off / donated
        ("sku-blueberry-muffin-4pk",   "plant-toronto",     -7,  5,   48, "written_off"),
        ("sku-cinnamon-roll-6pk",      "plant-montreal",    -9,  5,   24, "donated"),
        ("sku-banana-bread-loaf",      "plant-hamilton",   -10,  7,   36, "donated"),
        ("sku-croissant-butter-4pk",   "plant-toronto",     -8,  3,   24, "written_off"),
        # Fresh (just produced)
        ("sku-blueberry-muffin-4pk",   "plant-toronto",     0,   5,  800, "in_warehouse"),
        ("sku-choc-chip-cookie-12pk",  "plant-toronto",     0,  14,  960, "in_warehouse"),
        ("sku-bagel-plain-6pk",        "plant-mississauga", 0,   7, 1100, "in_warehouse"),
        ("sku-oatmeal-cookie-12pk",    "plant-hamilton",    0,  14,  640, "in_warehouse"),
        ("sku-cinnamon-roll-6pk",      "plant-montreal",    0,   5,  450, "in_warehouse"),
        ("sku-banana-bread-loaf",      "plant-toronto",     0,   7,  550, "in_warehouse"),
    ]

    for sku, fac, day_offset, shelf_days, qty, status in pallets:
        cur.execute(
            """
            INSERT INTO finished_goods_pallets
              (sku_id, facility_id, produced_at, shelf_life_days, quantity, status)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (sku, fac, now + timedelta(days=day_offset), shelf_days, qty, status),
        )

    print(f"[seed_demo] Inserted {len(pallets)} finished_goods_pallets.")


def seed_moq_tax_ledger(cur: psycopg.Cursor) -> None:
    entries = [
        ("sup-valleydairy",  "2026-Q1", 1200.0,  4800.0),
        ("sup-valleydairy",  "2026-Q2",  840.0,  3360.0),
        ("sup-prairiebulk",  "2026-Q1", 2500.0,  2750.0),
        ("sup-prairiebulk",  "2026-Q2", 1725.0,  1897.5),
        ("sup-coastalberry", "2026-Q1",  600.0,  2280.0),
        ("sup-coastalberry", "2026-Q2",  200.0,   760.0),
        ("sup-northgrain",   "2026-Q1",  400.0,  1400.0),
        ("sup-newleaf",      "2026-Q1",  320.0,  1056.0),
    ]
    for sup, qtr, overage, cost in entries:
        cur.execute(
            "INSERT INTO moq_tax_ledger (supplier_id, quarter, overage_kg, holding_cost) VALUES (%s, %s, %s, %s)",
            (sup, qtr, overage, cost),
        )
    print(f"[seed_demo] Inserted {len(entries)} moq_tax_ledger entries.")


def seed_negotiation_drafts(cur: psycopg.Cursor, m, card_map: dict[str, str]) -> None:
    drafts = [
        {
            "supplier_id": _sup("sup_c"),
            "trigger_kind": "moq_tax",
            "body_md": m.NEGOTIATION_DRAFTS[0]["body_md"],
            "status": "pending",
            "created_at": datetime.utcnow() - timedelta(hours=4),
            "action_card_id": None,
        },
        {
            "supplier_id": _sup("sup_d"),
            "trigger_kind": "price_drift",
            "body_md": (
                "## Pricing Review — Coastal Berry Growers\n\n"
                "CBOT data shows berry inputs up ~12% YTD. Your last three invoices reflect "
                "a 14.8% net increase vs our 2025 contract baseline, exceeding the 8% CPI cap.\n\n"
                "**Request:** Revised quote within contracted CPI cap for H2 2026.\n\n"
                "Sarah Kim | Procurement Lead, FGF Brands"
            ),
            "status": "pending",
            "created_at": datetime.utcnow() - timedelta(days=1),
            "action_card_id": None,
        },
        {
            "supplier_id": _sup("sup_b"),
            "trigger_kind": "late_window",
            "body_md": (
                "## Delivery Performance — Valley Dairy Cooperative\n\n"
                "On-time rate dropped to 68% this month (SLA: 90%). Three of last five "
                "deliveries missed the contracted window, causing 4.5 hours of line holds.\n\n"
                "**Request:** Written SLA commitment for Q3 or penalty clause discussion.\n\n"
                "Sarah Kim | Procurement Lead, FGF Brands"
            ),
            "status": "sent",
            "created_at": datetime.utcnow() - timedelta(days=5),
            "action_card_id": None,
        },
    ]

    for d in drafts:
        cur.execute(
            """
            INSERT INTO negotiation_drafts
              (supplier_id, trigger_kind, body_md, status, created_at, action_card_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (d["supplier_id"], d["trigger_kind"], d["body_md"],
             d["status"], d["created_at"], d["action_card_id"]),
        )

    print(f"[seed_demo] Inserted {len(drafts)} negotiation_drafts.")


def seed_weekly_summaries(cur: psycopg.Cursor, m) -> None:
    today = date.today()
    week_start = today - timedelta(days=7)
    week_end = today - timedelta(days=1)
    stats = m.WEEKLY_SUMMARIES[0]["stats"]

    cur.execute(
        """
        INSERT INTO weekly_summaries (week_start, week_end, stats, narration_md, gmail_draft_url)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (week_start) DO NOTHING
        """,
        (
            week_start, week_end,
            json.dumps(stats),
            m.WEEKLY_SUMMARIES[0]["narration_md"],
            "https://mail.google.com/mail/u/0/#drafts/mock-weekly-summary",
        ),
    )
    print("[seed_demo] Inserted 1 weekly_summary.")


def seed_dock_schedules(cur: psycopg.Cursor) -> None:
    today = date.today()
    facilities = ["plant-toronto", "plant-mississauga", "plant-hamilton", "plant-montreal"]
    booked = {
        ("plant-toronto",     0, 0): "sup-northgrain",
        ("plant-toronto",     1, 2): "sup-valleydairy",
        ("plant-mississauga", 0, 1): "sup-prairiebulk",
        ("plant-hamilton",    2, 0): "sup-coastalberry",
        ("plant-montreal",    1, 3): "sup-northgrain",
    }

    rows = []
    for fac in facilities:
        for day in range(7):
            for slot in range(4):
                sup = booked.get((fac, day, slot))
                remaining = 20000 if sup is None else (8000 + slot * 2000)
                rows.append((fac, today + timedelta(days=day), slot, sup, remaining))

    for fac, slot_date, slot_index, sup, remaining in rows:
        cur.execute(
            """
            INSERT INTO dock_schedules
              (facility_id, slot_date, slot_index, supplier_id, capacity_remaining_kg)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (facility_id, slot_date, slot_index) DO NOTHING
            """,
            (fac, slot_date, slot_index, sup, remaining),
        )

    print(f"[seed_demo] Inserted {len(rows)} dock_schedule slots.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true",
                        help="Clear existing demo data and re-insert.")
    args = parser.parse_args()

    m = _load_mock_data()

    with psycopg.connect(DATABASE_URL, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM production_schedules")
            existing = cur.fetchone()[0]

            if existing > 0 and not args.force:
                print(f"[seed_demo] {existing} production_schedules already present. "
                      "Use --force to re-seed.")
                return 0

            if args.force:
                _clear(cur)

            card_map = seed_action_cards(cur, m)
            seed_supplier_orders(cur, m, card_map)
            sched_map = seed_production_schedules(cur)
            seed_production_runs(cur, sched_map)
            seed_waste_events(cur, m)
            seed_finished_goods_pallets(cur)
            seed_moq_tax_ledger(cur)
            seed_negotiation_drafts(cur, m, card_map)
            seed_weekly_summaries(cur, m)
            seed_dock_schedules(cur)

        conn.commit()

    print("[seed_demo] Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
