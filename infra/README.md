# BakeryPilot — Database

Everything you need to stand up the local Postgres, apply the schema, and load seed data.

The source of truth is [`supabase/schema.sql`](supabase/schema.sql); this file documents how to use it and what's inside. Schema-change rules (additive vs. breaking) live in [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## System requirements

| Tool | Version | Why |
| :--- | :--- | :--- |
| **Docker** + **Docker Compose** | Docker 24+, Compose v2 | Runs postgres + redis locally; the `docker compose` CLI (space, not hyphen) is required |
| **GNU Make** | any recent | All commands below are `make` targets defined in [`../Makefile`](../Makefile) |
| **Python** | 3.11+ | Needed only to run `seed_lots.py`. Skip if you don't need ingredient lots |
| **uv** | latest ([install](https://github.com/astral-sh/uv)) | `seed_lots.py` is a PEP 723 inline-deps script — `uv run` resolves Faker + psycopg automatically; no `uv sync` step required |

Nothing else (no local Postgres install, no `psql` on the host — we exec into the container).

Mac users can `brew install docker docker-compose make uv` (Python 3.11 ships via uv's `--python` if missing).

---

## Creating the database

### Fresh install (clean machine)

```bash
cp .env.example .env       # first time only; ANTHROPIC_API_KEY can be empty for DB-only work
make up                    # docker compose up -d --wait postgres redis
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

```bash
make reset                 # docker compose down -v — wipes the volume
make up                    # auto-init fires again on the empty volume
uv run infra/seed_lots.py  # re-generate lots
```

### Useful Make targets

| Target | What it does |
| :--- | :--- |
| `make up` | Start postgres + redis, wait for healthcheck |
| `make down` | Stop containers (data preserved in volume) |
| `make reset` | Stop **and wipe** volumes — destructive |
| `make schema.migrate` | Apply `schema.sql` against the running container |
| `make schema.seed` | Apply `seed.sql` and run `seed_lots.py` |
| `make seed.lots` | Run `seed_lots.py` only |
| `make db.psql` | Open psql shell inside the postgres container |
| `make db.status` | Print row counts for every seeded table |

---

## Tables (17 total)

Extensions enabled by `schema.sql`: `pgcrypto` (for `gen_random_uuid()`) and `vector` (pgvector, for Module 7's RAG layer).

### Master data

#### `facilities` — 4 FGF plants
| column | type | notes |
| :--- | :--- | :--- |
| `facility_id` | text | PK |
| `name` | text | NOT NULL |
| `city` | text | |
| `province` | text | |
| `timezone` | text | NOT NULL, default `America/Toronto` |
| `cold_capacity_kg` | numeric | |
| `dry_capacity_kg` | numeric | |

#### `ingredients` — 92 USDA-curated rows from [`data/ingredients.csv`](data/ingredients.csv)
| column | type | notes |
| :--- | :--- | :--- |
| `ingredient_id` | text | PK |
| `name` | text | NOT NULL |
| `category` | text | indexed |
| `default_storage_zone` | text | NOT NULL, CHECK in (`frozen`, `refrigerated`, `dry`) |
| `shelf_life_days_default` | int | NOT NULL, > 0 |
| `allergen_tags` | text[] | NOT NULL, default `{}` |
| `unit_of_measure` | text | NOT NULL, default `kg` |

#### `skus` — 12 finished bakery products
| column | type | notes |
| :--- | :--- | :--- |
| `sku_id` | text | PK |
| `name` | text | NOT NULL |
| `category` | text | |
| `margin_per_unit` | numeric | NOT NULL, default 0 (substitution rank key) |
| `allergen_tags` | text[] | NOT NULL, default `{}` |
| `shelf_life_days` | int | NOT NULL, default 7 |

#### `production_lines` — 9 lines across the 4 plants
| column | type | notes |
| :--- | :--- | :--- |
| `line_id` | text | PK |
| `facility_id` | text | NOT NULL, FK → `facilities` |
| `name` | text | NOT NULL |
| `capacity_kg_per_hour` | numeric | NOT NULL, > 0 |
| `supported_allergen_tags` | text[] | NOT NULL, default `{}` |

#### `retailers` — Costco, Walmart, Loblaws, Whole Foods
| column | type | notes |
| :--- | :--- | :--- |
| `retailer_id` | text | PK |
| `name` | text | NOT NULL |
| `edi_endpoint` | text | |

#### `suppliers` — 5 suppliers, one per `personality_tag`
| column | type | notes |
| :--- | :--- | :--- |
| `supplier_id` | text | PK |
| `name` | text | NOT NULL |
| `contact_email` | text | |
| `payment_terms` | text | |
| `contract_expiry_date` | date | indexed |
| `personality_tag` | text | CHECK in (`reliable`, `cheap_late`, `high_moq`, `disrupted`, `new`) |

Phase 3 will ALTER-ADD MOQ / delivery-window / discount columns here (additive — no rename).

#### `warehouse_costs` — 12 rows (4 facilities × 3 zones)
| column | type | notes |
| :--- | :--- | :--- |
| `facility_id` | text | PK part, FK → `facilities` |
| `storage_type` | text | PK part, CHECK in (`frozen`, `refrigerated`, `dry`) |
| `cost_per_kg_per_day` | numeric | NOT NULL, ≥ 0 |
| `capacity_kg` | numeric | NOT NULL, > 0 |

#### `allergen_changeovers` — 27-entry matrix for the scheduler
| column | type | notes |
| :--- | :--- | :--- |
| `from_allergen` | text | PK part |
| `to_allergen` | text | PK part |
| `changeover_minutes` | int | NOT NULL, ≥ 0 |

### Transactional / time-series

#### `ingredient_lots` (F1.1) — 180 seeded by `seed_lots.py`; Module 1's source of truth
| column | type | notes |
| :--- | :--- | :--- |
| `lot_id` | uuid | PK, default `gen_random_uuid()` |
| `facility_id` | text | NOT NULL, FK → `facilities` |
| `ingredient_id` | text | NOT NULL, FK → `ingredients` |
| `supplier_id` | text | nullable, FK → `suppliers` |
| `quantity_kg` | numeric | NOT NULL, ≥ 0 |
| `received_date` | date | NOT NULL |
| `expiry_date` | date | NOT NULL |
| `storage_zone` | text | NOT NULL, CHECK in (`frozen`, `refrigerated`, `dry`) |
| `unit_cost` | numeric | |
| `lot_code` | text | |

#### `production_formulas` (F2.1) — bill of materials
| column | type | notes |
| :--- | :--- | :--- |
| `sku_id` | text | PK part, FK → `skus` |
| `ingredient_id` | text | PK part, FK → `ingredients` |
| `kg_per_unit` | numeric | NOT NULL, > 0 |

#### `production_schedules` (F2.2) — suggested + approved + complete
| column | type | notes |
| :--- | :--- | :--- |
| `schedule_id` | uuid | PK, default `gen_random_uuid()` |
| `version` | int | NOT NULL, default 1 |
| `facility_id` | text | NOT NULL, FK → `facilities` |
| `line_id` | text | NOT NULL, FK → `production_lines` |
| `sku_id` | text | NOT NULL, FK → `skus` |
| `start_at` | timestamptz | NOT NULL |
| `end_at` | timestamptz | NOT NULL, CHECK > `start_at` |
| `quantity_units` | int | NOT NULL, > 0 |
| `status` | text | NOT NULL, CHECK in (`suggested`, `approved`, `complete`) |
| `waste_avoided_kg` | numeric | NOT NULL, default 0 |
| `action_card_id` | uuid | not yet FK — added when the card row exists |
| `created_at` | timestamptz | NOT NULL, default `now()` |

#### `retailer_orders` (F2.3) — 8 seeded POs
| column | type | notes |
| :--- | :--- | :--- |
| `retailer_order_id` | uuid | PK, default `gen_random_uuid()` |
| `retailer_id` | text | NOT NULL, FK → `retailers` |
| `sku_id` | text | NOT NULL, FK → `skus` |
| `quantity_units` | int | NOT NULL, > 0 |
| `requested_delivery_date` | date | NOT NULL, indexed |
| `received_at` | timestamptz | NOT NULL, default `now()` |
| `status` | text | NOT NULL, default `open`, CHECK in (`open`, `scheduled`, `shipped`, `cancelled`) |

#### `demand_forecasts` (F2.4)
| column | type | notes |
| :--- | :--- | :--- |
| `sku_id` | text | PK part, FK → `skus` |
| `forecast_date` | date | PK part, indexed |
| `quantity_expected` | numeric | NOT NULL |
| `quantity_low` | numeric | |
| `quantity_high` | numeric | |
| `model_version` | text | PK part |
| `generated_at` | timestamptz | NOT NULL, default `now()` |

#### `action_cards` (F1.5) — HITL confirm contract; payload schema in [`../shared/schemas/action_card.schema.json`](../shared/schemas/action_card.schema.json)
| column | type | notes |
| :--- | :--- | :--- |
| `card_id` | uuid | PK, default `gen_random_uuid()` |
| `kind` | text | NOT NULL (Phase 1 supports `supplier_order`) |
| `payload` | jsonb | NOT NULL — kind-specific body |
| `state` | text | NOT NULL, default `pending`, CHECK in (`pending`, `confirmed`, `rejected`) |
| `created_at` | timestamptz | NOT NULL, default `now()` |
| `decided_at` | timestamptz | |
| `decided_by` | text | |

#### `supplier_orders` (F1.4) — PO header
| column | type | notes |
| :--- | :--- | :--- |
| `order_id` | uuid | PK, default `gen_random_uuid()` |
| `supplier_id` | text | NOT NULL, FK → `suppliers` |
| `facility_id` | text | NOT NULL, FK → `facilities` |
| `status` | text | NOT NULL, default `draft`, CHECK in (`draft`, `pending_confirm`, `confirmed`, `sent`) |
| `created_at` | timestamptz | NOT NULL, default `now()` |
| `confirmed_at` | timestamptz | |
| `action_card_id` | uuid | FK → `action_cards` |
| `external_po_number` | text | returned by SAP mock |
| `delivery_date` | date | |

#### `supplier_order_items` (F1.4) — PO lines
| column | type | notes |
| :--- | :--- | :--- |
| `order_id` | uuid | PK part, FK → `supplier_orders` ON DELETE CASCADE |
| `ingredient_id` | text | PK part, FK → `ingredients` |
| `quantity_kg` | numeric | NOT NULL, > 0 |
| `unit_price` | numeric | NOT NULL, ≥ 0 |

### Audit (append-only)

#### `inventory_events` — guarded by `raise_append_only()` trigger; UPDATE/DELETE raises
| column | type | notes |
| :--- | :--- | :--- |
| `event_id` | uuid | PK, default `gen_random_uuid()` |
| `event_at` | timestamptz | NOT NULL, default `now()` |
| `kind` | text | NOT NULL, CHECK in (`consumption`, `receipt`, `transfer`, `adjustment`, `spoilage`) |
| `lot_id` | uuid | NOT NULL, FK → `ingredient_lots` |
| `delta_kg` | numeric | NOT NULL (negative = consumption, positive = receipt) |
| `source` | text | NOT NULL (e.g. `chat`, `mes`, `manual`) |
| `source_ref` | text | |
| `note` | text | |

Corrections must be **new rows with the opposite delta** — never UPDATE/DELETE (per NF.R.1, enforced by the trigger).

---

## Troubleshooting

**`make up` hangs / postgres healthcheck never goes green** — usually a stale container from a previous project on port 5432. Check with `docker ps` and `lsof -i :5432`.

**Schema changed in `schema.sql` but my DB doesn't reflect it** — the `/docker-entrypoint-initdb.d` mount only auto-runs on an *empty* volume. Run `make schema.migrate` to re-apply, or `make reset && make up` to wipe and re-init.

**`seed_lots.py` errors with `no ingredients found`** — `seed.sql` hasn't run yet. Use `make schema.seed` (it runs both).

**`UPDATE inventory_events ...` raises an exception** — that's the append-only trigger doing its job. Insert a new corrective row with the opposite `delta_kg` instead.
