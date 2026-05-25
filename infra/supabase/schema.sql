-- BakeryPilot full DB schema.
-- Append-only; never edit existing tables. Additive changes only after Day-1 lunch.
-- See README#database-schema and TASKS.md F1.1-F2.4 for table-by-table acceptance criteria.

-- ============================================================================
-- Extensions
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector for M2's RAG layer (Module 7)

-- ============================================================================
-- Reusable functions
-- ============================================================================

-- Append-only enforcement (NF.R.1). Attach via trigger to any audit table
-- where corrections must be new rows, never UPDATEs or DELETEs.
CREATE OR REPLACE FUNCTION raise_append_only()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; INSERT new rows for corrections instead of % on row.',
    TG_TABLE_NAME, TG_OP;
END;
$$;

-- ============================================================================
-- Master data — facilities, ingredients, SKUs, lines, retailers, suppliers
-- ============================================================================

-- F1.6: 4 FGF plants
CREATE TABLE IF NOT EXISTS facilities (
  facility_id        text PRIMARY KEY,
  name               text NOT NULL,
  city               text,
  province           text,
  timezone           text NOT NULL DEFAULT 'America/Toronto',
  cold_capacity_kg   numeric,
  dry_capacity_kg    numeric
);

-- Ingredient master (seeded from infra/data/ingredients.csv, USDA-informed)
CREATE TABLE IF NOT EXISTS ingredients (
  ingredient_id              text PRIMARY KEY,
  name                       text NOT NULL,
  category                   text,
  default_storage_zone       text NOT NULL CHECK (default_storage_zone IN ('frozen','refrigerated','dry')),
  shelf_life_days_default    int  NOT NULL CHECK (shelf_life_days_default > 0),
  allergen_tags              text[] NOT NULL DEFAULT '{}',
  unit_of_measure            text NOT NULL DEFAULT 'kg'
);

CREATE INDEX IF NOT EXISTS ingredients_category_idx ON ingredients (category);

-- Finished bakery products (SKUs)
CREATE TABLE IF NOT EXISTS skus (
  sku_id            text PRIMARY KEY,
  name              text NOT NULL,
  category          text,
  margin_per_unit   numeric NOT NULL DEFAULT 0,   -- F1.12 substitution ranks by this
  allergen_tags     text[] NOT NULL DEFAULT '{}',
  shelf_life_days   int  NOT NULL DEFAULT 7
);

-- Production lines per facility
CREATE TABLE IF NOT EXISTS production_lines (
  line_id                    text PRIMARY KEY,
  facility_id                text NOT NULL REFERENCES facilities(facility_id),
  name                       text NOT NULL,
  capacity_kg_per_hour       numeric NOT NULL CHECK (capacity_kg_per_hour > 0),
  supported_allergen_tags    text[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS production_lines_facility_idx ON production_lines (facility_id);

-- Retailers (F2.3 lookup)
CREATE TABLE IF NOT EXISTS retailers (
  retailer_id    text PRIMARY KEY,
  name           text NOT NULL,
  edi_endpoint   text
);

-- Suppliers (F1.2: Phase 1 columns only; F3.1 will ALTER-ADD MOQ/window/discount)
CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id            text PRIMARY KEY,
  name                   text NOT NULL,
  contact_email          text,
  payment_terms          text,
  contract_expiry_date   date,
  personality_tag        text CHECK (personality_tag IN
    ('reliable','cheap_late','high_moq','disrupted','new'))
);

CREATE INDEX IF NOT EXISTS suppliers_contract_expiry_idx ON suppliers (contract_expiry_date);

-- F1.3: warehouse_costs (composite PK)
CREATE TABLE IF NOT EXISTS warehouse_costs (
  facility_id            text NOT NULL REFERENCES facilities(facility_id),
  storage_type           text NOT NULL CHECK (storage_type IN ('frozen','refrigerated','dry')),
  cost_per_kg_per_day    numeric NOT NULL CHECK (cost_per_kg_per_day >= 0),
  capacity_kg            numeric NOT NULL CHECK (capacity_kg > 0),
  PRIMARY KEY (facility_id, storage_type)
);

-- F2.6: allergen changeover time matrix
CREATE TABLE IF NOT EXISTS allergen_changeovers (
  from_allergen        text NOT NULL,
  to_allergen          text NOT NULL,
  changeover_minutes   int NOT NULL CHECK (changeover_minutes >= 0),
  PRIMARY KEY (from_allergen, to_allergen)
);

-- ============================================================================
-- Transactional / time-series tables
-- ============================================================================

-- F1.1: ingredient_lots — Module 1's source of truth
CREATE TABLE IF NOT EXISTS ingredient_lots (
  lot_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id     text NOT NULL REFERENCES facilities(facility_id),
  ingredient_id   text NOT NULL REFERENCES ingredients(ingredient_id),
  supplier_id     text REFERENCES suppliers(supplier_id),
  quantity_kg     numeric NOT NULL CHECK (quantity_kg >= 0),
  received_date   date NOT NULL,
  expiry_date     date NOT NULL,
  storage_zone    text NOT NULL CHECK (storage_zone IN ('frozen','refrigerated','dry')),
  unit_cost       numeric,
  lot_code        text
);

CREATE INDEX IF NOT EXISTS ingredient_lots_facility_expiry_idx ON ingredient_lots (facility_id, expiry_date);
CREATE INDEX IF NOT EXISTS ingredient_lots_ingredient_expiry_idx ON ingredient_lots (ingredient_id, expiry_date);

-- F2.1: production_formulas (bill of materials)
CREATE TABLE IF NOT EXISTS production_formulas (
  sku_id          text NOT NULL REFERENCES skus(sku_id),
  ingredient_id   text NOT NULL REFERENCES ingredients(ingredient_id),
  kg_per_unit     numeric NOT NULL CHECK (kg_per_unit > 0),
  PRIMARY KEY (sku_id, ingredient_id)
);

-- F2.2: production_schedules (approved + suggested)
CREATE TABLE IF NOT EXISTS production_schedules (
  schedule_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version            int  NOT NULL DEFAULT 1,
  facility_id        text NOT NULL REFERENCES facilities(facility_id),
  line_id            text NOT NULL REFERENCES production_lines(line_id),
  sku_id             text NOT NULL REFERENCES skus(sku_id),
  start_at           timestamptz NOT NULL,
  end_at             timestamptz NOT NULL,
  quantity_units     int NOT NULL CHECK (quantity_units > 0),
  status             text NOT NULL CHECK (status IN ('suggested','approved','complete')),
  waste_avoided_kg   numeric NOT NULL DEFAULT 0,
  action_card_id     uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS production_schedules_facility_line_start_idx
  ON production_schedules (facility_id, line_id, start_at);
CREATE INDEX IF NOT EXISTS production_schedules_status_version_idx
  ON production_schedules (status, version);

-- F2.3: retailer_orders
CREATE TABLE IF NOT EXISTS retailer_orders (
  retailer_order_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id                text NOT NULL REFERENCES retailers(retailer_id),
  sku_id                     text NOT NULL REFERENCES skus(sku_id),
  quantity_units             int NOT NULL CHECK (quantity_units > 0),
  requested_delivery_date    date NOT NULL,
  received_at                timestamptz NOT NULL DEFAULT now(),
  status                     text NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open','scheduled','shipped','cancelled'))
);

CREATE INDEX IF NOT EXISTS retailer_orders_delivery_idx ON retailer_orders (requested_delivery_date);
CREATE INDEX IF NOT EXISTS retailer_orders_retailer_idx ON retailer_orders (retailer_id);

-- F2.4: demand_forecasts
CREATE TABLE IF NOT EXISTS demand_forecasts (
  sku_id              text NOT NULL REFERENCES skus(sku_id),
  forecast_date       date NOT NULL,
  quantity_expected   numeric NOT NULL,
  quantity_low        numeric,
  quantity_high       numeric,
  model_version       text NOT NULL,
  generated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sku_id, forecast_date, model_version)
);

CREATE INDEX IF NOT EXISTS demand_forecasts_date_idx ON demand_forecasts (forecast_date);

-- F1.5: action_cards — HITL audit trail
CREATE TABLE IF NOT EXISTS action_cards (
  card_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL,
  payload      jsonb NOT NULL,
  state        text NOT NULL DEFAULT 'pending'
               CHECK (state IN ('pending','confirmed','rejected')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz,
  decided_by   text
);

CREATE INDEX IF NOT EXISTS action_cards_state_created_idx ON action_cards (state, created_at);

-- F1.4: supplier_orders + items
CREATE TABLE IF NOT EXISTS supplier_orders (
  order_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id           text NOT NULL REFERENCES suppliers(supplier_id),
  facility_id           text NOT NULL REFERENCES facilities(facility_id),
  status                text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','pending_confirm','confirmed','sent')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  confirmed_at          timestamptz,
  action_card_id        uuid REFERENCES action_cards(card_id),
  external_po_number    text,
  delivery_date         date
);

CREATE INDEX IF NOT EXISTS supplier_orders_supplier_idx ON supplier_orders (supplier_id);
CREATE INDEX IF NOT EXISTS supplier_orders_status_idx ON supplier_orders (status);

CREATE TABLE IF NOT EXISTS supplier_order_items (
  order_id        uuid NOT NULL REFERENCES supplier_orders(order_id) ON DELETE CASCADE,
  ingredient_id   text NOT NULL REFERENCES ingredients(ingredient_id),
  quantity_kg     numeric NOT NULL CHECK (quantity_kg > 0),
  unit_price      numeric NOT NULL CHECK (unit_price >= 0),
  PRIMARY KEY (order_id, ingredient_id)
);

-- Append-only audit log (referenced by README + NF.R.1; not enumerated in F1.x but
-- required from MVP because the agent writes consumption events from chat).
CREATE TABLE IF NOT EXISTS inventory_events (
  event_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_at     timestamptz NOT NULL DEFAULT now(),
  kind         text NOT NULL CHECK (kind IN
                 ('consumption','receipt','transfer','adjustment','spoilage')),
  lot_id       uuid NOT NULL REFERENCES ingredient_lots(lot_id),
  delta_kg     numeric NOT NULL,
  source       text NOT NULL,
  source_ref   text,
  note         text
);

CREATE INDEX IF NOT EXISTS inventory_events_lot_at_idx ON inventory_events (lot_id, event_at);
CREATE INDEX IF NOT EXISTS inventory_events_at_idx     ON inventory_events (event_at DESC);

DROP TRIGGER IF EXISTS inventory_events_append_only ON inventory_events;
CREATE TRIGGER inventory_events_append_only
  BEFORE UPDATE OR DELETE ON inventory_events
  FOR EACH ROW EXECUTE FUNCTION raise_append_only();
