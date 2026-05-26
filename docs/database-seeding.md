# Database Seeding Guide

This guide explains how to populate the PostgreSQL database with realistic seed data that matches what the backend's mock layer currently serves.

## When do you need this?

The backend runs in **mock mode** by default — all data is served from `backend/app/mock_data.py` and resets on every process restart. If you switch to **live database mode** (set `APP_MODE=live` or connect the routers to SQLAlchemy), you need the database pre-populated or nothing will appear in the UI.

## Quick start (automated)

```bash
# 1. Start postgres + redis
make up

# 2. Apply the schema
make schema.migrate

# 3. Seed ingredient lots (150+ rows, uses Faker)
make schema.seed

# 4. Run the supplemental seed script for the entities added in this PR
cd backend
uv run python scripts/seed_live_data.py
```

## What `seed_live_data.py` inserts

The script mirrors `backend/app/mock_data.py` exactly so the UI looks identical whether you're in mock or live mode.

| Table | Rows | Description |
|---|---|---|
| `suppliers` | 5 | Maple Grain Co., Cheap-N-Late, Bulk Wheat, Prairie Berry, New Harvest |
| `supplier_orders` | 6 | Mix of confirmed / in-transit / pending POs |
| `waste_events` | 10 | Append-only audit log — avoided and non-avoided events |
| `disruption_signals` | 2 | Weather disruption + delivery miss |
| `esg_waste_counter` | 1 | 90-day aggregated ESG totals |

Ingredient lots are handled by `make schema.seed` / `infra/seed_lots.py` (150+ rows with realistic expiry curves).

## Running the seed script manually

```bash
cd backend
uv run python scripts/seed_live_data.py
```

The script is **idempotent** — it uses `INSERT ... ON CONFLICT DO NOTHING` so it is safe to run multiple times. It reads `DATABASE_URL` from the environment (or `.env`).

### Environment variables

```bash
# .env (copy from .env.example)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bakerypilot
```

## Adding your own seed data

All seed data lives in `backend/app/mock_data.py`. To add more rows:

1. Edit the relevant list in `mock_data.py` (e.g. `SUPPLIER_ORDERS`, `WASTE_EVENTS`).
2. Run the sync script to push them into the DB:
   ```bash
   cd backend && uv run python scripts/seed_live_data.py
   ```

## Schema reference

Key tables and their insert order (FK dependencies):

```
suppliers
  └── supplier_orders        (supplier_id FK)
  └── moq_tax_ledger         (supplier_id FK)

ingredient_lots              (no FK — standalone)
  └── waste_events           (lot_id soft-reference)

disruption_signals           (supplier_id nullable FK)
```

Full schema: `infra/supabase/schema.sql`
