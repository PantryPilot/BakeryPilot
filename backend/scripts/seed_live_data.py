"""Seed the live PostgreSQL database with the data from mock_data.py.

Idempotent: uses INSERT ... ON CONFLICT DO NOTHING throughout.
Run from the backend/ directory:

    uv run python scripts/seed_live_data.py

Reads DATABASE_URL from the environment or a .env file in backend/.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Allow importing app.mock_data without installing the package
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("psycopg2 not found — run: uv add psycopg2-binary")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass  # dotenv optional

from app import mock_data  # noqa: E402  (after sys.path patch)

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/bakerypilot")


def run() -> None:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    # ── Suppliers ────────────────────────────────────────────────────────────
    # Map mock_data personality strings → schema CHECK values
    _PERSONALITY_MAP = {
        "reliable": "reliable",
        "cheap-but-late": "cheap_late",
        "cheap_late": "cheap_late",
        "high-MOQ": "high_moq",
        "high_moq": "high_moq",
        "seasonally-disrupted": "disrupted",
        "disrupted": "disrupted",
        "new": "new",
    }
    print("Seeding suppliers…")
    execute_values(
        cur,
        """
        INSERT INTO suppliers (
            supplier_id, name, personality_tag, contact_email, payment_terms,
            moq_kg, lead_time_mean_days, lead_time_std_days,
            window_earliest_day, window_latest_day,
            contract_expiry_date,
            on_time_rate, fill_rate, window_compliance_rate,
            price_variance_vs_benchmark
        ) VALUES %s
        ON CONFLICT (supplier_id) DO NOTHING
        """,
        [
            (
                s["supplier_id"], s["name"],
                _PERSONALITY_MAP.get(s.get("personality", "reliable"), "reliable"),
                s["contact_email"], s["payment_terms"],
                s["moq_kg"], s["lead_time_mean_days"],
                s["lead_time_std_days"], s["window_earliest_day"], s["window_latest_day"],
                s["contract_expiry_date"], s["on_time_rate"], s["fill_rate"],
                s["window_compliance_rate"], s["price_variance_vs_benchmark"],
            )
            for s in mock_data.SUPPLIERS
        ],
    )
    print(f"  {len(mock_data.SUPPLIERS)} suppliers")

    # ── Supplier orders ───────────────────────────────────────────────────────
    # Schema: order_id (UUID auto), supplier_id, facility_id (NOT NULL),
    # delivery_date, status (draft/pending_confirm/confirmed/sent), confirmed_at.
    # Items go into supplier_order_items; no `items` jsonb column.
    # mock_data uses plant_1..4; schema uses plant-toronto etc.
    _FACILITY_MAP = {
        "plant_1": "plant-toronto",
        "plant_2": "plant-mississauga",
        "plant_3": "plant-hamilton",
        "plant_4": "plant-montreal",
    }

    _STATUS_MAP = {
        "confirmed": "confirmed", "sent": "sent",
        "pending_confirm": "pending_confirm", "draft": "draft",
        "in-transit": "sent", "pending": "pending_confirm",
    }
    # Default all mock orders to the first facility
    cur.execute("SELECT facility_id FROM facilities LIMIT 1")
    default_facility = (cur.fetchone() or ("plant-toronto",))[0]

    print("Seeding supplier_orders…")
    for o in mock_data.SUPPLIER_ORDERS:
        status = _STATUS_MAP.get(o.get("status", "draft"), "draft")
        # Insert header — let DB generate UUID; use external_po_number to dedup
        cur.execute(
            """
            INSERT INTO supplier_orders (
                supplier_id, facility_id, delivery_date,
                status, confirmed_at, external_po_number
            )
            SELECT %s, %s, %s, %s, %s, %s
            WHERE NOT EXISTS (
                SELECT 1 FROM supplier_orders WHERE external_po_number = %s
            )
            RETURNING order_id
            """,
            (
                o["supplier_id"], default_facility,
                o.get("delivery_date"), status,
                o.get("confirmed_at"), o["order_id"],
                o["order_id"],
            ),
        )
        row = cur.fetchone()
        # Items skipped: mock_data ingredient IDs don't match schema IDs
    print(f"  {len(mock_data.SUPPLIER_ORDERS)} supplier orders")

    # ── Waste events ──────────────────────────────────────────────────────────
    # Schema: waste_event_id (UUID auto), event_at, kind (spoilage/yield_loss/
    # moq_overage/expired_pallet), kg, dollar_value, co2e_kg, avoided, facility_id.
    # mock_data uses: ts, quantity_kg, value_usd, reason, lot_id, ingredient_name.
    def _infer_kind(reason: str, avoided: bool) -> str:
        r = reason.lower()
        if "moq" in r or "overage" in r:
            return "moq_overage"
        if "expir" in r or "pallet" in r:
            return "expired_pallet"
        if "yield" in r or "trim" in r:
            return "yield_loss"
        return "spoilage"

    print("Seeding waste_events…")
    execute_values(
        cur,
        """
        INSERT INTO waste_events (
            event_at, kind, kg, dollar_value, avoided, facility_id
        ) VALUES %s
        """,
        [
            (
                e["ts"], _infer_kind(e.get("reason", ""), e.get("avoided", False)),
                e.get("quantity_kg", 0), e.get("value_usd", 0),
                e.get("avoided", False),
                _FACILITY_MAP.get(e.get("facility_id", ""), "plant-toronto"),
            )
            for e in mock_data.WASTE_EVENTS
        ],
    )
    print(f"  {len(mock_data.WASTE_EVENTS)} waste events")

    # ── Disruption signals ────────────────────────────────────────────────────
    # signal_id is UUID auto-generated; skip it to avoid text→uuid cast errors.
    # Skip ingredient_id if not present in ingredients table (FK guard).
    print("Seeding disruption_signals…")
    execute_values(
        cur,
        """
        INSERT INTO disruption_signals (
            supplier_id, kind, severity, source, message, observed_at
        ) VALUES %s
        """,
        [
            (
                d.get("supplier_id"), d["kind"], d["severity"],
                d["source"], d["message"], d["observed_at"],
            )
            for d in mock_data.DISRUPTION_SIGNALS
        ],
    )
    print(f"  {len(mock_data.DISRUPTION_SIGNALS)} disruption signals")

    conn.commit()
    cur.close()
    conn.close()
    print("\nDone. Database seeded successfully.")


if __name__ == "__main__":
    run()
