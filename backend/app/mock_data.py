"""Deterministic mock data for every endpoint. Reset on process restart.

Replaces DB queries during the mock-only phase. Each entity uses a stable string
ID with a domain prefix (lot_, sup_, ord_, etc.) for readability.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

# Anchor "now" so responses are reproducible across requests.
NOW = datetime(2026, 5, 25, 9, 0, 0)
TODAY = NOW.date()


# --- Facilities ---

FACILITIES: list[dict[str, Any]] = [
    {"facility_id": "plant_1", "name": "Toronto", "city": "Toronto, ON"},
    {"facility_id": "plant_2", "name": "Hamilton", "city": "Hamilton, ON"},
    {"facility_id": "plant_3", "name": "Brantford", "city": "Brantford, ON"},
    {"facility_id": "plant_4", "name": "Mississauga", "city": "Mississauga, ON"},
]


# --- Ingredients ---

INGREDIENTS: list[dict[str, Any]] = [
    {"ingredient_id": "ing_flour", "name": "Flour", "storage_zone": "dry"},
    {"ingredient_id": "ing_butter", "name": "Butter", "storage_zone": "refrigerated"},
    {"ingredient_id": "ing_blueberries", "name": "Blueberries", "storage_zone": "frozen"},
    {"ingredient_id": "ing_sugar", "name": "Sugar", "storage_zone": "dry"},
    {"ingredient_id": "ing_choc_chips", "name": "Chocolate Chips", "storage_zone": "dry"},
    {"ingredient_id": "ing_sesame", "name": "Sesame Seeds", "storage_zone": "dry"},
]


# --- SKUs ---

SKUS: list[dict[str, Any]] = [
    {"sku_id": "sku_blueberry_muffin", "name": "Blueberry Muffin", "allergen_class": "dairy"},
    {"sku_id": "sku_lemon_poppy", "name": "Lemon Poppy Seed Muffin", "allergen_class": "dairy"},
    {"sku_id": "sku_chocolate_chip", "name": "Chocolate Chip Muffin", "allergen_class": "dairy"},
    {"sku_id": "sku_croissant", "name": "Butter Croissant", "allergen_class": "dairy"},
    {"sku_id": "sku_naan", "name": "Naan", "allergen_class": "dairy"},
    {"sku_id": "sku_sesame_bagel", "name": "Sesame Bagel", "allergen_class": "sesame"},
]


# --- Suppliers ---

SUPPLIERS: list[dict[str, Any]] = [
    {
        "supplier_id": "sup_a", "name": "Maple Grain Co.", "personality": "reliable",
        "contact_email": "orders@maplegrain.test", "payment_terms": "net-30",
        "moq_kg": 1000.0, "lead_time_mean_days": 1.5, "lead_time_std_days": 0.4,
        "window_earliest_day": 2, "window_latest_day": 5,
        "contract_expiry_date": (TODAY + timedelta(days=82)).isoformat(),
        "on_time_rate": 0.96, "fill_rate": 0.99, "window_compliance_rate": 0.92,
        "price_variance_vs_benchmark": 0.02, "moq_tax_quarter_usd": 1840.0,
    },
    {
        "supplier_id": "sup_b", "name": "Cheap-N-Late Foods", "personality": "cheap-but-late",
        "contact_email": "ops@cheap-n-late.test", "payment_terms": "2/10 net-30",
        "moq_kg": 500.0, "lead_time_mean_days": 2.3, "lead_time_std_days": 1.1,
        "window_earliest_day": 3, "window_latest_day": 3,
        "contract_expiry_date": (TODAY + timedelta(days=210)).isoformat(),
        "on_time_rate": 0.78, "fill_rate": 0.95, "window_compliance_rate": 0.55,
        "price_variance_vs_benchmark": -0.08, "moq_tax_quarter_usd": 320.0,
    },
    {
        "supplier_id": "sup_c", "name": "Bulk Wheat Holdings", "personality": "high-MOQ",
        "contact_email": "sales@bulkwheat.test", "payment_terms": "net-45",
        "moq_kg": 2500.0, "lead_time_mean_days": 1.8, "lead_time_std_days": 0.6,
        "window_earliest_day": 1, "window_latest_day": 5,
        "contract_expiry_date": (TODAY + timedelta(days=58)).isoformat(),
        "on_time_rate": 0.90, "fill_rate": 0.98, "window_compliance_rate": 0.86,
        "price_variance_vs_benchmark": -0.04, "moq_tax_quarter_usd": 4220.0,
    },
    {
        "supplier_id": "sup_d", "name": "Prairie Berry Farms", "personality": "seasonally-disrupted",
        "contact_email": "shipping@prairieberry.test", "payment_terms": "net-30",
        "moq_kg": 300.0, "lead_time_mean_days": 2.0, "lead_time_std_days": 0.5,
        "window_earliest_day": 2, "window_latest_day": 4,
        "contract_expiry_date": (TODAY + timedelta(days=29)).isoformat(),
        "on_time_rate": 0.84, "fill_rate": 0.91, "window_compliance_rate": 0.74,
        "price_variance_vs_benchmark": 0.12, "moq_tax_quarter_usd": 580.0,
    },
    {
        "supplier_id": "sup_e", "name": "New Harvest Trading", "personality": "new-entrant",
        "contact_email": "hello@newharvest.test", "payment_terms": "net-30",
        "moq_kg": 400.0, "lead_time_mean_days": 2.5, "lead_time_std_days": 0.8,
        "window_earliest_day": 3, "window_latest_day": 5,
        "contract_expiry_date": (TODAY + timedelta(days=305)).isoformat(),
        "on_time_rate": 0.88, "fill_rate": 0.93, "window_compliance_rate": 0.80,
        "price_variance_vs_benchmark": -0.05, "moq_tax_quarter_usd": 0.0,
    },
]


# --- Warehouse costs ---

_STORAGE_COSTS = {
    "dry": (0.02, 100000.0),
    "refrigerated": (0.06, 25000.0),
    "frozen": (0.08, 15000.0),
}
WAREHOUSE_COSTS: list[dict[str, Any]] = [
    {
        "facility_id": f["facility_id"], "storage_type": zone,
        "cost_per_kg_per_day": cost, "capacity_kg": cap,
    }
    for f in FACILITIES
    for zone, (cost, cap) in _STORAGE_COSTS.items()
]


# --- Retailers ---

RETAILERS: list[dict[str, Any]] = [
    {"retailer_id": "ret_costco", "name": "Costco"},
    {"retailer_id": "ret_walmart", "name": "Walmart"},
    {"retailer_id": "ret_loblaws", "name": "Loblaws"},
    {"retailer_id": "ret_wholefoods", "name": "Whole Foods"},
]


# --- Ingredient lots ---

def _ing_storage(ing_id: str) -> str:
    return next(i["storage_zone"] for i in INGREDIENTS if i["ingredient_id"] == ing_id)


def _ing_name(ing_id: str) -> str:
    return next(i["name"] for i in INGREDIENTS if i["ingredient_id"] == ing_id)


_LOT_SEED: list[tuple[str, str, str, float, int]] = [
    # (lot_id, facility_id, ingredient_id, quantity_kg, days_to_expiry)
    ("lot_blueberry_1", "plant_1", "ing_blueberries", 0.8, 0),
    ("lot_butter_1", "plant_1", "ing_butter", 80.0, 2),
    ("lot_sesame_1", "plant_2", "ing_sesame", 15.0, 1),
    ("lot_choc_1", "plant_3", "ing_choc_chips", 25.0, 2),
    ("lot_blueberry_2", "plant_2", "ing_blueberries", 12.0, 2),
    ("lot_flour_1", "plant_1", "ing_flour", 1200.0, 5),
    ("lot_butter_2", "plant_2", "ing_butter", 300.0, 6),
    ("lot_sugar_1", "plant_1", "ing_sugar", 850.0, 7),
    ("lot_blueberry_3", "plant_3", "ing_blueberries", 45.0, 4),
    ("lot_sesame_2", "plant_4", "ing_sesame", 60.0, 5),
    ("lot_flour_2", "plant_2", "ing_flour", 2200.0, 14),
    ("lot_flour_3", "plant_3", "ing_flour", 1800.0, 18),
    ("lot_butter_3", "plant_3", "ing_butter", 420.0, 12),
    ("lot_butter_4", "plant_4", "ing_butter", 380.0, 10),
    ("lot_sugar_2", "plant_2", "ing_sugar", 950.0, 21),
    ("lot_sugar_3", "plant_3", "ing_sugar", 1100.0, 30),
    ("lot_choc_2", "plant_1", "ing_choc_chips", 120.0, 45),
    ("lot_choc_3", "plant_4", "ing_choc_chips", 200.0, 60),
    ("lot_sesame_3", "plant_1", "ing_sesame", 90.0, 90),
    ("lot_blueberry_4", "plant_4", "ing_blueberries", 180.0, 120),
]


def _spoilage_risk(qty: float, days_to_exp: int) -> float:
    # Critical short-supply: tiny quantity expiring today -> red.
    if days_to_exp <= 1 and qty < 5:
        return 1.5
    scheduled = max(qty * (0.5 if days_to_exp <= 7 else 0.15), 5.0)
    return round(qty / max(1.0, scheduled), 2)


INGREDIENT_LOTS: list[dict[str, Any]] = [
    {
        "lot_id": lot_id, "facility_id": fid, "ingredient_id": iid,
        "ingredient_name": _ing_name(iid), "quantity_kg": qty,
        "expiry_date": (TODAY + timedelta(days=d)).isoformat(),
        "storage_zone": _ing_storage(iid),
        "received_date": (TODAY - timedelta(days=2)).isoformat(),
        "supplier_id": SUPPLIERS[hash(lot_id) % len(SUPPLIERS)]["supplier_id"],
        "spoilage_risk_score": _spoilage_risk(qty, d),
    }
    for lot_id, fid, iid, qty, d in _LOT_SEED
]


# --- Production schedules ---

PRODUCTION_SCHEDULES: list[dict[str, Any]] = [
    {
        "schedule_id": "sched_current", "version": 1,
        "facility_id": "plant_1", "line_id": "line_1",
        "runs": [
            {
                "run_id": "run_1", "sku_id": "sku_blueberry_muffin",
                "start_at": (NOW + timedelta(hours=2)).isoformat(),
                "end_at": (NOW + timedelta(hours=5)).isoformat(),
                "quantity": 5000, "lot_assignments": ["lot_blueberry_1", "lot_butter_1"],
            },
            {
                "run_id": "run_2", "sku_id": "sku_chocolate_chip",
                "start_at": (NOW + timedelta(hours=6)).isoformat(),
                "end_at": (NOW + timedelta(hours=9)).isoformat(),
                "quantity": 4000, "lot_assignments": ["lot_choc_1", "lot_flour_1"],
            },
        ],
        "waste_avoided_kg": 0.0, "status": "approved",
    },
]


# --- Demand forecasts ---

DEMAND_FORECASTS: list[dict[str, Any]] = [
    {
        "sku_id": sku["sku_id"],
        "forecast_date": (TODAY + timedelta(days=d)).isoformat(),
        "quantity_expected": 5000 + (hash(sku["sku_id"] + str(d)) % 2000),
        "quantity_low": 4200 + (hash(sku["sku_id"] + str(d)) % 1500),
        "quantity_high": 6200 + (hash(sku["sku_id"] + str(d)) % 2500),
        "model_version": "lgbm-v0.1",
        "generated_at": NOW.isoformat(),
    }
    for sku in SKUS
    for d in range(14)
]


# --- Retailer orders ---

RETAILER_ORDERS: list[dict[str, Any]] = [
    {
        "order_id": "rord_costco_1", "retailer_id": "ret_costco",
        "sku_id": "sku_blueberry_muffin", "quantity": 80000,
        "requested_delivery_date": (TODAY + timedelta(days=3)).isoformat(),
        "received_at": (NOW - timedelta(hours=2)).isoformat(), "status": "firm",
    },
    {
        "order_id": "rord_walmart_1", "retailer_id": "ret_walmart",
        "sku_id": "sku_naan", "quantity": 145000,
        "requested_delivery_date": (TODAY + timedelta(days=5)).isoformat(),
        "received_at": (NOW - timedelta(hours=12)).isoformat(), "status": "firm",
    },
]


# --- Yield variance ---

YIELD_RUNS: list[dict[str, Any]] = [
    {
        "run_id": "yrun_line2_001", "schedule_id": "sched_current",
        "line_id": "line_2", "facility_id": "plant_1",
        "sku_id": "sku_blueberry_muffin",
        "operator_id": "op_martinez",
        "started_at": (NOW - timedelta(hours=3)).isoformat(),
        "ended_at": NOW.isoformat(),
        "actual_vs_theoretical": [
            {
                "ingredient_id": "ing_flour", "ingredient_name": "Flour",
                "theoretical_kg": 150.0, "actual_kg": 163.5,
                "variance_pct": 0.09, "dollar_leak": 14.0,
            },
            {
                "ingredient_id": "ing_butter", "ingredient_name": "Butter",
                "theoretical_kg": 42.0, "actual_kg": 43.1,
                "variance_pct": 0.026, "dollar_leak": 2.2,
            },
        ],
        "total_dollar_leak": 16.2, "status": "completed",
        "equipment_notes": "Dough divider divider_a last calibrated 47 days ago (spec: 30 days)",
    },
    {
        "run_id": "yrun_line1_001", "schedule_id": "sched_current",
        "line_id": "line_1", "facility_id": "plant_1",
        "sku_id": "sku_croissant",
        "operator_id": "op_chen",
        "started_at": (NOW - timedelta(hours=8)).isoformat(),
        "ended_at": (NOW - timedelta(hours=5)).isoformat(),
        "actual_vs_theoretical": [
            {
                "ingredient_id": "ing_butter", "ingredient_name": "Butter",
                "theoretical_kg": 68.0, "actual_kg": 69.4,
                "variance_pct": 0.021, "dollar_leak": 4.5,
            },
            {
                "ingredient_id": "ing_flour", "ingredient_name": "Flour",
                "theoretical_kg": 120.0, "actual_kg": 121.2,
                "variance_pct": 0.01, "dollar_leak": 1.5,
            },
        ],
        "total_dollar_leak": 6.0, "status": "completed",
        "equipment_notes": "All equipment within spec",
    },
    {
        "run_id": "yrun_line3_001", "schedule_id": "sched_current",
        "line_id": "line_3", "facility_id": "plant_2",
        "sku_id": "sku_sesame_bagel",
        "operator_id": "op_patel",
        "started_at": (NOW - timedelta(hours=6)).isoformat(),
        "ended_at": (NOW - timedelta(hours=3)).isoformat(),
        "actual_vs_theoretical": [
            {
                "ingredient_id": "ing_sesame", "ingredient_name": "Sesame Seeds",
                "theoretical_kg": 12.0, "actual_kg": 14.8,
                "variance_pct": 0.233, "dollar_leak": 8.4,
            },
            {
                "ingredient_id": "ing_flour", "ingredient_name": "Flour",
                "theoretical_kg": 95.0, "actual_kg": 96.0,
                "variance_pct": 0.011, "dollar_leak": 1.2,
            },
        ],
        "total_dollar_leak": 9.6, "status": "completed",
        "equipment_notes": "Sesame hopper sensor flagged 2 mis-dispense events; last cleaned 12 days ago",
    },
    {
        "run_id": "yrun_line2_002", "schedule_id": "sched_current",
        "line_id": "line_2", "facility_id": "plant_1",
        "sku_id": "sku_blueberry_muffin",
        "operator_id": "op_martinez",
        "started_at": (NOW - timedelta(days=1, hours=2)).isoformat(),
        "ended_at": (NOW - timedelta(days=1)).isoformat(),
        "actual_vs_theoretical": [
            {
                "ingredient_id": "ing_flour", "ingredient_name": "Flour",
                "theoretical_kg": 150.0, "actual_kg": 161.0,
                "variance_pct": 0.073, "dollar_leak": 11.0,
            },
        ],
        "total_dollar_leak": 11.0, "status": "completed",
        "equipment_notes": "Dough divider divider_a — same drift pattern as yrun_line2_001",
    },
]


# --- Pallets ---

FINISHED_PALLETS: list[dict[str, Any]] = [
    {
        "pallet_id": f"pal_{i:03d}",
        "sku_id": SKUS[i % len(SKUS)]["sku_id"],
        "facility_id": FACILITIES[i % len(FACILITIES)]["facility_id"],
        "produced_at": (NOW - timedelta(days=(i % 7) + 1)).isoformat(),
        "shelf_life_days": 14,
        "days_remaining": 14 - ((i % 7) + 1),
        "quantity": 600 + (i * 17) % 400,
        "status": "in_warehouse" if i < 35 else "shipped",
        "committed_order_id": None if i < 12 else f"rord_seed_{i}",
    }
    for i in range(40)
]


# --- Waste / ESG ---

WASTE_COUNTER: dict[str, Any] = {
    "kg_avoided": 14820.0,
    "dollars_saved": 21044.0,
    "co2e_avoided_kg": 1893.0,
    "period_start": (TODAY - timedelta(days=90)).isoformat(),
    "period_end": TODAY.isoformat(),
    "moq_tax_ytd": 6960.0,
    "disruptions_caught": 3,
}

ESG_PATTERNS: list[dict[str, Any]] = [
    {
        "pattern_id": "pat_butter_naan",
        "description": "Butter waste events after naan run cancellation within 48h of delivery",
        "occurrences": 3,
        "root_cause": "Late naan order cancellations leave butter without consumption path",
        "proposed_rule": "72-hour production lock after any butter order confirmation",
    },
    {
        "pattern_id": "pat_blueberry_p1",
        "description": "Recurring blueberry stockouts at Plant 1 on Fridays",
        "occurrences": 5,
        "root_cause": "Supplier D delivers at the late end of window; Plant 1 has Friday run schedule",
        "proposed_rule": "Pre-order blueberries 1 day earlier from Supplier A for Friday runs",
    },
]


# --- Disruption signals ---

DISRUPTION_SIGNALS: list[dict[str, Any]] = [
    {
        "signal_id": "dis_001", "supplier_id": "sup_d", "ingredient_id": None,
        "kind": "weather", "severity": 0.72, "source": "news",
        "message": "Saskatchewan drought reducing prairie berry yields",
        "observed_at": (NOW - timedelta(hours=8)).isoformat(),
    },
    {
        "signal_id": "dis_002", "supplier_id": "sup_b", "ingredient_id": None,
        "kind": "miss", "severity": 0.45, "source": "history",
        "message": "Cheap-N-Late has missed 3 of last 10 deliveries within window",
        "observed_at": (NOW - timedelta(days=1)).isoformat(),
    },
]


# --- Stakeholders ---

STAKEHOLDERS: list[dict[str, Any]] = [
    {"stakeholder_id": "stk_1", "name": "Maria Santos", "email": "maria.santos@bakerypilot.test",
     "role": "Procurement Manager", "organization": "FGF",
     "tags": ["supplier_negotiation", "weekly_summary", "contract_lifecycle"]},
    {"stakeholder_id": "stk_2", "name": "James Chen", "email": "james.chen@bakerypilot.test",
     "role": "Plant Manager (Toronto)", "organization": "FGF",
     "tags": ["weekly_summary", "production_changes"]},
    {"stakeholder_id": "stk_3", "name": "Aisha Patel", "email": "aisha.patel@bakerypilot.test",
     "role": "Account Manager (Costco)", "organization": "FGF",
     "tags": ["retailer_negotiation"]},
    {"stakeholder_id": "stk_4", "name": "Liam O'Connor", "email": "liam@maplegrain.test",
     "role": "Account Rep", "organization": "Maple Grain Co.",
     "tags": ["supplier_negotiation"]},
    {"stakeholder_id": "stk_5", "name": "Sophie Tremblay", "email": "sophie.tremblay@bakerypilot.test",
     "role": "ESG Officer", "organization": "FGF",
     "tags": ["weekly_summary", "esg"]},
    {"stakeholder_id": "stk_6", "name": "Diego Rojas", "email": "diego@cheap-n-late.test",
     "role": "Operations", "organization": "Cheap-N-Late Foods",
     "tags": ["supplier_negotiation"]},
    {"stakeholder_id": "stk_7", "name": "Heather Wong", "email": "heather.wong@bakerypilot.test",
     "role": "CFO", "organization": "FGF", "tags": ["weekly_summary"]},
    {"stakeholder_id": "stk_8", "name": "Ryan Murphy", "email": "ryan@bulkwheat.test",
     "role": "Sales", "organization": "Bulk Wheat Holdings",
     "tags": ["supplier_negotiation"]},
    {"stakeholder_id": "stk_9", "name": "Anika Sharma", "email": "anika.sharma@bakerypilot.test",
     "role": "Maintenance Lead", "organization": "FGF", "tags": ["cmms"]},
    {"stakeholder_id": "stk_10", "name": "Marcus Hill", "email": "marcus.hill@bakerypilot.test",
     "role": "VP Operations", "organization": "FGF", "tags": ["weekly_summary"]},
]


_TAG_RELEVANCE_REASONS = {
    "supplier_negotiation": "Owns supplier relationships and can approve term changes",
    "retailer_negotiation": "Owns retailer accounts and can authorize fulfillment counters",
    "contract_lifecycle": "Handles supplier renewals and terminations",
    "weekly_summary": "On the Monday recipients list",
    "esg": "Reviews ESG decisions and Scope 3 outputs",
    "production_changes": "Approves schedule changes affecting the plant floor",
    "cmms": "Triages maintenance work orders",
}


# --- Negotiation drafts ---

NEGOTIATION_DRAFTS: list[dict[str, Any]] = [
    {
        "draft_id": "neg_001", "supplier_id": "sup_c", "trigger_kind": "moq_tax",
        "body_md": (
            "## Proposed MOQ Adjustment\n\n"
            "Our records show $4,220 in MOQ overage costs from Bulk Wheat Holdings "
            "in the current quarter. We'd like to discuss reducing the 2,500 kg MOQ "
            "in exchange for a 12-month volume commitment."
        ),
        "status": "pending",
        "created_at": (NOW - timedelta(hours=4)).isoformat(),
        "sent_at": None, "action_card_id": None,
    },
]


# --- Notification drafts (Gmail) ---

NOTIFICATION_DRAFTS: list[dict[str, Any]] = []


# --- Weekly summaries ---

WEEKLY_SUMMARIES: list[dict[str, Any]] = [
    {
        "summary_id": "ws_2026_w20",
        "week_start": (TODAY - timedelta(days=7)).isoformat(),
        "week_end": (TODAY - timedelta(days=1)).isoformat(),
        "stats": {
            "action_cards_confirmed": 14, "dollar_waste_avoided": 21044.0,
            "moq_tax_accumulated": 1840.0, "supplier_disruptions_caught": 3,
            "schedule_changes_confirmed": 5, "new_supplier_orders": 8,
            "new_retailer_orders": 6,
        },
        "narration_md": (
            "## Weekly Summary\n\nThis week the system caught three supplier "
            "disruptions before impact, prevented $21K in waste through 14 confirmed "
            "substitution and routing decisions, and accumulated $1,840 of MOQ-tax "
            "evidence toward Q2 renegotiation talks with Maple Grain Co."
        ),
        "gmail_draft_url": "https://mail.google.com/mail/u/0/#drafts/mock-ws_2026_w20",
        "created_at": (NOW - timedelta(days=1)).isoformat(),
    },
]


# --- Waste events (append-only audit log) ---

WASTE_EVENTS: list[dict[str, Any]] = [
    {
        "event_id": "we_001", "ts": (NOW - timedelta(hours=1, minutes=18)).isoformat(),
        "lot_id": "LOT-21902", "ingredient_name": "Buttermilk", "quantity_kg": 2.4,
        "value_usd": 18.0, "reason": "Quality reject — failed pH test", "avoided": False,
        "facility_id": "plant_1",
    },
    {
        "event_id": "we_002", "ts": (NOW - timedelta(hours=1, minutes=55)).isoformat(),
        "lot_id": "lot_blueberry_1", "ingredient_name": "Blueberries", "quantity_kg": 0.0,
        "value_usd": 12.0, "reason": "Substituted in time", "avoided": True,
        "facility_id": "plant_1",
    },
    {
        "event_id": "we_003", "ts": (NOW - timedelta(hours=2, minutes=49)).isoformat(),
        "lot_id": "LOT-22051", "ingredient_name": "Cream Cheese", "quantity_kg": 0.0,
        "value_usd": 880.0, "reason": "Transfer to Plant 1 before expiry", "avoided": True,
        "facility_id": "plant_2",
    },
    {
        "event_id": "we_004", "ts": (NOW - timedelta(hours=4, minutes=11)).isoformat(),
        "lot_id": "LOT-21863", "ingredient_name": "Pecans", "quantity_kg": 12.0,
        "value_usd": 248.0, "reason": "Allergen conflict — line changeover failed", "avoided": False,
        "facility_id": "plant_3",
    },
    {
        "event_id": "we_005", "ts": (NOW - timedelta(days=1, hours=3)).isoformat(),
        "lot_id": "lot_butter_1", "ingredient_name": "Butter", "quantity_kg": 0.0,
        "value_usd": 3200.0, "reason": "Rerouted to Plant 2 — naan run moved", "avoided": True,
        "facility_id": "plant_1",
    },
    {
        "event_id": "we_006", "ts": (NOW - timedelta(days=1, hours=11)).isoformat(),
        "lot_id": "LOT-21710", "ingredient_name": "Sesame Seeds", "quantity_kg": 4.1,
        "value_usd": 31.0, "reason": "Overweight drop during portioning", "avoided": False,
        "facility_id": "plant_2",
    },
    {
        "event_id": "we_007", "ts": (NOW - timedelta(days=2, hours=6)).isoformat(),
        "lot_id": "LOT-21655", "ingredient_name": "Sugar", "quantity_kg": 0.0,
        "value_usd": 540.0, "reason": "Cross-facility transfer to Plant 3", "avoided": True,
        "facility_id": "plant_4",
    },
    {
        "event_id": "we_008", "ts": (NOW - timedelta(days=2, hours=14)).isoformat(),
        "lot_id": "LOT-21600", "ingredient_name": "Chocolate Chips", "quantity_kg": 6.8,
        "value_usd": 89.0, "reason": "Damaged packaging — moisture intrusion", "avoided": False,
        "facility_id": "plant_1",
    },
    {
        "event_id": "we_009", "ts": (NOW - timedelta(days=3, hours=9)).isoformat(),
        "lot_id": "LOT-21510", "ingredient_name": "Blueberries", "quantity_kg": 0.0,
        "value_usd": 620.0, "reason": "Scheduled into muffin run — zero waste", "avoided": True,
        "facility_id": "plant_2",
    },
    {
        "event_id": "we_010", "ts": (NOW - timedelta(days=4, hours=2)).isoformat(),
        "lot_id": "LOT-21403", "ingredient_name": "Flour", "quantity_kg": 18.3,
        "value_usd": 11.0, "reason": "Divider calibration drift — over-portioning", "avoided": False,
        "facility_id": "plant_1",
    },
]


# --- Yield telemetry (actual vs theoretical per line, last 14 days) ---

YIELD_TELEMETRY: list[dict[str, Any]] = [
    {
        "date": (TODAY - timedelta(days=13 - i)).isoformat(),
        "line_id": "line_1",
        "facility_id": "plant_1",
        "actual_pct": round(96.4 + (hash(str(i) + "l1") % 30) / 10 - 1.5 + (-3.5 if i == 4 else 0) + (-2.0 if i == 5 else 0), 2),
        "target_pct": 97.1,
    }
    for i in range(14)
] + [
    {
        "date": (TODAY - timedelta(days=13 - i)).isoformat(),
        "line_id": "line_2",
        "facility_id": "plant_1",
        "actual_pct": round(95.8 + (hash(str(i) + "l2") % 25) / 10 - 1.2, 2),
        "target_pct": 96.5,
    }
    for i in range(14)
]


# --- In-memory mutable state ---

ACTION_CARDS: dict[str, dict[str, Any]] = {}
SUPPLIER_ORDERS: list[dict[str, Any]] = [
    {
        "order_id": "ord_001", "supplier_id": "sup_a",
        "items": [{"ingredient_id": "ing_flour", "quantity_kg": 1200.0, "unit_price": 0.72}],
        "delivery_date": (TODAY + timedelta(days=3)).isoformat(),
        "status": "confirmed", "confirmed_at": (NOW - timedelta(days=2)).isoformat(),
        "action_card_id": None,
    },
    {
        "order_id": "ord_002", "supplier_id": "sup_b",
        "items": [{"ingredient_id": "ing_sugar", "quantity_kg": 800.0, "unit_price": 0.55}],
        "delivery_date": (TODAY + timedelta(days=5)).isoformat(),
        "status": "in-transit", "confirmed_at": (NOW - timedelta(days=1)).isoformat(),
        "action_card_id": None,
    },
    {
        "order_id": "ord_003", "supplier_id": "sup_c",
        "items": [{"ingredient_id": "ing_flour", "quantity_kg": 2500.0, "unit_price": 0.68}],
        "delivery_date": (TODAY + timedelta(days=7)).isoformat(),
        "status": "pending", "confirmed_at": None,
        "action_card_id": None,
    },
    {
        "order_id": "ord_004", "supplier_id": "sup_d",
        "items": [{"ingredient_id": "ing_blueberries", "quantity_kg": 300.0, "unit_price": 3.20}],
        "delivery_date": (TODAY + timedelta(days=4)).isoformat(),
        "status": "in-transit", "confirmed_at": (NOW - timedelta(hours=18)).isoformat(),
        "action_card_id": None,
    },
    {
        "order_id": "ord_005", "supplier_id": "sup_e",
        "items": [{"ingredient_id": "ing_butter", "quantity_kg": 400.0, "unit_price": 4.10}],
        "delivery_date": (TODAY + timedelta(days=6)).isoformat(),
        "status": "confirmed", "confirmed_at": (NOW - timedelta(days=3)).isoformat(),
        "action_card_id": None,
    },
    {
        "order_id": "ord_006", "supplier_id": "sup_a",
        "items": [
            {"ingredient_id": "ing_sesame", "quantity_kg": 150.0, "unit_price": 2.85},
            {"ingredient_id": "ing_choc_chips", "quantity_kg": 200.0, "unit_price": 3.50},
        ],
        "delivery_date": (TODAY + timedelta(days=9)).isoformat(),
        "status": "pending", "confirmed_at": None,
        "action_card_id": None,
    },
]


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def make_action_card(kind: str, payload: dict) -> dict:
    """Create and persist a new action card in pending state."""
    card_id = new_id("card")
    card = {
        "card_id": card_id, "kind": kind, "payload": payload, "state": "pending",
        "created_at": datetime.utcnow().isoformat(),
        "decided_at": None, "decided_by": None,
    }
    ACTION_CARDS[card_id] = card
    return card


def compute_landed_cost(
    items: list[dict], supplier_id: str, expected_days_held: int = 4,
) -> dict:
    """Mock landed cost: unit price * qty + overage holding cost."""
    supplier = next((s for s in SUPPLIERS if s["supplier_id"] == supplier_id), SUPPLIERS[0])
    unit_total = sum(i["quantity_kg"] * i.get("unit_price", 1.0) for i in items)
    total_qty = sum(i["quantity_kg"] for i in items)
    overage_qty = max(0.0, supplier["moq_kg"] - total_qty)
    overage_cost = overage_qty * 0.5  # nominal overage price markup
    holding_cost = overage_qty * 0.06 * expected_days_held
    return {
        "unit_cost": round(unit_total, 2),
        "overage_cost": round(overage_cost, 2),
        "holding_cost": round(holding_cost, 2),
        "total": round(unit_total + overage_cost + holding_cost, 2),
    }


def stakeholder_with_reason(s: dict, tag_match: str | None) -> dict:
    out = dict(s)
    if tag_match and tag_match in s["tags"]:
        out["relevance_reason"] = _TAG_RELEVANCE_REASONS.get(tag_match, "Relevant to this action")
    return out
