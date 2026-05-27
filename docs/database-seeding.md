# Database Seeding Guide

This guide explains how to populate the PostgreSQL database with the
realistic demo dataset that drives BakeryPilot's UI, agent tools, and
alert SSE. The seed data is designed around the scenarios in
[`demo-seed-data-audit.md`](./demo-seed-data-audit.md) — every page has
something meaningful to render, and every agent question has a real answer
to find.

## When do you need this?

The backend runs against PostgreSQL by default. The legacy "mock mode"
(serving from `backend/app/mock_data.py`) still exists but every router
under `backend/app/api/` reads from the live database via SQLAlchemy. As
long as the schema is migrated and the seed has run, the UI works.

## Quick start (one command)

```bash
make up                # postgres + redis
make schema.migrate    # apply schema.sql
make schema.seed       # runs the full bootstrap chain
```

`make schema.seed` chains five steps in dependency order:

| # | Step | Inserts |
|---|---|---|
| 1 | `infra/supabase/seed.sql` | 90 ingredients, 5 suppliers, 4 retailers, 12 branded SKUs, 15 stakeholders, 10 retailer_orders, 5 disruption_signals, 168 demand_forecasts (12 SKUs × 14 d), 8 production_orders covering every status, app_user + user_settings. |
| 2 | `infra/seed_toronto_facilities.py` | 4 facilities (live FGF + Nominatim, with cached fallbacks under `infra/data/cache/`). |
| 3 | `infra/seed_synthetic.py` | 9 production_lines, 12 warehouse_costs, 27 allergen_changeovers, ~58 production_formulas — all tagged `source: engineering_judgment_demo_only`. |
| 4 | `infra/seed_lots.py` | ~165 ingredient_lots: 20 curated demo-scenario lots (pinned by `lot_code` like `L-DEMO-BUT-001`) + ~145 Faker bulk-fill lots with comfortable 30-180 d expiry. |
| 5 | `infra/seed_demo.py` | Transactional layer: 6 action_cards, 12 supplier_orders + items, 20 production_schedules, 12 production_runs, 33 waste_events, 45 finished_goods_pallets (with `committed_order_id` wired to retailer_orders), ~20 inventory_events, 5 notification_drafts, 8 MOQ tax entries, 3 negotiation_drafts, 1 weekly_summary, 112 dock_schedules. |

Resetting:

```bash
make reset             # wipes the postgres volume
make up
make schema.migrate    # auto-applied on first boot too; safe to re-run
make schema.seed
```

## What you get after a successful seed

```text
$ make db.status
 facilities             |   4
 suppliers              |   5
 ingredients            |  90
 skus                   |  12
 production_lines       |   9
 ingredient_lots        | ~165
 retailer_orders        |  10
 demand_forecasts       | 168
 disruption_signals     |   5
 stakeholders           |  15
 production_schedules   |  20
 production_runs        |  12
 supplier_orders        |  12
 action_cards           |   6
 waste_events           |  33
 finished_goods_pallets |  45
 inventory_events       |  ~20
 notification_drafts    |   5
 moq_tax_ledger         |   8
 negotiation_drafts     |   3
 dock_schedules         | 112
 weekly_summaries       |   1
 production_orders      |   8
```

## Demo scenarios baked into the seed

The data is curated to surface specific narratives. See
[`demo-seed-data-audit.md`](./demo-seed-data-audit.md) §3 for the full
catalog. Highlights:

- **Critical butter at Toronto** — `L-DEMO-BUT-001/002` (40 kg + 25 kg
  expiring in 1-2 days) and a paused Mini Naan production_order (PO-3)
  waiting on a delayed Valley Dairy delivery.
- **Surplus at Hamilton** — `L-DEMO-BUT-003` (420 kg butter, 35 d
  remaining) seeds a transfer-opportunity scenario.
- **Low stock blueberries at Toronto** — `L-DEMO-BLU-001` (8 kg) vs the
  healthy 320 kg at Mississauga (`L-DEMO-BLU-002`).
- **Disrupted supplier** — Coastal Berry has a high-severity weather
  signal + a `pending_confirm` PO for blueberries.
- **Production status coverage** — at least one production_order in
  each of `planned`, `producing`, `paused`, `produced`, `cancelled`,
  plus a 5 000-unit Mini Naan QA order designed to fail
  `POST /api/production/orders/{id}/produce` with HTTP 422.
- **Retailer fulfilment lifecycle** — 10 retailer_orders covering open,
  scheduled, shipped, and cancelled, with shipped/scheduled pallets
  linked via `committed_order_id`.
- **Yield variance investigations** — 12 historical production_runs
  with realistic per-ingredient consumption JSON, including 2 high-
  variance events (sesame +76%, butter +23%) that drive alerts.

## Idempotency & re-seeding

- `seed.sql` uses `ON CONFLICT DO NOTHING` and `IF (count = 0)`
  guards everywhere; it's safe to re-apply.
- `seed_synthetic.py` and `seed_toronto_facilities.py` use
  `ON CONFLICT DO NOTHING`.
- `seed_lots.py` clears and replaces (FK-aware: removes inventory_events
  first, then ingredient_lots, then re-inserts).
- `seed_demo.py` skips if `production_schedules` already has rows. Use
  `uv run infra/seed_demo.py --force` to clear the mutable tables and
  re-insert. `waste_events`, `inventory_events`, and
  `notification_drafts` are append-only and are only seeded when empty.

For a guaranteed-clean re-seed: `make reset && make up && make schema.migrate && make schema.seed`.

## Mock-data fallback (legacy)

`backend/app/mock_data.py` still exists. The API routers no longer read
from it — it's now used only as:

1. A copy-template for `infra/seed_demo.py`'s narration markdown
   (`NEGOTIATION_DRAFTS[0]`, `WEEKLY_SUMMARIES[0]`).
2. The source for `backend/scripts/seed_live_data.py`, an early
   pre-cascade sync that maps mock IDs (`plant_1`, `sup_a`) onto the
   real schema IDs. The mapping is incomplete (ingredient IDs differ)
   and this path is deprecated in favour of the chained seed above.

You generally should not need `seed_live_data.py` — `make schema.seed`
covers everything it does, plus more.

## Schema reference

Full schema: `infra/supabase/schema.sql`. Key dependency order:

```
facilities
  ├── production_lines        (facility_id FK)
  ├── ingredient_lots         (facility_id FK)
  └── warehouse_costs         (facility_id FK)

ingredients
  ├── ingredient_lots         (ingredient_id FK)
  ├── production_formulas     (ingredient_id FK)
  └── waste_events            (ingredient_id soft-ref)

skus
  ├── production_formulas     (sku_id FK)
  ├── production_orders       (sku_id FK)
  ├── production_schedules    (sku_id FK)
  ├── retailer_orders         (sku_id FK)
  └── demand_forecasts        (sku_id FK)

suppliers
  ├── supplier_orders         (supplier_id FK)
  ├── ingredient_lots         (supplier_id nullable FK)
  ├── moq_tax_ledger          (supplier_id FK)
  └── disruption_signals      (supplier_id nullable FK)

retailers
  └── retailer_orders         (retailer_id FK)

ingredient_lots
  └── inventory_events        (lot_id FK, append-only)

production_lines
  └── production_orders       (line_id FK)
  ↑ production_lines.current_order_id → production_orders.order_id (soft-ref)

action_cards
  ├── supplier_orders         (action_card_id FK)
  ├── negotiation_drafts      (action_card_id FK)
  └── notification_drafts     (action_card_id FK)
```

Append-only tables (no UPDATE/DELETE via app code):
`inventory_events`, `waste_events`, `notification_drafts`.
