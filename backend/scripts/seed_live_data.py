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
    print("Seeding suppliers…")
    execute_values(
        cur,
        """
        INSERT INTO suppliers (
            supplier_id, name, personality, contact_email, payment_terms,
            moq_kg, lead_time_mean_days, lead_time_std_days,
            window_earliest_day, window_latest_day,
            contract_expiry_date,
            on_time_rate, fill_rate, window_compliance_rate,
            price_variance_vs_benchmark, moq_tax_quarter_usd
        ) VALUES %s
        ON CONFLICT (supplier_id) DO NOTHING
        """,
        [
            (
                s["supplier_id"], s["name"], s["personality"], s["contact_email"],
                s["payment_terms"], s["moq_kg"], s["lead_time_mean_days"],
                s["lead_time_std_days"], s["window_earliest_day"], s["window_latest_day"],
                s["contract_expiry_date"], s["on_time_rate"], s["fill_rate"],
                s["window_compliance_rate"], s["price_variance_vs_benchmark"],
                s["moq_tax_quarter_usd"],
            )
            for s in mock_data.SUPPLIERS
        ],
    )
    print(f"  {len(mock_data.SUPPLIERS)} suppliers")

    # ── Supplier orders ───────────────────────────────────────────────────────
    print("Seeding supplier_orders…")
    for o in mock_data.SUPPLIER_ORDERS:
        import json
        cur.execute(
            """
            INSERT INTO supplier_orders (
                order_id, supplier_id, items, delivery_date,
                status, confirmed_at, action_card_id
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (order_id) DO NOTHING
            """,
            (
                o["order_id"], o["supplier_id"], json.dumps(o["items"]),
                o["delivery_date"], o["status"],
                o.get("confirmed_at"), o.get("action_card_id"),
            ),
        )
    print(f"  {len(mock_data.SUPPLIER_ORDERS)} supplier orders")

    # ── Waste events ──────────────────────────────────────────────────────────
    print("Seeding waste_events…")
    execute_values(
        cur,
        """
        INSERT INTO waste_events (
            event_id, ts, lot_id, ingredient_name,
            quantity_kg, value_usd, reason, avoided, facility_id
        ) VALUES %s
        ON CONFLICT (event_id) DO NOTHING
        """,
        [
            (
                e["event_id"], e["ts"], e["lot_id"], e["ingredient_name"],
                e["quantity_kg"], e["value_usd"], e["reason"],
                e["avoided"], e["facility_id"],
            )
            for e in mock_data.WASTE_EVENTS
        ],
    )
    print(f"  {len(mock_data.WASTE_EVENTS)} waste events")

    # ── Disruption signals ────────────────────────────────────────────────────
    print("Seeding disruption_signals…")
    execute_values(
        cur,
        """
        INSERT INTO disruption_signals (
            signal_id, supplier_id, ingredient_id,
            kind, severity, source, message, observed_at
        ) VALUES %s
        ON CONFLICT (signal_id) DO NOTHING
        """,
        [
            (
                d["signal_id"], d.get("supplier_id"), d.get("ingredient_id"),
                d["kind"], d["severity"], d["source"],
                d["message"], d["observed_at"],
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
