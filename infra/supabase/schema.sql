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

-- Additive (post-Day-1): geographic coordinates + street address for FlowSight (F5.2).
-- Per CLAUDE.md schema-freeze policy: optional columns only, no edits to existing
-- columns. Populated by infra/seed_toronto_facilities.py.
ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS street_address text,
  ADD COLUMN IF NOT EXISTS postal_code    text,
  ADD COLUMN IF NOT EXISTS latitude       numeric,
  ADD COLUMN IF NOT EXISTS longitude      numeric;

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

-- ============================================================================
-- Phase 3 tables
-- ============================================================================

-- F3.1: Extend suppliers with MOQ / window / discount fields
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS moq_kg                      numeric,
  ADD COLUMN IF NOT EXISTS lead_time_mean_days         numeric,
  ADD COLUMN IF NOT EXISTS lead_time_std_days          numeric,
  ADD COLUMN IF NOT EXISTS window_earliest_day         int,
  ADD COLUMN IF NOT EXISTS window_latest_day           int,
  ADD COLUMN IF NOT EXISTS on_time_rate                numeric,
  ADD COLUMN IF NOT EXISTS fill_rate                   numeric,
  ADD COLUMN IF NOT EXISTS window_compliance_rate      numeric,
  ADD COLUMN IF NOT EXISTS price_variance_vs_benchmark numeric,
  ADD COLUMN IF NOT EXISTS discount_tiers              jsonb;

-- F3.2: dock_schedules
CREATE TABLE IF NOT EXISTS dock_schedules (
  facility_id          text NOT NULL REFERENCES facilities(facility_id),
  slot_date            date NOT NULL,
  slot_index           int  NOT NULL DEFAULT 0,
  booking_id           uuid,
  supplier_id          text REFERENCES suppliers(supplier_id),
  capacity_remaining_kg numeric NOT NULL DEFAULT 20000,
  PRIMARY KEY (facility_id, slot_date, slot_index)
);

CREATE INDEX IF NOT EXISTS dock_schedules_facility_date_idx ON dock_schedules (facility_id, slot_date);

-- F3.3: moq_tax_ledger (append-only)
CREATE TABLE IF NOT EXISTS moq_tax_ledger (
  ledger_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  text NOT NULL REFERENCES suppliers(supplier_id),
  quarter      text NOT NULL,
  overage_kg   numeric NOT NULL,
  holding_cost numeric NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moq_tax_ledger_supplier_quarter_idx ON moq_tax_ledger (supplier_id, quarter);

DROP TRIGGER IF EXISTS moq_tax_ledger_append_only ON moq_tax_ledger;
CREATE TRIGGER moq_tax_ledger_append_only
  BEFORE UPDATE OR DELETE ON moq_tax_ledger
  FOR EACH ROW EXECUTE FUNCTION raise_append_only();

-- F3.4: disruption_signals
CREATE TABLE IF NOT EXISTS disruption_signals (
  signal_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  text REFERENCES suppliers(supplier_id),
  ingredient_id text REFERENCES ingredients(ingredient_id),
  kind         text NOT NULL,
  severity     numeric NOT NULL CHECK (severity >= 0 AND severity <= 1),
  source       text NOT NULL,
  message      text NOT NULL,
  observed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disruption_signals_observed_at_idx ON disruption_signals (observed_at DESC);
CREATE INDEX IF NOT EXISTS disruption_signals_supplier_idx ON disruption_signals (supplier_id);

-- F3.5: negotiation_drafts
CREATE TABLE IF NOT EXISTS negotiation_drafts (
  draft_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id    text NOT NULL REFERENCES suppliers(supplier_id),
  trigger_kind   text NOT NULL,
  body_md        text NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','sent','discarded')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  sent_at        timestamptz,
  action_card_id uuid REFERENCES action_cards(card_id)
);

-- ============================================================================
-- Phase 4 tables
-- ============================================================================

-- F4.1: production_runs
CREATE TABLE IF NOT EXISTS production_runs (
  run_id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id                   uuid REFERENCES production_schedules(schedule_id),
  line_id                       text NOT NULL REFERENCES production_lines(line_id),
  facility_id                   text NOT NULL REFERENCES facilities(facility_id),
  sku_id                        text NOT NULL REFERENCES skus(sku_id),
  operator_id                   text,
  started_at                    timestamptz NOT NULL,
  ended_at                      timestamptz,
  planned_kg                    numeric,
  actual_kg                     numeric,
  actual_ingredient_consumption jsonb,
  status                        text NOT NULL DEFAULT 'in_progress',
  equipment_notes               text
);

CREATE INDEX IF NOT EXISTS production_runs_line_started_idx ON production_runs (line_id, started_at DESC);
CREATE INDEX IF NOT EXISTS production_runs_facility_idx ON production_runs (facility_id);

-- F4.2: waste_events (append-only)
CREATE TABLE IF NOT EXISTS waste_events (
  waste_event_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_at        timestamptz NOT NULL DEFAULT now(),
  kind            text NOT NULL CHECK (kind IN
                    ('spoilage','yield_loss','moq_overage','expired_pallet')),
  kg              numeric NOT NULL,
  dollar_value    numeric,
  co2e_kg         numeric,
  source_table    text,
  source_id       text,
  avoided         bool NOT NULL DEFAULT false,
  facility_id     text REFERENCES facilities(facility_id),
  ingredient_id   text REFERENCES ingredients(ingredient_id)
);

CREATE INDEX IF NOT EXISTS waste_events_at_kind_idx ON waste_events (event_at, kind);

DROP TRIGGER IF EXISTS waste_events_append_only ON waste_events;
CREATE TRIGGER waste_events_append_only
  BEFORE UPDATE OR DELETE ON waste_events
  FOR EACH ROW EXECUTE FUNCTION raise_append_only();

-- F4.3: finished_goods_pallets
CREATE TABLE IF NOT EXISTS finished_goods_pallets (
  pallet_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id              text NOT NULL REFERENCES skus(sku_id),
  facility_id         text NOT NULL REFERENCES facilities(facility_id),
  produced_at         timestamptz NOT NULL DEFAULT now(),
  shelf_life_days     int NOT NULL,
  quantity            int NOT NULL CHECK (quantity > 0),
  status              text NOT NULL DEFAULT 'in_warehouse'
                      CHECK (status IN ('in_warehouse','shipped','donated','written_off')),
  committed_order_id  uuid
);

CREATE INDEX IF NOT EXISTS finished_goods_pallets_facility_status_idx ON finished_goods_pallets (facility_id, status);

-- ============================================================================
-- Non-functional / infrastructure tables
-- ============================================================================

-- NF.R.7: stakeholders directory
CREATE TABLE IF NOT EXISTS stakeholders (
  stakeholder_id  text PRIMARY KEY,
  name            text NOT NULL,
  email           text NOT NULL,
  role            text NOT NULL,
  organization    text,
  tags            text[] NOT NULL DEFAULT '{}'
);

-- NF.R.6: notification_drafts audit (append-only)
CREATE TABLE IF NOT EXISTS notification_drafts (
  draft_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL,
  recipients      text[] NOT NULL DEFAULT '{}',
  subject         text NOT NULL,
  body_md         text NOT NULL,
  gmail_draft_url text,
  action_card_id  uuid REFERENCES action_cards(card_id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_drafts_created_idx ON notification_drafts (created_at DESC);

DROP TRIGGER IF EXISTS notification_drafts_append_only ON notification_drafts;
CREATE TRIGGER notification_drafts_append_only
  BEFORE UPDATE OR DELETE ON notification_drafts
  FOR EACH ROW EXECUTE FUNCTION raise_append_only();

-- NF.O.4: weekly_summaries (append-only)
CREATE TABLE IF NOT EXISTS weekly_summaries (
  summary_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start      date NOT NULL UNIQUE,
  week_end        date NOT NULL,
  stats           jsonb NOT NULL,
  narration_md    text,
  gmail_draft_url text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS weekly_summaries_week_start_idx ON weekly_summaries (week_start DESC);

DROP TRIGGER IF EXISTS weekly_summaries_append_only ON weekly_summaries;
CREATE TRIGGER weekly_summaries_append_only
  BEFORE UPDATE OR DELETE ON weekly_summaries
  FOR EACH ROW EXECUTE FUNCTION raise_append_only();

-- ============================================================================
-- Application user & per-user settings (additive, post v2 frontend pass)
--
-- Backs the Shell user menu, Settings profile fields, and the persisted
-- theme / accent / notification preferences. Single-user demo data — the
-- hackathon build has no auth. The new routers in backend/app/api/users.py
-- gracefully fall back to a built-in default if either table is empty,
-- so older databases without this migration continue to work.
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_users (
  user_id              text PRIMARY KEY,
  display_name         text NOT NULL,
  role                 text NOT NULL,
  email                text NOT NULL,
  default_facility_id  text REFERENCES facilities(facility_id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id              text PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
  theme                text NOT NULL DEFAULT 'light'
                       CHECK (theme IN ('dark','light')),
  accent               text NOT NULL DEFAULT 'blue'
                       CHECK (accent IN ('blue','emerald','violet','amber','teal','indigo')),
  notif_toast          bool NOT NULL DEFAULT true,
  notif_auto_dismiss   bool NOT NULL DEFAULT true,
  notif_expiring_lots  bool NOT NULL DEFAULT true,
  notif_supplier_risk  bool NOT NULL DEFAULT true,
  notif_yield_anomaly  bool NOT NULL DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Production module (additive, post-hackathon)
-- Adds manual production order tracking with inventory integration.
-- Schema-freeze policy: only ALTER ADD COLUMN IF NOT EXISTS + new tables.
-- ============================================================================

-- Add line status and active-order pointer to production_lines.
-- DEFAULT 'idle' applies cleanly to all existing rows.
ALTER TABLE production_lines
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle','setup','producing','paused','maintenance')),
  ADD COLUMN IF NOT EXISTS current_order_id uuid;

-- Production orders: one order per active line assignment.
CREATE TABLE IF NOT EXISTS production_orders (
  order_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id      text NOT NULL REFERENCES facilities(facility_id),
  line_id          text NOT NULL REFERENCES production_lines(line_id),
  sku_id           text NOT NULL REFERENCES skus(sku_id),
  quantity_units   int  NOT NULL CHECK (quantity_units > 0),
  status           text NOT NULL DEFAULT 'planned'
                   CHECK (status IN ('planned','producing','paused','produced','cancelled')),
  planned_start_at timestamptz,
  actual_start_at  timestamptz,
  completed_at     timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS production_orders_facility_status_idx
  ON production_orders (facility_id, status);

CREATE INDEX IF NOT EXISTS production_orders_line_idx
  ON production_orders (line_id);

-- ============================================================================
-- Supplier engagement (additive, post v3)
-- ============================================================================

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS phone        text,
  ADD COLUMN IF NOT EXISTS website      text,
  ADD COLUMN IF NOT EXISTS address      text,
  ADD COLUMN IF NOT EXISTS notes        text;

CREATE TABLE IF NOT EXISTS supplier_messages (
  message_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  text NOT NULL REFERENCES suppliers(supplier_id) ON DELETE CASCADE,
  direction    text NOT NULL CHECK (direction IN ('inbound','outbound')),
  channel      text NOT NULL DEFAULT 'email'
               CHECK (channel IN ('email','phone','chat','agent','system')),
  subject      text,
  body         text NOT NULL,
  author       text,
  related_order_id uuid REFERENCES supplier_orders(order_id) ON DELETE SET NULL,
  related_negotiation_id uuid REFERENCES negotiation_drafts(draft_id) ON DELETE SET NULL,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz
);

CREATE INDEX IF NOT EXISTS supplier_messages_supplier_sent_idx
  ON supplier_messages (supplier_id, sent_at DESC);
