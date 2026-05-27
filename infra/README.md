# BakeryPilot — Data Stores

Everything you need to stand up the local data layer: **Postgres** (relational state + pgvector for RAG), **MongoDB** (agent prompt hot-reload store), and **Redis** (event stream — no persistent state worth documenting here).

Sources of truth:

- Postgres schema → `[supabase/schema.sql](supabase/schema.sql)`
- Postgres seed → `[supabase/seed.sql](supabase/seed.sql)` + `[seed_lots.py](seed_lots.py)`
- MongoDB collection → seeded by `[../agent/agent/prompts/seed.py](../agent/agent/prompts/seed.py)` from the `.md` files in `[../agent/agent/prompts/](../agent/agent/prompts/)`

Schema-change rules (additive vs. breaking) live in `[../CONTRIBUTING.md](../CONTRIBUTING.md)`.

---

## System requirements


| Tool                            | Version                                             | Why                                                                                                                          |
| ------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Docker** + **Docker Compose** | Docker 24+, Compose v2                              | Runs postgres + redis + mongo locally; the `docker compose` CLI (space, not hyphen) is required                              |
| **GNU Make**                    | any recent                                          | All commands below are `make` targets defined in `[../Makefile](../Makefile)`                                                |
| **Python**                      | 3.11+                                               | Needed for `seed_lots.py` and the MongoDB prompt seeder                                                                      |
| **uv**                          | latest ([install](https://github.com/astral-sh/uv)) | `seed_lots.py` is a PEP 723 inline-deps script — `uv run` resolves Faker + psycopg automatically. For the Mongo seeder run `make agent.install` first (pymongo lives in `agent/pyproject.toml`) |


Nothing else (no local Postgres install, no `psql` on the host — we exec into the container).

Mac users can `brew install docker docker-compose make uv` (Python 3.11 ships via uv's `--python` if missing).

---

## Creating the database (Postgres)

> For the MongoDB prompt store, jump to [§ MongoDB — prompt store](#mongodb--prompt-store).

### Fresh install (clean machine)

```bash
cp .env.example .env       # first time only; ANTHROPIC_API_KEY can be empty for DB-only work
make up                    # docker compose up -d --wait postgres redis
                           # NOTE: this does NOT start mongo — see the MongoDB section below
```

On a **fresh volume**, Postgres auto-applies everything in `infra/supabase/` (mounted at `/docker-entrypoint-initdb.d`) in alphabetical order on first boot:

1. `schema.sql` — extensions, functions, all 17 tables, indexes, triggers
2. `seed.sql` — facilities, suppliers, ingredients, SKUs, lines, retailers, warehouse costs, allergen matrix, retailer POs, production formulas

Then run the lots generator separately (it needs Python, not just Postgres):

```bash
uv run infra/seed_lots.py  # 180 ingredient lots, deterministic via FAKER_SEED=42
```

Verify:

```bash
make db.status             # row counts per table
make db.psql               # interactive psql shell inside the container
```

### Re-applying on an existing volume

The auto-init only runs once per volume. If your container already has data and you want to re-apply schema or seed changes:

```bash
make schema.migrate        # re-runs schema.sql (CREATE TABLE IF NOT EXISTS — safe)
make schema.seed           # re-runs seed.sql (ON CONFLICT DO NOTHING) + seed_lots.py
```

These are idempotent — safe to run repeatedly.

### Nuke and start over (destructive)

`make reset` runs `docker compose down -v` which removes **every** volume in the compose file — postgres, redis, **and mongo**. After a reset you have to re-seed Mongo too.

```bash
make reset                                              # wipes ALL volumes
make up                                                 # postgres auto-init fires again
uv run infra/seed_lots.py                               # re-generate lots
docker compose up -d mongo                              # bring mongo back
cd agent && uv run python -m agent.prompts.seed         # re-seed the prompts collection
```

### Useful Make targets


| Target                | What it does                                                         |
| --------------------- | -------------------------------------------------------------------- |
| `make up`             | Start postgres + redis, wait for healthcheck (does **not** start mongo) |
| `make up.full`        | Start every service in the `full` profile + the defaults (postgres + redis + mongo + backend + agent + frontend) |
| `make down`           | Stop containers (data preserved in volumes)                          |
| `make reset`          | Stop **and wipe all volumes** — destructive (drops mongo data too)   |
| `make schema.migrate` | Apply `schema.sql` against the running postgres container            |
| `make schema.seed`    | Apply `seed.sql` and run `seed_lots.py`                              |
| `make seed.lots`      | Run `seed_lots.py` only                                              |
| `make db.psql`        | Open psql shell inside the postgres container                        |
| `make db.status`      | Print row counts for every seeded postgres table                     |

Mongo has no dedicated Make targets yet — use `docker compose up -d mongo` to start it and the snippets in [§ MongoDB — prompt store](#mongodb--prompt-store) to seed / inspect / edit.


---

## Postgres tables (17 total)

Extensions enabled by `schema.sql`: `pgcrypto` (for `gen_random_uuid()`) and `vector` (pgvector, for Module 7's RAG layer).

### Master data

#### `facilities` — 4 FGF plants


| column             | type    | notes                               |
| ------------------ | ------- | ----------------------------------- |
| `facility_id`      | text    | PK                                  |
| `name`             | text    | NOT NULL                            |
| `city`             | text    |                                     |
| `province`         | text    |                                     |
| `timezone`         | text    | NOT NULL, default `America/Toronto` |
| `cold_capacity_kg` | numeric |                                     |
| `dry_capacity_kg`  | numeric |                                     |


#### `ingredients` — 92 USDA-curated rows from `[data/ingredients.csv](data/ingredients.csv)`


| column                    | type   | notes                                                |
| ------------------------- | ------ | ---------------------------------------------------- |
| `ingredient_id`           | text   | PK                                                   |
| `name`                    | text   | NOT NULL                                             |
| `category`                | text   | indexed                                              |
| `default_storage_zone`    | text   | NOT NULL, CHECK in (`frozen`, `refrigerated`, `dry`) |
| `shelf_life_days_default` | int    | NOT NULL, > 0                                        |
| `allergen_tags`           | text[] | NOT NULL, default `{}`                               |
| `unit_of_measure`         | text   | NOT NULL, default `kg`                               |


#### `skus` — 12 finished bakery products


| column            | type    | notes                                       |
| ----------------- | ------- | ------------------------------------------- |
| `sku_id`          | text    | PK                                          |
| `name`            | text    | NOT NULL                                    |
| `category`        | text    |                                             |
| `margin_per_unit` | numeric | NOT NULL, default 0 (substitution rank key) |
| `allergen_tags`   | text[]  | NOT NULL, default `{}`                      |
| `shelf_life_days` | int     | NOT NULL, default 7                         |


#### `production_lines` — 9 lines across the 4 plants


| column                    | type    | notes                       |
| ------------------------- | ------- | --------------------------- |
| `line_id`                 | text    | PK                          |
| `facility_id`             | text    | NOT NULL, FK → `facilities` |
| `name`                    | text    | NOT NULL                    |
| `capacity_kg_per_hour`    | numeric | NOT NULL, > 0               |
| `supported_allergen_tags` | text[]  | NOT NULL, default `{}`      |


#### `retailers` — Costco, Walmart, Loblaws, Whole Foods


| column         | type | notes    |
| -------------- | ---- | -------- |
| `retailer_id`  | text | PK       |
| `name`         | text | NOT NULL |
| `edi_endpoint` | text |          |


#### `suppliers` — 5 suppliers, one per `personality_tag`


| column                 | type | notes                                                               |
| ---------------------- | ---- | ------------------------------------------------------------------- |
| `supplier_id`          | text | PK                                                                  |
| `name`                 | text | NOT NULL                                                            |
| `contact_email`        | text |                                                                     |
| `payment_terms`        | text |                                                                     |
| `contract_expiry_date` | date | indexed                                                             |
| `personality_tag`      | text | CHECK in (`reliable`, `cheap_late`, `high_moq`, `disrupted`, `new`) |


Phase 3 will ALTER-ADD MOQ / delivery-window / discount columns here (additive — no rename).

#### `warehouse_costs` — 12 rows (4 facilities × 3 zones)


| column                | type    | notes                                               |
| --------------------- | ------- | --------------------------------------------------- |
| `facility_id`         | text    | PK part, FK → `facilities`                          |
| `storage_type`        | text    | PK part, CHECK in (`frozen`, `refrigerated`, `dry`) |
| `cost_per_kg_per_day` | numeric | NOT NULL, ≥ 0                                       |
| `capacity_kg`         | numeric | NOT NULL, > 0                                       |


#### `allergen_changeovers` — 27-entry matrix for the scheduler


| column               | type | notes         |
| -------------------- | ---- | ------------- |
| `from_allergen`      | text | PK part       |
| `to_allergen`        | text | PK part       |
| `changeover_minutes` | int  | NOT NULL, ≥ 0 |


### Transactional / time-series

#### `ingredient_lots` (F1.1) — 180 seeded by `seed_lots.py`; Module 1's source of truth


| column          | type    | notes                                                |
| --------------- | ------- | ---------------------------------------------------- |
| `lot_id`        | uuid    | PK, default `gen_random_uuid()`                      |
| `facility_id`   | text    | NOT NULL, FK → `facilities`                          |
| `ingredient_id` | text    | NOT NULL, FK → `ingredients`                         |
| `supplier_id`   | text    | nullable, FK → `suppliers`                           |
| `quantity_kg`   | numeric | NOT NULL, ≥ 0                                        |
| `received_date` | date    | NOT NULL                                             |
| `expiry_date`   | date    | NOT NULL                                             |
| `storage_zone`  | text    | NOT NULL, CHECK in (`frozen`, `refrigerated`, `dry`) |
| `unit_cost`     | numeric |                                                      |
| `lot_code`      | text    |                                                      |


#### `production_formulas` (F2.1) — bill of materials


| column          | type    | notes                       |
| --------------- | ------- | --------------------------- |
| `sku_id`        | text    | PK part, FK → `skus`        |
| `ingredient_id` | text    | PK part, FK → `ingredients` |
| `kg_per_unit`   | numeric | NOT NULL, > 0               |


#### `production_schedules` (F2.2) — suggested + approved + complete


| column             | type        | notes                                                    |
| ------------------ | ----------- | -------------------------------------------------------- |
| `schedule_id`      | uuid        | PK, default `gen_random_uuid()`                          |
| `version`          | int         | NOT NULL, default 1                                      |
| `facility_id`      | text        | NOT NULL, FK → `facilities`                              |
| `line_id`          | text        | NOT NULL, FK → `production_lines`                        |
| `sku_id`           | text        | NOT NULL, FK → `skus`                                    |
| `start_at`         | timestamptz | NOT NULL                                                 |
| `end_at`           | timestamptz | NOT NULL, CHECK > `start_at`                             |
| `quantity_units`   | int         | NOT NULL, > 0                                            |
| `status`           | text        | NOT NULL, CHECK in (`suggested`, `approved`, `complete`) |
| `waste_avoided_kg` | numeric     | NOT NULL, default 0                                      |
| `action_card_id`   | uuid        | not yet FK — added when the card row exists              |
| `created_at`       | timestamptz | NOT NULL, default `now()`                                |


#### `retailer_orders` (F2.3) — 8 seeded POs


| column                    | type        | notes                                                                            |
| ------------------------- | ----------- | -------------------------------------------------------------------------------- |
| `retailer_order_id`       | uuid        | PK, default `gen_random_uuid()`                                                  |
| `retailer_id`             | text        | NOT NULL, FK → `retailers`                                                       |
| `sku_id`                  | text        | NOT NULL, FK → `skus`                                                            |
| `quantity_units`          | int         | NOT NULL, > 0                                                                    |
| `requested_delivery_date` | date        | NOT NULL, indexed                                                                |
| `received_at`             | timestamptz | NOT NULL, default `now()`                                                        |
| `status`                  | text        | NOT NULL, default `open`, CHECK in (`open`, `scheduled`, `shipped`, `cancelled`) |


#### `demand_forecasts` (F2.4)


| column              | type        | notes                     |
| ------------------- | ----------- | ------------------------- |
| `sku_id`            | text        | PK part, FK → `skus`      |
| `forecast_date`     | date        | PK part, indexed          |
| `quantity_expected` | numeric     | NOT NULL                  |
| `quantity_low`      | numeric     |                           |
| `quantity_high`     | numeric     |                           |
| `model_version`     | text        | PK part                   |
| `generated_at`      | timestamptz | NOT NULL, default `now()` |


#### `action_cards` (F1.5) — HITL confirm contract; payload schema in `[../shared/schemas/action_card.schema.json](../shared/schemas/action_card.schema.json)`


| column       | type        | notes                                                                      |
| ------------ | ----------- | -------------------------------------------------------------------------- |
| `card_id`    | uuid        | PK, default `gen_random_uuid()`                                            |
| `kind`       | text        | NOT NULL (Phase 1 supports `supplier_order`)                               |
| `payload`    | jsonb       | NOT NULL — kind-specific body                                              |
| `state`      | text        | NOT NULL, default `pending`, CHECK in (`pending`, `confirmed`, `rejected`) |
| `created_at` | timestamptz | NOT NULL, default `now()`                                                  |
| `decided_at` | timestamptz |                                                                            |
| `decided_by` | text        |                                                                            |


#### `supplier_orders` (F1.4) — PO header


| column               | type        | notes                                                                                 |
| -------------------- | ----------- | ------------------------------------------------------------------------------------- |
| `order_id`           | uuid        | PK, default `gen_random_uuid()`                                                       |
| `supplier_id`        | text        | NOT NULL, FK → `suppliers`                                                            |
| `facility_id`        | text        | NOT NULL, FK → `facilities`                                                           |
| `status`             | text        | NOT NULL, default `draft`, CHECK in (`draft`, `pending_confirm`, `confirmed`, `sent`) |
| `created_at`         | timestamptz | NOT NULL, default `now()`                                                             |
| `confirmed_at`       | timestamptz |                                                                                       |
| `action_card_id`     | uuid        | FK → `action_cards`                                                                   |
| `external_po_number` | text        | returned by SAP mock                                                                  |
| `delivery_date`      | date        |                                                                                       |


#### `supplier_order_items` (F1.4) — PO lines


| column          | type    | notes                                             |
| --------------- | ------- | ------------------------------------------------- |
| `order_id`      | uuid    | PK part, FK → `supplier_orders` ON DELETE CASCADE |
| `ingredient_id` | text    | PK part, FK → `ingredients`                       |
| `quantity_kg`   | numeric | NOT NULL, > 0                                     |
| `unit_price`    | numeric | NOT NULL, ≥ 0                                     |


### Audit (append-only)

#### `inventory_events` — guarded by `raise_append_only()` trigger; UPDATE/DELETE raises


| column       | type        | notes                                                                               |
| ------------ | ----------- | ----------------------------------------------------------------------------------- |
| `event_id`   | uuid        | PK, default `gen_random_uuid()`                                                     |
| `event_at`   | timestamptz | NOT NULL, default `now()`                                                           |
| `kind`       | text        | NOT NULL, CHECK in (`consumption`, `receipt`, `transfer`, `adjustment`, `spoilage`) |
| `lot_id`     | uuid        | NOT NULL, FK → `ingredient_lots`                                                    |
| `delta_kg`   | numeric     | NOT NULL (negative = consumption, positive = receipt)                               |
| `source`     | text        | NOT NULL (e.g. `chat`, `mes`, `manual`)                                             |
| `source_ref` | text        |                                                                                     |
| `note`       | text        |                                                                                     |


Corrections must be **new rows with the opposite delta** — never UPDATE/DELETE (per NF.R.1, enforced by the trigger).

---

## Querying the data

Open a psql shell with `make db.psql` (or use any client pointed at `postgresql://bakery:bakery@localhost:5432/bakery`). All queries below are verified against the seeded data.

### Sanity check — row counts

```sql
SELECT 'facilities' AS table, count(*) FROM facilities
UNION ALL SELECT 'suppliers',           count(*) FROM suppliers
UNION ALL SELECT 'ingredients',         count(*) FROM ingredients
UNION ALL SELECT 'skus',                count(*) FROM skus
UNION ALL SELECT 'production_formulas', count(*) FROM production_formulas
UNION ALL SELECT 'ingredient_lots',     count(*) FROM ingredient_lots;
```

Expected: 4 / 5 / 92 / 12 / 64 / 180. The full version is wired up as `make db.status`.

### List the 4 plants

```sql
SELECT facility_id, name, city, province, cold_capacity_kg, dry_capacity_kg
FROM facilities ORDER BY facility_id;
```

### Suppliers grouped by personality

```sql
SELECT supplier_id, name, personality_tag, contract_expiry_date
FROM suppliers ORDER BY personality_tag;
```

Returns one supplier per personality: `reliable` (NorthGrain), `cheap_late` (Valley Dairy), `high_moq` (Prairie Bulk Sugar), `disrupted` (Coastal Berry), `new` (New Leaf).

### Red / expired lots (drives the `/materials` red badges)

```sql
SELECT l.lot_code, i.name AS ingredient, l.facility_id,
       l.quantity_kg, l.expiry_date,
       (l.expiry_date - CURRENT_DATE) AS days_left
FROM ingredient_lots l
JOIN ingredients i USING (ingredient_id)
WHERE l.expiry_date < CURRENT_DATE + INTERVAL '3 days'
ORDER BY l.expiry_date;
```

By design (F1.7), the seed always includes ≥5 lots with `days_left < 3` and 3 lots already past expiry.

### Bill of materials for one SKU

```sql
SELECT s.name AS sku, i.name AS ingredient, f.kg_per_unit
FROM production_formulas f
JOIN skus s USING (sku_id)
JOIN ingredients i USING (ingredient_id)
WHERE s.sku_id = 'sku-ace-baguette-classic'
ORDER BY f.kg_per_unit DESC;
```

### Warehouse cost matrix (4 facilities × 3 zones)

```sql
SELECT f.name AS facility, w.storage_type, w.cost_per_kg_per_day, w.capacity_kg
FROM warehouse_costs w
JOIN facilities f USING (facility_id)
ORDER BY facility, storage_type;
```

### Open retailer POs

```sql
SELECT r.name AS retailer, s.name AS sku,
       o.quantity_units, o.requested_delivery_date, o.status
FROM retailer_orders o
JOIN retailers r USING (retailer_id)
JOIN skus s       USING (sku_id)
ORDER BY requested_delivery_date;
```

### Top 10 ingredients by stock on hand

```sql
SELECT i.name AS ingredient,
       COUNT(*)                          AS lots,
       ROUND(SUM(l.quantity_kg)::numeric, 1) AS total_kg
FROM ingredient_lots l
JOIN ingredients i USING (ingredient_id)
GROUP BY i.name
ORDER BY total_kg DESC
LIMIT 10;
```

### Allergen changeover lookup (for the scheduler)

```sql
SELECT from_allergen, to_allergen, changeover_minutes
FROM allergen_changeovers
WHERE from_allergen = 'peanut'
ORDER BY changeover_minutes DESC;
```

### JSONB query against `action_cards`

The `payload` column is `jsonb`, indexable with GIN. Once the agent has emitted cards:

```sql
-- All pending supplier_order cards for a specific facility
SELECT card_id, payload->>'supplier_id' AS supplier, payload->'landed_cost'->>'total' AS total
FROM action_cards
WHERE state = 'pending'
  AND kind = 'supplier_order'
  AND payload->>'facility_id' = 'plant-toronto';
```

### Append-only audit pattern (verified)

Write a consumption event:

```sql
INSERT INTO inventory_events (kind, lot_id, delta_kg, source, note)
SELECT 'consumption', lot_id, -12.5, 'demo', 'README example'
FROM ingredient_lots ORDER BY received_date DESC LIMIT 1
RETURNING event_id, kind, delta_kg;
```

Try to DELETE — the trigger raises (this is the NF.R.1 guarantee):

```sql
DELETE FROM inventory_events;
-- ERROR:  Table inventory_events is append-only;
--         INSERT new rows for corrections instead of DELETE on row.
```

Correct by inserting an offsetting row instead of UPDATE/DELETE:

```sql
INSERT INTO inventory_events (kind, lot_id, delta_kg, source, source_ref, note)
SELECT 'adjustment', lot_id, 12.5, 'demo', event_id::text, 'reverse README example'
FROM inventory_events
WHERE source = 'demo' AND kind = 'consumption';

-- Net per lot is now zero, but both rows remain for audit
SELECT lot_id, SUM(delta_kg) AS net_kg
FROM inventory_events WHERE source = 'demo' GROUP BY lot_id;
```

---

## MongoDB — prompt store

Added in commit `06534b2` (Alireza). It's the **hot-reload store for the agent's LLM prompts** — edit a document in Mongo and every running agent picks the change up within `PROMPT_CACHE_TTL_SECONDS` (default 60 s) without a restart. Tracked in `TASKS.md` as **AG.4** (store) and **AG.5** (seeder).

Reachable at `mongodb://localhost:27017`; database `bakery_pilot`. Env vars in [`../.env.example`](../.env.example):

```bash
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB=bakery_pilot
PROMPT_CACHE_TTL_SECONDS=60
```

### Collection: `prompts`

One document per LLM prompt the agent ships with. Schema (see `[../agent/agent/prompts/seed.py](../agent/agent/prompts/seed.py)`):


| field        | type            | notes                                                |
| ------------ | --------------- | ---------------------------------------------------- |
| `name`       | string          | logical key — matches the `.md` filename stem        |
| `body`       | string          | prompt text (markdown)                               |
| `version`    | int             | default 1; set on insert only (no auto-bump on edit) |
| `created_at` | datetime (UTC)  | insert-only                                          |
| `updated_at` | datetime (UTC)  | bumped on every upsert                               |


Seeded documents (one per `.md` file in `[../agent/agent/prompts/](../agent/agent/prompts/)`):


| name                | role                                                       |
| ------------------- | ---------------------------------------------------------- |
| `orchestrator`      | LangGraph orchestrator system prompt                       |
| `intent_classifier` | router prompt (which specialist agent gets the turn)       |
| `negotiation`       | Opus 4.7's negotiation-draft prompt                        |


### Fallback behavior

`agent/agent/prompts/store.py` pings Mongo on startup with a 2 s timeout. If unreachable, every `.get(name)` falls through to the local `.md` file on disk — the agent never crashes from a Mongo outage. So **running without Mongo is supported** for backend-only / DB-only work.

### Running and seeding

```bash
# 1. Start Mongo (not in `make up` — explicit)
docker compose up -d mongo

# 2. Install agent deps (pymongo lives in agent/pyproject.toml)
make agent.install

# 3. Seed the prompts collection from the .md files
cd agent && uv run python -m agent.prompts.seed
#   add --force to overwrite existing docs
```

### Inspecting

```bash
# List all prompt names, without dumping the bodies
docker compose exec mongo mongosh bakery_pilot \
  --eval 'db.prompts.find({}, {name: 1, version: 1, updated_at: 1}).pretty()'

# Read one prompt in full
docker compose exec mongo mongosh bakery_pilot \
  --eval 'db.prompts.findOne({name: "orchestrator"})'
```

### Live-edit (the whole point of this setup)

```bash
docker compose exec mongo mongosh bakery_pilot --eval '
  db.prompts.updateOne(
    {name: "orchestrator"},
    {$set: {body: "You are BakeryPilot. New tone test.", updated_at: new Date()}}
  )
'
# wait ≤ PROMPT_CACHE_TTL_SECONDS (default 60 s) — next agent turn uses the new body
```

### Known gaps

- **No healthcheck** on the `mongo` compose service (postgres + redis have one). Consider adding `mongosh --eval "db.adminCommand({ping:1})"`.
- **No `depends_on: mongo`** on the `agent` service. That's intentional given the file fallback, but it means in `make up.full` the agent may start before Mongo is ready and silently run in file-fallback mode for that process's lifetime.
- **No authentication.** Relies on localhost-only port binding. Do not expose `27017` to the network without enabling auth first.

---

## Troubleshooting

**`make up` hangs / postgres healthcheck never goes green** — usually a stale container from a previous project on port 5432. Check with `docker ps` and `lsof -i :5432`.

**Schema changed in `schema.sql` but my DB doesn't reflect it** — the `/docker-entrypoint-initdb.d` mount only auto-runs on an *empty* volume. Run `make schema.migrate` to re-apply, or `make reset && make up` to wipe and re-init.

**`seed_lots.py` errors with `no ingredients found`** — `seed.sql` hasn't run yet. Use `make schema.seed` (it runs both).

**`UPDATE inventory_events ...` raises an exception** — that's the append-only trigger doing its job. Insert a new corrective row with the opposite `delta_kg` instead.

**Agent always logs "loaded prompt from file"** — Mongo is unreachable or the prompts collection is empty. Run `docker compose up -d mongo` and `cd agent && uv run python -m agent.prompts.seed`.

**Edited a prompt in Mongo but the agent still uses the old one** — wait up to `PROMPT_CACHE_TTL_SECONDS` seconds (default 60). To shorten the wait, lower the env var or restart the agent process.

**Port 27017 already in use** — likely a host-installed MongoDB. `brew services stop mongodb-community` or pick a different host port in `docker-compose.yml`.