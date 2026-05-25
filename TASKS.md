# BakeryPilot -- Task List

> Atomic, owner-assigned tasks for the five-phase build. Each task is sized
> to fit in one PR / one day. Pair with the [README](README.md) for context.

## How to read this

- **IDs:** `F<phase>.<n>` for functional tasks, `NF.<category>.<n>` for non-functional.
- **Owners:** M1-M5 per the team breakdown in [README#team](README.md#team-5-members).
- **Files:** absolute repo paths -- skeleton already exists.
- **Acceptance:** what "done" means; PR can't merge without all boxes checked.
- Tasks are intentionally small. If a task feels bigger than a day, split it.
- Where a task has two owners (e.g. `[M3 + M2]`), the first is the driver, the second the reviewer.

---

# Functional tasks

## Phase 1 -- MVP

The walking skeleton: **chat -> tool -> action card -> confirm -> DB write**.
Every later phase layers on top of this path; if Phase 1 isn't green, nothing else demos.

### F1.1 [M3] Define `ingredient_lots` table

**What:** Add `ingredient_lots` to `infra/supabase/schema.sql` with: `lot_id` PK, `facility_id` FK, `ingredient_id` FK, `quantity_kg numeric`, `expiry_date date`, `storage_zone` (`'frozen'|'refrigerated'|'dry'`), `received_date date`, `supplier_id` FK nullable.
**Why:** Module 1's spoilage scoring and Module 4's procurement queries both treat this as the lot source of truth.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] `CREATE TABLE` applies cleanly against fresh postgres
- [ ] `CHECK` constraint on `storage_zone` values
- [ ] Indexes on `(facility_id, expiry_date)` and `(ingredient_id, expiry_date)`

### F1.2 [M3] Define `suppliers` table (Phase 1 columns only)

**What:** Create `suppliers` with `supplier_id` PK, `name`, `contact_email`, `payment_terms`, `contract_expiry_date date`. MOQ, delivery window, discount tier columns are deferred to Phase 3.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] Table created with PK and basic indexes
- [ ] At least 5 supplier rows insertable from seed.sql

### F1.3 [M3] Define `warehouse_costs` table

**What:** Composite PK `(facility_id, storage_type)`, columns `cost_per_kg_per_day numeric`, `capacity_kg numeric`.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] `CHECK` on `storage_type` values
- [ ] `capacity_kg > 0` enforced

### F1.4 [M3] Define `supplier_orders` + `supplier_order_items`

**What:** PO header (`order_id`, `supplier_id`, `status`, `created_at`, `confirmed_at nullable`, `action_card_id nullable`) and line items (`order_id` FK, `ingredient_id`, `quantity_kg`, `unit_price`).
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] FK from items to header with `ON DELETE CASCADE`
- [ ] Status enum: `draft / pending_confirm / confirmed / sent`

### F1.5 [M3] Define `action_cards` table

**What:** `card_id PK`, `kind`, `payload jsonb`, `state ('pending'|'confirmed'|'rejected')`, `created_at`, `decided_at`, `decided_by`. This table is the audit trail for every HITL decision.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] Every state-changing endpoint inserts an action_card and returns its id
- [ ] Index on `(state, created_at)` for pending-cards dashboard

### F1.6 [M3] Seed `facilities`, `suppliers`, `warehouse_costs`

**What:** Populate `infra/supabase/seed.sql` with 4 FGF plants, 5 supplier rows -- one per personality (reliable / cheap-but-late / high-MOQ / disrupted / new entrant) -- and 12 warehouse-cost rows (4 facilities x 3 storage types).
**Files:** `infra/supabase/seed.sql`
**Acceptance:**
- [ ] `make schema.seed` succeeds without error
- [ ] `SELECT COUNT(*)` matches 4 / 5 / 12

### F1.7 [M5] Seed 150+ ingredient lots

**What:** Implement `infra/seed_lots.py` using Faker to generate 150+ rows with realistic expiry distributions -- most > 7 days, a tail < 3 days, a few past expiry (audit edge case).
**Why:** The < 3 days bucket forces red-badge rendering during the demo; the past-expiry bucket verifies append-only audit handling.
**Files:** `infra/seed_lots.py`
**Acceptance:**
- [ ] `python infra/seed_lots.py` inserts 150+ rows
- [ ] At least 5 lots have `expiry_date - CURRENT_DATE < 3`
- [ ] Idempotent: re-running clears and re-inserts (or skips with `--once`)

### F1.8 [M3] FastAPI app entrypoint

**What:** Wire `backend/app/main.py` with `FastAPI()` instance, CORS middleware (origin from `ALLOWED_ORIGINS` env), and router mounts for every router stubbed in `app/api/`.
**Files:** `backend/app/main.py`
**Acceptance:**
- [ ] `make backend.run` starts uvicorn on :8000
- [ ] `GET /healthz` returns 200 with `{status: "ok"}`

### F1.9 [M3] SQLAlchemy session + base

**What:** Implement `backend/app/db/{base,session}.py` with async `DeclarativeBase` and `async_sessionmaker`. `DATABASE_URL` from env.
**Files:** `backend/app/db/base.py`, `backend/app/db/session.py`
**Acceptance:**
- [ ] FastAPI dependency `get_db()` yields an `AsyncSession`
- [ ] Test connection succeeds against docker-compose postgres

### F1.10 [M3] `GET /api/lots` endpoint

**What:** Inventory router returns all lots with computed `spoilage_risk_score` (delegated to `services/spoilage.py`), sortable by risk desc.
**Files:** `backend/app/api/inventory.py`
**Acceptance:**
- [ ] Returns lots ordered by `spoilage_risk_score` desc by default
- [ ] Query param `?facility_id=` filters
- [ ] Response validates against `shared/schemas/ingredient_lot.schema.json`

### F1.11 [M1] Spoilage risk score service

**What:** `services/spoilage.py::compute_spoilage_risk(lot)` returns `kg_on_hand / max(1, kg_scheduled_before_expiry)`. Lots >= 1.0 are red.
**Files:** `backend/app/services/spoilage.py`
**Acceptance:**
- [ ] Pure function with explicit inputs (no DB access)
- [ ] Unit tests cover: scheduled > on-hand, no schedule, past expiry

### F1.12 [M1] Substitution candidates service

**What:** `services/substitution.py` returns ranked alternative SKUs producible with current stock when the target SKU is blocked. Ranking key: margin contribution (use the seeded margin field).
**Files:** `backend/app/services/substitution.py`
**Acceptance:**
- [ ] Returns 0-N candidates sorted desc by margin
- [ ] Explicit "no alternative possible" case (empty list + reason string)

### F1.13 [M3] Landed cost service

**What:** `services/landed_cost.py` returns `landed_cost = unit_price * quantity + overage_qty * holding_cost_per_day * expected_days_held`. Pure function.
**Files:** `backend/app/services/landed_cost.py`
**Acceptance:**
- [ ] Returns `{unit_cost, overage_cost, holding_cost, total}` dict
- [ ] Unit test for: zero overage, large overage, frozen vs dry storage

### F1.14 [M3] `POST /api/orders/draft` endpoint

**What:** Accepts a draft PO (`supplier_id`, `items[]`, `delivery_date`), computes landed cost via the service, inserts an `action_card` with the proposed PO as payload, returns `{action_card_id, landed_cost_breakdown}`. Does NOT write to `supplier_orders` -- that's the confirm step.
**Files:** `backend/app/api/orders.py`
**Acceptance:**
- [ ] Returns 200 with both fields
- [ ] No row in `supplier_orders` after the call
- [ ] Action card payload matches `action_card.schema.json` (kind = `supplier_order`)

### F1.15 [M3] `POST /api/action_cards/{id}/confirm` endpoint

**What:** Marks the action_card as confirmed and applies its payload (inserts the `supplier_order` with `status='confirmed'`).
**Files:** `backend/app/api/orders.py`
**Acceptance:**
- [ ] Idempotent: re-confirming the same card is a no-op (returns existing order id)
- [ ] Rejected or already-confirmed cards return 409

### F1.16 [M2] LangGraph orchestrator skeleton

**Status:** done
**What:** Implement `agent/agent/graph.py` with a stateful graph -- nodes = `{router, inventory_agent, procurement_agent, respond}`. `AgentState` in `state.py` carries chat history + tool results.
**Files:** `agent/agent/graph.py`, `agent/agent/state.py`, `agent/agent/agents/orchestrator.py`
**Acceptance:**
- [ ] `python -m agent.graph` runs a single test message through to a response
- [ ] Router classifies "what can we bake?" as inventory intent (asserted in a smoke test)

### F1.17 [M2] InventoryAgent with 2 tools

**Status:** done
**What:** Implement `query_lots(facility_id?)` and `substitution_candidates(blocked_sku)` as thin HTTP wrappers over backend endpoints.
**Files:** `agent/agent/agents/inventory.py`, `agent/agent/tools/inventory_tools.py`
**Acceptance:**
- [ ] Both tools callable via LangGraph tool-calling
- [ ] Tool responses validate against `shared/schemas/ingredient_lot.schema.json`

### F1.18 [M2] ProcurementAgent with 2 tools

**Status:** done
**What:** Implement `compute_landed_cost(supplier_id, items)` and `build_order_draft(supplier_id, items, delivery_date)` as wrappers over backend.
**Files:** `agent/agent/agents/procurement.py`, `agent/agent/tools/procurement_tools.py`
**Acceptance:**
- [ ] `build_order_draft` returns the `action_card_id` from backend
- [ ] Result is surfaced to the user as an action-card prompt

### F1.19 [M2] SSE chat endpoint

**What:** `backend/app/api/chat.py` -- `POST /api/chat` streams the orchestrator's response chunks as Server-Sent Events. Action cards are emitted as a discrete `event: action_card` SSE event.
**Files:** `backend/app/api/chat.py`
**Acceptance:**
- [ ] `curl --no-buffer` shows streaming chunks
- [ ] Action card event is a distinct SSE event type with the `action_card_id` in `data:`

### F1.20 [M2 + M3] Fill in `action_card.schema.json`

**What:** Define the JSON Schema for `ActionCard` with discriminator on `kind`. Phase 1 supports `kind='supplier_order'` only; later phases add `'schedule_change'`, `'transfer'`, `'work_order'`.
**Files:** `shared/schemas/action_card.schema.json`
**Acceptance:**
- [ ] Schema validates a sample `supplier_order` payload
- [ ] Schema referenced from the backend Pydantic model AND frontend TS type

### F1.21 [M3] Fill in `ingredient_lot.schema.json`

**What:** JSON Schema mirroring the `ingredient_lots` columns + computed `spoilage_risk_score`.
**Files:** `shared/schemas/ingredient_lot.schema.json`
**Acceptance:**
- [ ] All required fields declared
- [ ] Used as backend GET /api/lots response model and frontend type

### F1.22 [M4] Next.js layout + globals.css

**What:** Wire the root layout with Tailwind and a minimal header. Globals load Tailwind base/components/utilities.
**Files:** `frontend/src/app/layout.tsx`, `frontend/src/app/globals.css`
**Acceptance:**
- [ ] `npm run dev` renders a styled blank page on `/`
- [ ] No console errors; no hydration warnings

### F1.23 [M4] `/materials` page with risk badges

**What:** Fetches `GET /api/lots` and renders a table with a red / amber / green badge per lot based on `spoilage_risk_score`.
**Files:** `frontend/src/app/materials/page.tsx`
**Acceptance:**
- [ ] Loads list from backend
- [ ] `>= 1.0` red, `0.7-1.0` amber, `< 0.7` green
- [ ] Sortable by risk score; default sort desc

### F1.24 [M4] `ChatBox` + `ActionCard` components

**What:** `ChatBox.tsx` opens SSE to `/api/chat`, renders streaming response incrementally. When an `action_card` SSE event arrives, `ActionCard.tsx` renders a confirm/reject UI that POSTs to `/api/action_cards/{id}/confirm`.
**Files:** `frontend/src/components/ChatBox.tsx`, `frontend/src/components/ActionCard.tsx`
**Acceptance:**
- [ ] Streaming text renders incrementally (no full reload)
- [ ] Confirm button POSTs and dismisses card on success
- [ ] Reject leaves card visible but greyed out

### F1.25 [M4] `/chat` page wires `ChatBox` + `ActionCard`

**What:** `app/chat/page.tsx` lays out the chat interface using the two components.
**Files:** `frontend/src/app/chat/page.tsx`
**Acceptance:**
- [ ] End-to-end: type "what can we bake?" -> see substitution candidates -> see action_card -> click confirm -> see success

### F1.26 [M4] Typed API client (`lib/api.ts`)

**What:** Replace the empty `export {}` with a typed wrapper around fetch for `/api/lots`, `/api/suppliers`, `/api/chat` (SSE), `/api/orders/draft`, and `/api/action_cards/{id}/confirm`.
**Files:** `frontend/src/lib/api.ts`
**Acceptance:**
- [ ] All Phase 1 endpoints have typed wrappers
- [ ] `NEXT_PUBLIC_BACKEND_URL` used as base; missing env var throws at import

### F1.27 [M5] Walking-skeleton e2e test

**What:** A script that spins up docker-compose, runs `schema.migrate + schema.seed`, hits `POST /api/chat` with the blueberry question, asserts the response contains an `action_card`, confirms it, asserts the `supplier_order` row exists.
**Files:** `infra/walking_skeleton_test.sh` (or `tests/e2e/walking_skeleton.py`)
**Acceptance:**
- [ ] Exits 0 on green path
- [ ] Wired into the nightly green-build gate (see NF.R4)
- [ ] Cleans up its postgres state on exit

---

## Phase 2 -- Production loop

Retailer PO in -> waste-first allergen-aware schedule out.

### F2.1 [M3] Define `production_formulas` table

**What:** Per-SKU bill of materials: `sku_id`, `ingredient_id`, `kg_per_unit`. Used by scheduler and yield modules.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] Composite PK `(sku_id, ingredient_id)`
- [ ] Seed at least 10 SKUs with 3-6 ingredients each

### F2.2 [M3] Define `production_schedules` table

**What:** Approved + suggested schedules. Columns: `schedule_id`, `version`, `facility_id`, `line_id`, `sku_id`, `start_at`, `end_at`, `quantity`, `status` (`suggested|approved|complete`), `waste_avoided_kg numeric`, `action_card_id nullable`.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] Index on `(facility_id, line_id, start_at)`
- [ ] `waste_avoided_kg` defaults to 0

### F2.3 [M3] Define `retailer_orders` table

**What:** Firm POs from Costco / Walmart / Loblaws / Whole Foods. Columns: `order_id`, `retailer_id`, `sku_id`, `quantity`, `requested_delivery_date`, `received_at`.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] FK to a small `retailers` lookup table
- [ ] Seed 5-10 sample POs

### F2.4 [M3] Define `demand_forecasts` table

**What:** Per-SKU daily forecast output. Columns: `sku_id`, `forecast_date`, `quantity_expected`, `quantity_low`, `quantity_high`, `model_version`, `generated_at`.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] Composite PK `(sku_id, forecast_date, model_version)`
- [ ] Index on `forecast_date`

### F2.5 [M1] OR-Tools scheduler service: base structure

**What:** `services/scheduler.py::solve(facility_id, horizon_days)` returns a list of suggested production runs. Constraints: line capacity, working hours. Objective: meet retailer demand on time.
**Files:** `backend/app/services/scheduler.py`
**Acceptance:**
- [ ] Returns a valid schedule for a 7-day horizon on the seed dataset
- [ ] Throws explicit error when infeasible (instead of silent empty schedule)

### F2.6 [M1] Allergen changeover constraint

**What:** Extend the scheduler with a changeover-time matrix per allergen transition. Minimize total weekly changeover time.
**Files:** `backend/app/services/scheduler.py` (extend), `infra/supabase/schema.sql` (add `allergen_changeovers` lookup)
**Acceptance:**
- [ ] Per-line changeover time penalized in the objective
- [ ] Unit test: schedule with 3 allergen classes shows runs grouped by allergen

### F2.7 [M1] Waste-first objective term

**What:** Add a soft-constraint term that prefers schedules consuming near-expiry lots earlier. Tunable weight vs. changeover term.
**Files:** `backend/app/services/scheduler.py`
**Acceptance:**
- [ ] Toggle weight=0 -> ignores expiry; toggle weight=1 -> prefers expiring lots first
- [ ] Documented tradeoff in service docstring

### F2.8 [M1] Demand forecasting service (LightGBM or Prophet)

**What:** `services/forecasting.py` trains a per-SKU daily forecaster from 3 years of seeded retailer order history; nightly job populates `demand_forecasts`.
**Files:** `backend/app/services/forecasting.py`
**Acceptance:**
- [ ] Generates a 14-day forecast for every SKU
- [ ] Returns prediction intervals (low/high) for chart bands

### F2.9 [M2] SchedulerAgent with 3 tools

**What:** Implement `suggest_production_schedule`, `run_changeover_optimizer`, `what_if_simulation` as thin HTTP wrappers.
**Files:** `agent/agent/agents/scheduler.py`, `agent/agent/tools/scheduler_tools.py`
**Acceptance:**
- [ ] Each tool callable via LangGraph
- [ ] "Why this schedule?" returns the top 3 binding constraints in natural language

### F2.10 [M3] `POST /api/retailer_orders` -> trigger re-schedule

**What:** Endpoint accepts a retailer PO, inserts row, invokes scheduler, surfaces an action_card with the new suggested schedule.
**Files:** `backend/app/api/orders.py` (or `retailer_orders.py`)
**Acceptance:**
- [ ] One POST returns an `action_card_id` whose payload is a schedule_diff

### F2.11 [M3] `GET /api/schedules/diff` endpoint

**What:** Returns the diff between the current approved schedule and the latest suggested one.
**Files:** `backend/app/api/schedules.py`
**Acceptance:**
- [ ] Response matches `shared/schemas/schedule_diff.schema.json`
- [ ] Includes per-change narration text (from agent)

### F2.12 [M4] `/schedule` page with diff view

**What:** Page renders current vs suggested schedule side-by-side using the `ScheduleDiff` component.
**Files:** `frontend/src/app/schedule/page.tsx`
**Acceptance:**
- [ ] Diff highlights additions / removals / shifts in distinct colors
- [ ] Action card to approve appears inline

### F2.13 [M4] `ScheduleDiff` component

**What:** Renders two columns (before / after) with row-level diff highlighting and a per-row narration tooltip.
**Files:** `frontend/src/components/ScheduleDiff.tsx`
**Acceptance:**
- [ ] Handles empty before (first schedule) without crashing
- [ ] Long narrations truncate with tooltip-on-hover

### F2.14 [M4] Forecast bands chart on `/scorecard`

**What:** Recharts line chart with prediction interval shaded band; one chart per top-5 SKU.
**Files:** `frontend/src/app/scorecard/page.tsx`
**Acceptance:**
- [ ] Fetches from `/api/forecasts?sku_id=`
- [ ] Renders historical actuals overlaid

### F2.15 [M3] Fill in `schedule_diff.schema.json`

**What:** JSON Schema with `before[]`, `after[]`, `changes[]` (each change has `kind`, `narration`, `affected_run_ids`).
**Files:** `shared/schemas/schedule_diff.schema.json`
**Acceptance:**
- [ ] Sample diff validates
- [ ] TS type generated and used by `ScheduleDiff`

### F2.16 [M3] `mes_mock.py`: POST approved schedule

**What:** Stub the MES integration. Accepts an approved schedule payload, returns `{ack_id, accepted_at}`. Real client uses the same signature.
**Files:** `backend/app/integrations/mes_mock.py`
**Acceptance:**
- [ ] Used by the action_card confirm step for kind=`schedule_change`
- [ ] Logs the call so demo can show it firing

### F2.17 [M5] Update walking-skeleton test for Phase 2

**What:** Extend `walking_skeleton_test.sh` to: POST a retailer order, assert a schedule action_card appears, confirm, assert MES mock got the call.
**Files:** `infra/walking_skeleton_test.sh`
**Acceptance:**
- [ ] Phase 1 + Phase 2 paths both pass on a fresh DB

---

## Phase 3 -- Full procurement

Delivery window optimizer, MOQ-tax ledger, disruption risk, negotiation drafts.

### F3.1 [M3] Extend `suppliers` with MOQ + window + discount tier columns

**What:** ALTER TABLE adds `moq_kg numeric`, `lead_time_mean_days`, `lead_time_std_days`, `window_earliest_day_of_week int`, `window_latest_day_of_week int`, `discount_tiers jsonb`.
**Files:** `infra/supabase/schema.sql` (new additive migration block)
**Acceptance:**
- [ ] Additive only -- no existing rows broken
- [ ] Seed updated with realistic values per supplier personality

### F3.2 [M3] Define `dock_schedules` table

**What:** `(facility_id, slot_date, slot_index)` PK; `booking_id nullable`, `supplier_id nullable`, `capacity_remaining_kg`.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] Default 4 slots per facility per day
- [ ] Index on `(facility_id, slot_date)`

### F3.3 [M3] Define `moq_tax_ledger` table (append-only)

**What:** `(ledger_id PK, supplier_id, quarter, overage_kg, holding_cost, recorded_at)`. Never UPDATE -- corrections are new rows.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] Trigger or comment enforces append-only
- [ ] Index on `(supplier_id, quarter)`

### F3.4 [M3] Define `disruption_signals` table

**What:** `(signal_id, supplier_id nullable, ingredient_id nullable, kind, severity, source, message, observed_at)`. Sources: news / weather / commodity / miss.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] Indexed on `(observed_at desc)`
- [ ] Severity is 0-1 float

### F3.5 [M3] Define `negotiation_drafts` table

**What:** `(draft_id, supplier_id, trigger_kind, body_md, status ('pending'|'sent'|'discarded'), created_at, sent_at, action_card_id)`.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] FK to `action_cards`
- [ ] `body_md` not null

### F3.6 [M3] MOQ engine service

**What:** `services/moq_engine.py`: given required quantity and supplier MOQ, returns overage + cost + three resolution paths (pull-forward / split-order / accept-overage) each with dollar impact.
**Files:** `backend/app/services/moq_engine.py`
**Acceptance:**
- [ ] Three paths always returned (or fewer with explicit reason)
- [ ] Holding cost computed via `landed_cost` service for consistency

### F3.7 [M3] Delivery window optimizer service (OR-Tools)

**What:** `services/delivery_window.py`: given supplier window + needed-by date + dock schedule + holding cost, returns the optimal day in the window.
**Files:** `backend/app/services/delivery_window.py`
**Acceptance:**
- [ ] Returns specific day in window
- [ ] Falls back to nearest available dock slot if first choice is congested

### F3.8 [M3] Dock schedule checker

**What:** `services/dock_schedules.py::check_slot(facility_id, date, kg)` returns boolean + capacity_remaining. Used by F3.7.
**Files:** `backend/app/services/dock_schedules.py` (NEW file -- add to skeleton)
**Acceptance:**
- [ ] Honest about overcommit -- never returns true when at capacity

### F3.9 [M3] Stock horizon service

**What:** `services/stock_horizon.py`: per-ingredient dynamic reorder point balancing holding cost vs stockout risk. Updated weekly.
**Files:** `backend/app/services/stock_horizon.py`
**Acceptance:**
- [ ] Returns days-of-coverage target per ingredient
- [ ] Honors shelf-life ceiling and MOQ floor

### F3.10 [M3] Disruption risk scoring

**What:** `services/disruption_risk.py`: rolling 90-day miss-rate + external signals; outputs per-supplier daily score 0-1.
**Files:** `backend/app/services/disruption_risk.py`
**Acceptance:**
- [ ] Score >= threshold drafts a bridge PO (action_card)
- [ ] Score documented as derived from named inputs (auditable)

### F3.11 [M3] Contract lifecycle service

**What:** `services/contract_lifecycle.py`: at 60 days before `contract_expiry_date`, generate a performance report + negotiation brief; at 30 days, draft a renewal counter-proposal or termination notice.
**Files:** `backend/app/services/contract_lifecycle.py`
**Acceptance:**
- [ ] Daily scheduled run flags contracts crossing each threshold
- [ ] Outputs are negotiation_drafts rows

### F3.12 [M3] Payment terms optimizer

**What:** `services/payment_terms.py`: given supplier offer (e.g. 2/10 net-30), compute annualized rate vs FGF cost of capital; return recommendation.
**Files:** `backend/app/services/payment_terms.py`
**Acceptance:**
- [ ] Returns `{annualized_rate, recommended, reasoning}`
- [ ] Cost of capital is configurable (env var)

### F3.13 [M2] Negotiation draft generation (Claude Opus 4.7)

**What:** `agent/agent/tools/procurement_tools.py::draft_negotiation(trigger_kind, supporting_data)` calls Claude Opus 4.7 with the relevant prompt from `prompts/negotiation.md`. Returns markdown body; service writes to `negotiation_drafts`.
**Files:** `agent/agent/tools/procurement_tools.py`, `agent/agent/prompts/negotiation.md`
**Acceptance:**
- [ ] Three trigger kinds supported: `moq_tax`, `late_window`, `price_drift`
- [ ] Output always references the supplied data (auditable)

### F3.14 [M3] `commodity_feed.py` + `news_feed.py` mock implementations

**What:** Return seeded series for CBOT wheat / CME butter / ICE sugar; news mock fires one event per minute from a seed list.
**Files:** `backend/app/integrations/commodity_feed.py`, `backend/app/integrations/news_feed.py`
**Acceptance:**
- [ ] Real-client toggle via `CBOT_WHEAT_API_KEY` / `NEWS_API_KEY` env
- [ ] Demo can force a disruption event via `?force=saskatchewan_drought`

### F3.15 [M5] Redis event stream publisher

**What:** Implement `infra/event_stream.py` -- publishes inventory deltas, yield events, disruption signals to Redis pubsub every few seconds.
**Files:** `infra/event_stream.py`
**Acceptance:**
- [ ] `make seed.events` starts the publisher
- [ ] Backend SSE subscribers receive events within 1 second

### F3.16 [M4] `MOQTaxBadge` component

**What:** Quarterly MOQ-tax indicator -- shows cumulative overage cost per supplier with color thresholds (< 50% green, 50-100% amber, > 100% red of negotiation threshold).
**Files:** `frontend/src/components/MOQTaxBadge.tsx`
**Acceptance:**
- [ ] Hover tooltip explains the calculation
- [ ] Used on both `/facilities` and supplier detail views

### F3.17 [M4] Supplier detail card with window + MOQ-tax indicators

**What:** Compose `SupplierCard.tsx` to show supplier scorecard, MOQ-tax badge, window-compliance bar, last 90-day miss rate.
**Files:** `frontend/src/components/SupplierCard.tsx`
**Acceptance:**
- [ ] All 4 indicators render from a single supplier prop
- [ ] Clickable to expand to negotiation_drafts list

### F3.18 [M3] `sap_mock.py`: POST PO + return confirmation

**What:** Implement the mock SAP S/4 HANA endpoint -- accepts a PO payload (with chosen delivery day + dock slot), returns `{po_number, confirmed_delivery_date}`. Books the dock slot atomically.
**Files:** `backend/app/integrations/sap_mock.py`
**Acceptance:**
- [ ] Called by action_card confirm for kind=`supplier_order`
- [ ] Booking failure returns 409 (with reason)

### F3.19 [M3] Fill in `supplier_order.schema.json` + `negotiation_draft.schema.json`

**What:** Complete both JSON Schemas to match Phase 3 DB columns.
**Files:** `shared/schemas/supplier_order.schema.json`, `shared/schemas/negotiation_draft.schema.json`
**Acceptance:**
- [ ] Sample payloads from the DB validate
- [ ] Used by both backend Pydantic + frontend TS types

---

## Phase 4 -- ESG, yield, finished goods

### F4.1 [M3] Define `production_runs` table

**What:** Per-run actual outcomes: `run_id`, `schedule_id FK`, `line_id`, `started_at`, `ended_at`, `planned_kg`, `actual_kg`, `actual_ingredient_consumption jsonb`.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] FK to `production_schedules`
- [ ] Seed 20+ historical runs with realistic variance

### F4.2 [M3] Define `waste_events` table (append-only)

**What:** `waste_event_id`, `event_at`, `kind` (`spoilage|yield_loss|moq_overage|expired_pallet`), `kg`, `dollar_value`, `co2e_kg`, `source_table`, `source_id`, `avoided bool`.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] Append-only; no UPDATEs allowed
- [ ] Index on `(event_at, kind)`

### F4.3 [M3] Define `finished_goods_pallets` table

**What:** `pallet_id`, `sku_id`, `facility_id`, `produced_at`, `shelf_life_days`, `quantity`, `status` (`in_warehouse|shipped|donated|written_off`), `committed_order_id nullable`.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] Computed column or view for `days_remaining`
- [ ] Seed 50+ pallets with varied shelf-life remaining

### F4.4 [M1] Yield variance service

**What:** `services/yield_intel.py::compute_variance(run_id)` returns actual vs theoretical consumption per ingredient with dollar leak.
**Files:** `backend/app/services/yield_intel.py`
**Acceptance:**
- [ ] Returns per-ingredient breakdown + total leak
- [ ] Variance above threshold marks the run for anomaly diagnosis

### F4.5 [M1] Yield anomaly diagnosis service

**What:** When variance crosses threshold, cross-reference equipment calibration log + operator shift + recipe history; return likely cause + confidence.
**Files:** `backend/app/services/yield_intel.py` (extend)
**Acceptance:**
- [ ] Returns one or more candidate causes ranked
- [ ] Each cause is auditable (references the data row(s) that supported it)

### F4.6 [M3] `cmms_mock.py`: stub work-order creation

**What:** Mock CMMS endpoint accepts `{equipment_id, suggested_window, reason}`, returns `{work_order_id, scheduled_at}`.
**Files:** `backend/app/integrations/cmms_mock.py`
**Acceptance:**
- [ ] Called by action_card confirm for kind=`work_order`
- [ ] Returned `scheduled_at` lands in the next downtime window

### F4.7 [M2] YieldAgent with 3 tools

**What:** Implement `get_yield_variance`, `diagnose_anomaly`, `create_cmms_work_order` as thin HTTP wrappers.
**Files:** `agent/agent/agents/yield_intel.py`, `agent/agent/tools/yield_tools.py`
**Acceptance:**
- [ ] Diagnosis tool returns one-sentence narration suitable for chat surface

### F4.8 [M3] ESG aggregation (waste counter) service

**What:** `services/esg.py::compute_running_counter()` returns `{kg_avoided, dollars_saved, co2e_avoided}` from `waste_events` where `avoided=true`.
**Files:** `backend/app/services/esg.py`
**Acceptance:**
- [ ] O(1) query (uses materialized view or running sum table)
- [ ] Refreshes on each new `waste_event`

### F4.9 [M3] ESG pattern analysis

**What:** Weekly clustering of waste events by `(plant, ingredient, kind)`; surfaces top 3 patterns with root-cause narration via Claude.
**Files:** `backend/app/services/esg.py` (extend)
**Acceptance:**
- [ ] Outputs are persisted as proposed `process_rules` rows (new lookup table -- add in this task)

### F4.10 [M3] Scope 3 PDF generation

**What:** `services/esg.py::generate_scope_3_pdf(facility_id, period)` returns a PDF formatted for retailer Scope 3 disclosure (Costco / Walmart / Whole Foods).
**Files:** `backend/app/services/esg.py` (extend), tech: ReportLab or WeasyPrint
**Acceptance:**
- [ ] Generated PDF opens in standard readers
- [ ] Includes facility footer, period, kg + dollar + CO2e summary, top patterns

### F4.11 [M2] ESGAgent with 3 tools

**What:** Implement `get_waste_counter`, `run_pattern_analysis`, `generate_esg_report`.
**Files:** `agent/agent/agents/esg.py`, `agent/agent/tools/esg_tools.py`
**Acceptance:**
- [ ] `generate_esg_report` returns a download URL (action card with kind=`download`)

### F4.12 [M3] FEFO routing service

**What:** `services/fefo.py::match_outbound_to_pallets(order_id)` returns pallets sorted oldest-first, eligible by SKU and facility.
**Files:** `backend/app/services/fefo.py`
**Acceptance:**
- [ ] Never assigns a pallet beyond shelf life
- [ ] Returns explicit "stranded" set if order can't be filled

### F4.13 [M4] `YieldCounter` component

**What:** Live dollar-waste counter per active run; updates via SSE.
**Files:** `frontend/src/components/YieldCounter.tsx`
**Acceptance:**
- [ ] Visible delta when SSE event arrives (smooth count-up animation OK)
- [ ] Drops to 0 on run end

### F4.14 [M4] `/scorecard` page (full ESG view)

**What:** Compose page: running waste counter (kg/$/CO2e), top-3 patterns, ESG PDF download, Phase 2 forecast bands already there.
**Files:** `frontend/src/app/scorecard/page.tsx`
**Acceptance:**
- [ ] All four widgets render from real backend data
- [ ] Empty states for each (no waste events yet, no patterns yet)

### F4.15 [M4] `LotGenealogyGraph` component (react-flow)

**What:** Given a pallet, render a react-flow graph tracing back through production formulas to source ingredient lots.
**Files:** `frontend/src/components/LotGenealogyGraph.tsx`
**Acceptance:**
- [ ] Click a pallet on `/scorecard` -> graph opens
- [ ] Each node shows the source supplier on hover

---

## Phase 5 -- FlowSight

The strategy-game cockpit. All Phase 5 functional tasks are M5's.

### F5.1 [M5] PixiJS canvas mount + pan/zoom

**What:** Initialize `FlowSightCanvas.tsx` -- mount PIXI.Application via @pixi/react, implement pan + pinch/wheel zoom with bounds.
**Files:** `frontend/src/components/FlowSightCanvas.tsx`
**Acceptance:**
- [ ] Canvas resizes on viewport change
- [ ] Pan and zoom feel smooth at 60fps

### F5.2 [M5] Plant + supplier + retailer node rendering

**What:** Render 4 plant nodes on a Canada outline, 5 supplier nodes on the left rail, 4 retailer nodes on the right rail. Click a node -> show detail card.
**Files:** `frontend/src/components/FlowSightCanvas.tsx`
**Acceptance:**
- [ ] All 13 nodes render at correct geographic / rail positions
- [ ] Detail card on click pulls data from backend

### F5.3 [M5] Animated truck units along edges

**What:** When a transfer / PO confirms, spawn a truck sprite that animates along the edge from origin to destination over the planned transit time.
**Files:** `frontend/src/components/FlowSightCanvas.tsx`
**Acceptance:**
- [ ] At least 3 trucks can animate simultaneously without frame drops
- [ ] Truck despawns on arrival; arrival event posts to backend

### F5.4 [M5] `LayerToggle` component

**What:** Sidebar with 8 toggle switches (one per other module's layer). State drives which overlays render on the canvas.
**Files:** `frontend/src/components/LayerToggle.tsx`
**Acceptance:**
- [ ] State persisted in localStorage
- [ ] Layer toggles are O(1) -- no re-render of unrelated nodes

### F5.5 [M5] Risk layer (supplier halos)

**What:** When risk layer on, each supplier node renders a colored halo per its disruption_risk_score (green / amber / red).
**Files:** `frontend/src/components/FlowSightCanvas.tsx` (extend)
**Acceptance:**
- [ ] Halo color updates live via SSE on `disruption_signals` events

### F5.6 [M5] Yield layer (per-plant counter overlay)

**What:** When yield layer on, each plant node renders a small floating dollar counter using the `YieldCounter` data.
**Files:** `frontend/src/components/FlowSightCanvas.tsx` (extend)
**Acceptance:**
- [ ] Counter updates without rerendering the plant node

### F5.7 [M5] Shelf-life layer (pallet color overlay)

**What:** When shelf-life layer on, each plant renders a small tile grid of finished_goods_pallets colored by days-remaining.
**Files:** `frontend/src/components/FlowSightCanvas.tsx` (extend)
**Acceptance:**
- [ ] Tile color follows shelf-life threshold (green / amber / red)
- [ ] Click a tile -> opens recovery-options action card

### F5.8 [M5] Forecast layer (retailer demand)

**What:** When forecast layer on, each retailer node shows forecast vs actual bar; incoming POs render as approaching truck units.
**Files:** `frontend/src/components/FlowSightCanvas.tsx` (extend)
**Acceptance:**
- [ ] Bar uses Phase 2 forecast data
- [ ] Bars update when a new PO lands

### F5.9 [M5] `TimeScrubber` component

**What:** Bottom-of-screen scrubber that replays the last 24h of events at 1x / 2x / 4x or pauses. Drives the canvas state.
**Files:** `frontend/src/components/TimeScrubber.tsx`
**Acceptance:**
- [ ] Replay shows truck units moving in original timing
- [ ] Pause snapshot is reproducible (same scrubber position = same canvas)

### F5.10 [M5] SSE event channel for live overlays

**What:** Backend `/api/events` SSE endpoint multiplexes risk / yield / shelf-life / forecast events. Frontend subscribes once, demuxes by event type.
**Files:** `backend/app/api/events.py` (NEW), `frontend/src/lib/api.ts`
**Acceptance:**
- [ ] One persistent SSE connection per session (not one per layer)
- [ ] Reconnect-on-disconnect with backoff

### F5.11 [M5] `/facilities` page wires `FlowSightCanvas` + all layers

**What:** Compose the cockpit page: canvas + sidebar + scrubber + chat overlay.
**Files:** `frontend/src/app/facilities/page.tsx`
**Acceptance:**
- [ ] Layer toggles flip overlays without page reload
- [ ] Chat overlay (reusing `ChatBox`) sits above the canvas

### F5.12 [M5] `FactoryView` (plant-floor) variant

**What:** Second view of the same renderer -- click a plant on FlowSight to descend into FactoryView: lines are tracks, batches are moving labeled tiles.
**Files:** `frontend/src/components/FactoryView.tsx`
**Acceptance:**
- [ ] Same canvas engine, different node layout
- [ ] Back button returns to FlowSight at the same zoom level

### F5.13 [M5] 5-minute scripted demo runs end-to-end

**What:** Walk through the README's Scripted Demo (5 minutes) section without manual intervention beyond the prescribed clicks. Record a backup video.
**Files:** N/A (verification task)
**Acceptance:**
- [ ] All 8 demo beats fire in order
- [ ] Backup MP4 stored in `infra/demo/`

---

# Non-functional tasks

Cross-cutting quality attributes. These don't deliver new user-visible features
but they're the guarantees the README's "Non-functional features" table promises.

## Schema and contracts

### NF.S.1 [M3] Lock JSON Schema 2020-12 across `shared/schemas/`

**What:** Add a CI check that every `.schema.json` declares `"$schema": "https://json-schema.org/draft/2020-12/schema"` and has a non-empty `$id`.
**Files:** `.github/workflows/schema-lint.yml` (NEW), `shared/schemas/*.json`
**Acceptance:**
- [ ] CI fails if a schema is missing either header

### NF.S.2 [M3] Document schema-freeze policy

**What:** Add `CONTRIBUTING.md` (NEW) with the Day-1 schema freeze rule: additive changes always OK, renames require team agreement, every change bumps a `version` field.
**Files:** `CONTRIBUTING.md`
**Acceptance:**
- [ ] Rule stated in <= 1 page
- [ ] Linked from main README under Key Engineering Rules

### NF.S.3 [M3] Pydantic v2 strict mode

**What:** Configure all backend Pydantic models with `model_config = ConfigDict(strict=True, extra='forbid')`.
**Files:** `backend/app/db/base.py` (or a `models/__init__.py` mixin)
**Acceptance:**
- [ ] Unknown fields raise validation errors at request boundary
- [ ] Decimal precision preserved for currency/kg fields

### NF.S.4 [M4] Generate TS types from JSON Schemas

**What:** Wire `json-schema-to-typescript` (or equivalent) so `npm run gen:types` regenerates `frontend/src/types/*.ts` from `shared/schemas/*.json`.
**Files:** `frontend/package.json` (script), `frontend/scripts/gen-types.mjs` (NEW)
**Acceptance:**
- [ ] One command regenerates all types
- [ ] CI fails if generated types are stale relative to the schemas

## Reliability and audit

### NF.R.1 [M3] Append-only convention enforcement

**What:** Add Postgres triggers on `inventory_events`, `waste_events`, `moq_tax_ledger` that raise on UPDATE or DELETE.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] Unit test: UPDATE on `waste_events` raises
- [ ] Documented in CONTRIBUTING.md

### NF.R.2 [M2] HITL gate: every state-changing tool returns `action_card_id`

**What:** Audit every tool in `agent/agent/tools/*` -- any tool that ultimately writes state must return an action_card_id, never commit directly.
**Files:** `agent/agent/tools/*`
**Acceptance:**
- [ ] Code-review checklist item added
- [ ] Smoke test asserts no tool returns a write-success without a card id

### NF.R.3 [M3] Action card confirm idempotency

**What:** Re-confirming an already-confirmed action_card is a no-op returning the original side-effect row id. Documented + tested.
**Files:** `backend/app/api/orders.py` (or `action_cards.py`)
**Acceptance:**
- [ ] Test: confirm twice -> single side-effect row -> both responses match

### NF.R.4 [M5] Nightly green-build gate

**What:** Cron job (GitHub Actions schedule) runs `walking_skeleton_test.sh` every night against `main`. Failure posts to a Slack/Discord channel.
**Files:** `.github/workflows/nightly-skeleton.yml` (NEW)
**Acceptance:**
- [ ] Job runs on schedule
- [ ] Failure notification fires once per failure (not on every job)

### NF.R.5 [M3] Gmail draft integration (no auto-send)

**What:** Thin wrapper over the Gmail API `users.drafts.create` endpoint. Auth via OAuth2 refresh token from env. Returns `{draft_id, draft_url}` -- the URL the user opens in Gmail to review and send themselves. A mock variant returns a deterministic fake URL for local dev.
**Why:** Outbound email is irreversible. Centralizing all email through a *draft-only* integration enforces that no code path can ever auto-send. The user is always the last step.
**Files:** `backend/app/integrations/gmail_drafts.py` (NEW), `backend/app/integrations/gmail_drafts_mock.py` (NEW), `.env.example` (add `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_USE_MOCK`)
**Acceptance:**
- [ ] `create_draft(to, subject, body) -> {draft_id, draft_url}` works against a real Gmail test account
- [ ] Mock variant returns a deterministic fake URL with the same shape
- [ ] Factory in `integrations/factory.py` selects mock vs real via `GMAIL_USE_MOCK`
- [ ] No `send` capability exposed -- only `create_draft`

### NF.R.6 [M3] `notification_drafts` audit table + endpoint

**What:** Append-only table tracking every draft ever created: `draft_id PK, kind, recipients[], subject, body_md, gmail_draft_url, action_card_id FK, created_at`. `GET /api/notifications/drafts` lists them in reverse-chronological order.
**Files:** `infra/supabase/schema.sql`, `backend/app/api/notifications.py` (NEW)
**Acceptance:**
- [ ] Every successful `create_draft` writes one row
- [ ] Append-only (trigger blocks UPDATE/DELETE; same convention as NF.R.1)
- [ ] List endpoint paginates (default page size 50)

### NF.R.7 [M3] `stakeholders` table + seed

**What:** Stakeholder directory. Columns: `stakeholder_id, name, email, role, organization, tags[]`. Seed 10-20 sample contacts covering supplier reps, plant managers, account managers, ESG officer, retailer buyers.
**Why:** Agent tools that propose outbound communication need a typed source of truth for "who could receive this." `tags` lets the agent filter by domain (`supplier_negotiation`, `retailer_negotiation`, `contract_lifecycle`, `weekly_summary`).
**Files:** `infra/supabase/schema.sql`, `infra/supabase/seed.sql`
**Acceptance:**
- [ ] At least one stakeholder per role type
- [ ] At least 2 stakeholders per tag (so the multi-select isn't always degenerate)

### NF.R.8 [M2] Stakeholder identification tool

**What:** `agent/agent/tools/notify_tools.py::identify_stakeholders(action_kind, context) -> Stakeholder[]` returns candidates relevant to the action. Each candidate has `{id, name, email, role, relevance_reason}` -- the reason is a one-sentence string the UI shows on hover.
**Files:** `agent/agent/tools/notify_tools.py` (NEW)
**Acceptance:**
- [ ] Returns 0-N candidates ranked by relevance
- [ ] Reads from `stakeholders` table; filters by `tags` matching the `action_kind`
- [ ] Never returns a candidate without a `relevance_reason`

### NF.R.9 [M2] `notify` action card kind

**What:** Extend `action_card.schema.json` with `kind='notify'` payload: `{stakeholders: Stakeholder[], subject_template, body_template, render_context}`. Confirming the card POSTs to a new backend endpoint that loops over the *selected* stakeholders and calls `gmail_drafts.create_draft` for each.
**Files:** `shared/schemas/action_card.schema.json` (extend), `agent/agent/tools/notify_tools.py` (extend), `backend/app/api/notifications.py` (extend with confirm handler)
**Acceptance:**
- [ ] Schema validates a sample notify payload with 3 stakeholders
- [ ] Confirm creates one Gmail draft *per selected stakeholder* (not one combined draft)
- [ ] Each draft is logged to `notification_drafts` with the originating `action_card_id`
- [ ] Rejecting the card creates zero drafts and zero log rows

### NF.R.10 [M4] `StakeholderSelector` component

**What:** Multi-select chip UI rendered inside `ActionCard` when card kind is `notify`. Shows stakeholder name + role; hover reveals the relevance reason. All candidates preselected by default; user can deselect any.
**Files:** `frontend/src/components/StakeholderSelector.tsx` (NEW), `frontend/src/components/ActionCard.tsx` (extend to render selector when payload contains `stakeholders[]`)
**Acceptance:**
- [ ] At least one stakeholder must be selected to enable the Confirm button
- [ ] Confirm POSTs selected stakeholder ids alongside `action_card_id`
- [ ] After confirm, the UI shows each Gmail draft URL as a clickable link (opens in new tab)

### NF.R.11 [M5] No-direct-send lint rule

**What:** Repo-wide CI check: no Python file may import `smtplib`, `email.mime.*` for sending, or reference Gmail API `send` endpoints. All outbound email goes through `integrations/gmail_drafts.py`. Allowlist: that file only.
**Files:** `.github/workflows/no-direct-send.yml` (NEW), or extended into the existing backend workflow
**Acceptance:**
- [ ] CI fails if any non-allowlisted file imports `smtplib`
- [ ] CI fails if any file calls a `.send()` method on a Gmail service builder
- [ ] Documented in `CONTRIBUTING.md` alongside the schema-freeze policy

## Observability and reporting

### NF.O.1 [M3] Weekly activity aggregation service

**What:** `backend/app/services/weekly_summary.py::aggregate(week_start, week_end)` returns structured stats from the prior week: action cards confirmed by kind, dollar waste avoided, MOQ-tax accumulated per supplier, supplier disruptions caught, top 3 yield anomalies, schedule changes confirmed, new supplier orders, new retailer orders.
**Why:** A trustworthy weekly summary needs deterministic numbers separate from any LLM narration -- so the same input always produces the same numeric output.
**Files:** `backend/app/services/weekly_summary.py` (NEW)
**Acceptance:**
- [ ] Pure function: returns a structured dict given a date range
- [ ] Handles empty week explicitly (returns zeros + a `quiet_week: true` flag)
- [ ] Unit test seeds fake events and asserts counts

### NF.O.2 [M2] Weekly summary narration via Claude

**What:** `agent/agent/tools/summary_tools.py::narrate_week(stats)` turns the raw stats into an executive-friendly markdown summary (~300-500 words). Sonnet 4.6. The prompt instructs Claude to only reference numbers from the stats input (no hallucinated metrics).
**Files:** `agent/agent/tools/summary_tools.py` (NEW), `agent/agent/prompts/weekly_summary.md` (NEW)
**Acceptance:**
- [ ] Output is 300-500 words, markdown formatted
- [ ] Every number in the prose appears in the input stats (auditable)
- [ ] Quiet weeks get a single-paragraph "nothing notable" narration

### NF.O.3 [M3] Monday scheduled job

**What:** A Render cron service fires every Monday at 08:00 UTC. The job calls `aggregate` -> `narrate_week` -> `gmail_drafts.create_draft` (using NF.R.5). Recipient list from env var `WEEKLY_SUMMARY_RECIPIENTS` (comma-separated emails) or the `stakeholders` table filtered by `tags @> ARRAY['weekly_summary']`.
**Files:** `render.yaml` (cron service block), `backend/app/jobs/weekly_summary.py` (NEW)
**Acceptance:**
- [ ] Cron schedule fires Monday 08:00 UTC reliably
- [ ] Manual trigger available via `POST /api/jobs/weekly_summary/run?week_start=YYYY-MM-DD`
- [ ] Job is idempotent: running twice for the same week returns the existing draft url

### NF.O.4 [M3] `weekly_summaries` table

**What:** Persist every generated summary. Columns: `summary_id PK, week_start, week_end, stats jsonb, narration_md, gmail_draft_url, created_at`. Append-only.
**Files:** `infra/supabase/schema.sql`
**Acceptance:**
- [ ] One row per week generated
- [ ] Append-only trigger; same convention as NF.R.1
- [ ] Index on `week_start desc`

### NF.O.5 [M4] `/summaries` archive page

**What:** Archive of past weekly summaries. List view shows date range + a one-line headline (extracted from the narration's first sentence). Click a row to expand the full narration + a structured stats table.
**Files:** `frontend/src/app/summaries/page.tsx` (NEW)
**Acceptance:**
- [ ] Lists in reverse-chronological order
- [ ] Expanded view shows both narration (rendered markdown) and stats (rendered as a key-value table)
- [ ] "Open Gmail draft" button visible for the current week if a draft exists

## Performance and inference

### NF.P.1 [M1] Pin ML deps to CPU-only

**What:** In `backend/pyproject.toml` and `agent/pyproject.toml`, pin LightGBM, NumPy, scikit-learn to wheels with no CUDA dependency. Document why.
**Files:** `backend/pyproject.toml`, `agent/pyproject.toml`
**Acceptance:**
- [ ] `uv sync` on a CPU-only machine succeeds in < 60 seconds
- [ ] No `torch` or `cuda*` packages transitively pulled in

### NF.P.2 [M1] faster-whisper small model only

**What:** Configure `agent/agent/voice/whisper.py` to use `small` model with `compute_type='int8'`. Document the model-size tradeoff.
**Files:** `agent/agent/voice/whisper.py`
**Acceptance:**
- [ ] First STT call < 5 seconds on a 4-core CPU
- [ ] Custom bakery vocabulary loaded from a config file

### NF.P.3 [M3] FastAPI async throughout

**What:** Audit all `backend/app/api/*` endpoints -- every handler is `async def`, all DB calls go through the async session, no sync `requests` lib (use `httpx.AsyncClient`).
**Files:** `backend/app/api/*`
**Acceptance:**
- [ ] Lint rule catches sync DB calls in async handlers
- [ ] No `requests` in dependencies

### NF.P.4 [M2] LLM model selection via config

**Status:** done
**What:** `agent/agent/config.py` (NEW): `default_model = 'claude-sonnet-4-6'`, `negotiation_model = 'claude-opus-4-7'`. All Claude calls go through a `get_model(purpose)` helper.
**Files:** `agent/agent/config.py`
**Acceptance:**
- [ ] One env override flips both models for cost testing
- [ ] No hard-coded model IDs anywhere else

## UX patterns

### NF.U.1 [M4] SSE client helper with auto-reconnect

**What:** `lib/api.ts::createEventStream(path, handlers)` wraps `EventSource` with reconnect-on-disconnect (exponential backoff to max 30s) and typed event dispatching.
**Files:** `frontend/src/lib/api.ts`
**Acceptance:**
- [ ] Manually killing backend pauses then resumes the stream on backend restart
- [ ] Reconnect backoff respected (not a tight loop)

### NF.U.2 [M4] Action card confirm requires explicit click

**What:** `ActionCard` does NOT submit on Enter key. Confirm must be a button click. Reason: prevents accidental commits when typing fast.
**Files:** `frontend/src/components/ActionCard.tsx`
**Acceptance:**
- [ ] Manual test: Enter in chat input does NOT confirm a pending card
- [ ] Documented in component docstring

### NF.U.3 [M4] Locale-aware number formatting

**What:** All currency / kg / counts render via `Intl.NumberFormat('en-CA', ...)` -- never `${value}` concatenation. Helper in `lib/format.ts` (NEW).
**Files:** `frontend/src/lib/format.ts`
**Acceptance:**
- [ ] Audit: no raw `$${...}` template strings in components
- [ ] Helper used by `YieldCounter`, `MOQTaxBadge`, `SupplierCard`

### NF.U.4 [M4] Loading + empty states on every async fetch

**What:** Every page that fetches data renders explicit loading skeleton and explicit empty-state (not just blank).
**Files:** `frontend/src/app/{materials,schedule,scorecard,facilities}/page.tsx`
**Acceptance:**
- [ ] First paint never shows a blank screen
- [ ] Empty states explain how to populate the data (e.g. "Run `make schema.seed`")

## Deployment and dev experience

### NF.D.1 [M5] docker-compose healthchecks

**What:** Add `healthcheck:` blocks for postgres (pg_isready) and redis (redis-cli ping). Dependent services use `depends_on: condition: service_healthy`.
**Files:** `docker-compose.yml`
**Acceptance:**
- [ ] `make up.full` starts backend only after postgres reports healthy
- [ ] Time from `make up.full` to a working chat endpoint < 60 seconds

### NF.D.2 [M5] `make up.full` brings full stack with correct ordering

**What:** Verify and document the full-stack startup path. Add a sanity script that hits all health endpoints after `make up.full`.
**Files:** `Makefile`, `infra/sanity_check.sh` (NEW)
**Acceptance:**
- [ ] One command brings up everything on a fresh clone (after `cp .env.example .env`)

### NF.D.3 [M5] Vercel deploy config for frontend

**What:** `frontend/vercel.json` (NEW) and a documented manual deploy step. NEXT_PUBLIC_BACKEND_URL bound to the Render backend URL.
**Files:** `frontend/vercel.json`, `frontend/README.md`
**Acceptance:**
- [ ] One-click deploy from Vercel dashboard works
- [ ] Demo URL stable across deploys

### NF.D.4 [M5] Render deploy config for backend + agent

**What:** `render.yaml` at repo root declares backend service + agent worker + managed postgres + managed redis. Free-tier friendly.
**Files:** `render.yaml`
**Acceptance:**
- [ ] `render blueprint launch` provisions all services
- [ ] Backend reachable at a stable URL

### NF.D.5 [M5] Single env-var swap toggles each integration to real

**What:** Audit `backend/app/integrations/factory.py` -- `SUPPLIER_USE_MOCK=false` swaps SAP, `MES_USE_MOCK=false` swaps MES, `CMMS_USE_MOCK=false` swaps CMMS. No code change needed.
**Files:** `backend/app/integrations/factory.py`
**Acceptance:**
- [ ] Toggle test: setting MOCK=false + invalid creds returns a clear error (proves swap path is live)
- [ ] Documented in `.env.example`

### NF.D.6 [M5] `.env.example` covers every required var

**What:** Audit every `os.getenv` / `process.env.` call across the repo; ensure each has a corresponding entry in `.env.example` with a comment.
**Files:** `.env.example`
**Acceptance:**
- [ ] CI script greps for unlisted env-var reads
- [ ] Fresh clone + `cp .env.example .env` + fill ANTHROPIC_API_KEY = working app

## CI and quality gates

### NF.C.1 [M5] Backend CI: lint + test

**What:** `.github/workflows/backend.yml` runs `ruff check`, `ruff format --check`, `pytest` on every PR touching `backend/**`.
**Files:** `.github/workflows/backend.yml`
**Acceptance:**
- [ ] Status check blocks merge on failure
- [ ] Runs in < 3 minutes

### NF.C.2 [M5] Agent CI: lint + test

**What:** Same pattern for `agent/**`.
**Files:** `.github/workflows/agent.yml`
**Acceptance:**
- [ ] Status check blocks merge on failure

### NF.C.3 [M5] Frontend CI: lint + build

**What:** `.github/workflows/frontend.yml` runs `npm run lint` + `npm run build` on every PR touching `frontend/**`.
**Files:** `.github/workflows/frontend.yml`
**Acceptance:**
- [ ] Build passes; type errors block merge

### NF.C.4 [M5] PR template with walking-skeleton checkbox

**What:** `.github/pull_request_template.md` includes a mandatory checkbox: "I ran `walking_skeleton_test.sh` locally and it passed."
**Files:** `.github/pull_request_template.md`
**Acceptance:**
- [ ] Template auto-loads on every new PR

---

# Stretch goals

Not in the cut order, not in the main task list. Pick up after Phase 5 lands or
if a phase finishes well ahead of schedule. Each is sized as a multi-day track,
not an atomic task -- if pulled in, decompose into the same `F/NF` task format.

### S.1 [M4 + M3] Slack / Teams action card push

**What:** When an action card is created, optionally push it to a Slack or Teams channel as a native message with inline Confirm / Reject buttons (Slack Block Kit or Teams Adaptive Cards). Button clicks post back to the same `/api/action_cards/{id}/confirm` endpoint.
**Why:** Plant managers and floor leads live in chat tools, not the web app. Bridging makes BakeryPilot ambient instead of yet-another-tab.
**Files:** `backend/app/integrations/slack.py` (NEW), `backend/app/integrations/teams.py` (NEW), `backend/app/services/action_cards.py` (notify-hook extension)
**Sizing:** ~2 days for Slack alone; Teams is a second 1-2 day pass with the same pattern.

### S.2 [M4 + M2] Multi-language UI (French + Spanish)

**What:** Externalize every user-facing string to a translation key; provide FR and ES translation files. Agent system prompt switches response language by user preference. Listed in MERGED_PLAN feature map (line 644) but not yet scoped.
**Why:** FGF operates in Canada (French) and has growing US-Spanish-speaking floor staff. Tiny additional surface area once strings are externalized.
**Files:** `frontend/src/lib/i18n.ts` (NEW), `frontend/src/locales/{en,fr,es}.json` (NEW), `agent/agent/prompts/system.md` (extend with language directive)
**Sizing:** ~3 days end-to-end.

### S.3 [M3 + M4] Supplier portal

**What:** Read-only public-ish portal where suppliers view their own scorecard (on-time %, fill rate, window compliance, price vs. benchmark, MOQ-tax incurred this quarter) and any pending negotiation drafts addressed to them. SSO via Gmail magic link.
**Why:** Transparency is a negotiation lever. "Here's exactly what we measure" preempts the supplier's surprise and shortens negotiation cycles.
**Files:** `frontend/src/app/portal/[supplier_id]/page.tsx` (NEW), `backend/app/api/portal.py` (NEW), `backend/app/services/portal_auth.py` (NEW)
**Sizing:** ~4-5 days; auth is the hardest part.

### S.4 [M3 + M5] Real ERP integration playbook

**What:** Document the end-to-end recipe for swapping `sap_mock.py` for a real SAP S/4 HANA endpoint -- required SAP modules, credentials flow, idempotency notes, and a parity test harness that proves byte-identical behavior. Same structure for MES and CMMS.
**Why:** The mock-parity NFR is only as good as the swap path being real. A playbook turns the architectural claim into evidence.
**Files:** `docs/integrations/sap-real.md` (NEW), `docs/integrations/mes-real.md` (NEW), `docs/integrations/cmms-real.md` (NEW), `infra/integration_parity_test.py` (NEW)
**Sizing:** ~2 days for the playbook + ~1 day per real integration the team wires.

### S.5 [M5 + M4] Floor-worker mobile PWA

**What:** Mobile-first PWA wrapper of the chat + voice flow, installable to home screen. Optimized for one-handed use with gloves on (big targets, voice-first input, minimal text reading).
**Why:** Voice input is the killer feature for the floor and only works if it's truly mobile-first. Today's `/chat` is desktop-shaped.
**Files:** `frontend/src/app/mobile/page.tsx` (NEW), `frontend/public/manifest.json` (NEW), `frontend/src/components/VoiceButton.tsx` (NEW)
**Sizing:** ~3-4 days.

### S.6 [M3 + M2] Outbound notification analytics

**What:** After NF.O / NF.R lands, layer an analytics view that tracks which drafts were actually sent (user opened Gmail and clicked send), which were edited before send, and how response times correlate with draft tone. Feeds back into the negotiation prompt.
**Why:** Closes the loop on whether the agent's drafts are actually useful. Without this, we're flying blind on prompt quality.
**Files:** `backend/app/services/notification_analytics.py` (NEW), `frontend/src/app/scorecard/notifications.tsx` (NEW)
**Sizing:** ~2 days for the basic dashboard; Gmail-send-detection requires Gmail webhook setup (~1 day extra).

---

# Assignment summary

| Member | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | NF | **Total** |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **M1** | 2 | 4 | 0 | 2 | 0 | 2 | **10** |
| **M2** | 4 | 1 | 1 | 2 | 0 | 5 | **13** |
| **M3** | 14 | 8 | 15 | 8 | 0 | 12 | **57** |
| **M4** | 5 | 3 | 2 | 3 | 0 | 7 | **20** |
| **M5** | 2 | 1 | 1 | 0 | 13 | 12 | **29** |
| **Total** | **27** | **17** | **19** | **15** | **13** | **38** | **129** |

Stretch goals (S.1-S.6) are not in this count -- they're aspirational and unsized
to a single owner. When pulled in, decompose into atomic `F/NF` tasks first.

**Note on M3's load:** M3 owns the DB schema, FastAPI backend, all integration
mocks, and the entire Module 4 procurement service surface (the most differentiated
module). This is intentional -- backend keystones are typically heavy in hackathon
splits. If the team has bandwidth for a 6th member, splitting M3 into "DB +
Procurement" and "Backend Core + Mocks" is the natural cut.

**Note on M5's load:** M5's Phase 1-4 tasks are mostly cross-cutting infrastructure
that's cheap individually but adds up. The Phase 5 FlowSight tasks are sequenced --
F5.1 unblocks F5.2 unblocks F5.3 etc -- so M5 should start FlowSight infrastructure
prep (canvas mount research, PixiJS familiarization) in parallel with their Phase 1-3
tasks rather than blocking on those phases completing.

## Agent Phase Implementation (Phase 1 breakdown)

Granular sub-tasks for F1.16–F1.19 + NF.P.4. Each fits in one commit.
Owner is M2. Prefix `AG`. Backend API is assumed available at `BACKEND_URL`.

### AG.1 [M2] Agent dependencies

**Status:** done
**What:** Pin `langgraph`, `langmem`, `langsmith`, `langchain-anthropic`, `httpx`, `opik`, `pydantic`, `python-dotenv`, `pymongo`, `motor` in `agent/pyproject.toml`. Bump version to `0.1.0`.
**Files:** `agent/pyproject.toml`
**Acceptance:**
- [ ] `uv sync` completes without error
- [ ] `python -c "import langgraph, langmem, opik, motor"` succeeds

### AG.2 [M2] Agent config module

**Status:** done
**What:** Implement `agent/agent/config.py` with `BACKEND_URL`, `get_model(purpose)` (`claude-sonnet-4-6` default, `claude-opus-4-7` for negotiation), LangSmith env wiring, MongoDB URL, and Opik project name.
**Files:** `agent/agent/config.py`
**Acceptance:**
- [ ] `get_model("default")` → `"claude-sonnet-4-6"`
- [ ] `get_model("negotiation")` → `"claude-opus-4-7"`
- [ ] All values overridable via env vars

### AG.3 [M2] AgentState definition

**Status:** done
**What:** Implement `agent/agent/state.py`. `AgentState` extends `MessagesState` with: `intent: str | None`, `tool_results: list[dict]`, `action_cards: list[dict]`, `facility_id: str | None`, `langsmith_run_id: str | None`.
**Files:** `agent/agent/state.py`
**Acceptance:**
- [ ] All fields default to `None` / empty list
- [ ] `langsmith_run_id` flows through the graph for audit-trail linkage

### AG.4 [M2] MongoDB prompt store

**Status:** done
**What:** Implement `agent/agent/prompts/store.py`. `PromptStore` loads prompts from MongoDB collection `prompts` by `name` field. TTL-based in-process cache (default 60 s). Falls back to the `.md` file in `agent/agent/prompts/` on first write if the document is missing.
**Files:** `agent/agent/prompts/store.py`
**Acceptance:**
- [ ] `PromptStore().get("orchestrator")` returns the prompt string
- [ ] Updating the MongoDB document is reflected within TTL seconds without restart
- [ ] If Mongo is unreachable, falls back to local `.md` file (no crash)

### AG.5 [M2] Seed default prompts to MongoDB

**Status:** done
**What:** Script `agent/agent/prompts/seed.py` reads every `.md` file in `agent/agent/prompts/` and upserts it into the `prompts` collection keyed by filename stem. Also adds `version` (int, default 1) and `updated_at` fields.
**Files:** `agent/agent/prompts/seed.py`
**Acceptance:**
- [ ] `python -m agent.prompts.seed` idempotent — re-running does not clobber manual edits (only inserts if missing)
- [ ] Each document has `name`, `body`, `version`, `updated_at`

### AG.6 [M2] Orchestrator system prompt

**Status:** done
**What:** Write production content for `agent/agent/prompts/orchestrator.md`. Cover role (BakeryPilot copilot), five specialist domains, HITL contract (never commit without action_card confirm), output format (JSON-fenced for action cards, plain markdown for narration).
**Files:** `agent/agent/prompts/orchestrator.md`
**Acceptance:**
- [ ] Mentions all five specialist domains by name
- [ ] Contains explicit HITL rule
- [ ] Under 600 tokens

### AG.7 [M2] Intent classifier prompt

**Status:** done
**What:** Write `agent/agent/prompts/intent_classifier.md`. Output must be exactly one of: `inventory`, `procurement`, `scheduler`, `yield`, `esg`, `general`. Include 2 few-shot examples per label.
**Files:** `agent/agent/prompts/intent_classifier.md`
**Acceptance:**
- [ ] 12 few-shot examples total (2 per class)
- [ ] Prompt instructs output to be the bare label with no surrounding text

### AG.8 [M2] Inventory tools

**Status:** done
**What:** Implement `query_lots(facility_id: str | None)` and `substitution_candidates(blocked_sku: str)` in `agent/agent/tools/inventory_tools.py` as `@tool`-decorated functions backed by `httpx`. Wrap each in `@opik.track`.
**Files:** `agent/agent/tools/inventory_tools.py`
**Acceptance:**
- [ ] Both tools appear as Opik spans when called
- [ ] Non-200 backend response raises `ToolException` with the HTTP status

### AG.9 [M2] Procurement tools

**Status:** done
**What:** Implement `compute_landed_cost(supplier_id, items)` and `build_order_draft(supplier_id, items, delivery_date)` in `agent/agent/tools/procurement_tools.py`. `build_order_draft` must return `{"action_card_id": str, "landed_cost_breakdown": dict}`. Wrap in `@opik.track`.
**Files:** `agent/agent/tools/procurement_tools.py`
**Acceptance:**
- [ ] `action_card_id` returned from the backend and surfaced to the caller
- [ ] Both appear as Opik spans

### AG.10 [M2] InventoryAgent subgraph

**Status:** done
**What:** Implement `InventoryAgent` in `agent/agent/agents/inventory.py` using `create_react_agent` bound to the two inventory tools. System prompt loaded from `PromptStore` at agent init.
**Files:** `agent/agent/agents/inventory.py`
**Acceptance:**
- [ ] `InventoryAgent().graph` is a compiled LangGraph runnable
- [ ] Zero-result lots return an empty list with a natural-language explanation, no exception

### AG.11 [M2] ProcurementAgent subgraph

**Status:** done
**What:** Implement `ProcurementAgent` in `agent/agent/agents/procurement.py`. After `build_order_draft` succeeds, appends the `action_card_id` to `state.action_cards` and includes the landed cost breakdown in the final message.
**Files:** `agent/agent/agents/procurement.py`
**Acceptance:**
- [ ] `state.action_cards` updated after a successful draft
- [ ] Landed cost breakdown rendered in assistant reply

### AG.12 [M2] OrchestratorAgent (intent node)

**Status:** done
**What:** Implement `classify_intent(state: AgentState) -> AgentState` in `agent/agent/agents/orchestrator.py`. Calls Claude with the intent-classifier prompt (fetched from `PromptStore`), parses the label, falls back to `"general"` on parse error.
**Files:** `agent/agent/agents/orchestrator.py`
**Acceptance:**
- [ ] Never raises — always returns a valid label
- [ ] Label is stored in `state.intent`

### AG.13 [M2] LangGraph main graph + LangMem

**Status:** done
**What:** Implement `agent/agent/graph.py`. Four nodes: `classify_intent`, `inventory_agent`, `procurement_agent`, `respond`. Wire `MemorySaver` (per-thread checkpointing) and `InMemoryStore` for LangMem cross-turn facility context. Expose `create_graph()` and `stream(message, thread_id, facility_id)` helpers.
**Files:** `agent/agent/graph.py`
**Acceptance:**
- [ ] `python -m agent.graph` sends a test message and prints the reply
- [ ] `"what can we bake?"` routes to `inventory` (assert in smoke test)
- [ ] LangSmith trace visible when `LANGCHAIN_TRACING_V2=true`
- [ ] LangMem retains `facility_id` across turns in the same thread

### AG.14 [M2] Opik tracing + evaluation

**Status:** done
**What:** Create `agent/agent/evaluation/opik_eval.py`. Register an Opik experiment with ≥5 test cases covering the six intent classes. Use `AnswerRelevance` and `Hallucination` scorers. Add `@opik.track` to `classify_intent` and each agent node in `graph.py`.
**Files:** `agent/agent/evaluation/__init__.py`, `agent/agent/evaluation/opik_eval.py`
**Acceptance:**
- [ ] `python -m agent.evaluation.opik_eval` runs and prints a score summary
- [ ] Opik dashboard shows traces with tool spans nested under agent spans
- [ ] Test dataset covers: inventory query, substitution, order draft, general, esg, scheduler

---

# Cut order if behind schedule

(Mirrors MERGED_PLAN.md lines 720-727.)

1. **Module 8 / Phase 4 finished-goods** (F4.3, F4.12, F4.15) -- not in primary demo beats
2. **Module 5 / Phase 4 yield** (F4.4, F4.5, F4.6, F4.7, F4.13) -- impressive but not critical-path
3. **Module 6 ESG PDF** (F4.10) -- keep the counter, drop the PDF
4. **OR-Tools changeover** (F2.6) -- fall back to greedy heuristic; demo looks identical
5. **Phase 3 negotiation generation** (F3.13) -- keep the triggers, drop the LLM drafting
6. **Voice input** (NF.P.2 + voice routing) -- text fallback; VoiceLog hierarchy still demoed via typed commands
7. **Multi-language** (no task yet; English only)

When cutting, also drop the corresponding NF tasks that only exist to support the
cut feature.

---

# Master task index

Every task in one row. Use Ctrl+F by ID to jump to the full description above.

| ID | Owner | Title | Status |
| :--- | :---: | :--- | :--- |
| F1.1 | M3 | Define `ingredient_lots` table | todo |
| F1.2 | M3 | Define `suppliers` table (Phase 1 columns) | todo |
| F1.3 | M3 | Define `warehouse_costs` table | todo |
| F1.4 | M3 | Define `supplier_orders` + `supplier_order_items` | todo |
| F1.5 | M3 | Define `action_cards` table | todo |
| F1.6 | M3 | Seed `facilities`, `suppliers`, `warehouse_costs` | todo |
| F1.7 | M5 | Seed 150+ ingredient lots | todo |
| F1.8 | M3 | FastAPI app entrypoint | todo |
| F1.9 | M3 | SQLAlchemy session + base | todo |
| F1.10 | M3 | `GET /api/lots` endpoint | todo |
| F1.11 | M1 | Spoilage risk score service | todo |
| F1.12 | M1 | Substitution candidates service | todo |
| F1.13 | M3 | Landed cost service | todo |
| F1.14 | M3 | `POST /api/orders/draft` endpoint | todo |
| F1.15 | M3 | `POST /api/action_cards/{id}/confirm` endpoint | todo |
| F1.16 | M2 | LangGraph orchestrator skeleton | done |
| F1.17 | M2 | InventoryAgent with 2 tools | done |
| F1.18 | M2 | ProcurementAgent with 2 tools | done |
| F1.19 | M2 | SSE chat endpoint | todo |
| F1.20 | M2+M3 | Fill in `action_card.schema.json` | todo |
| F1.21 | M3 | Fill in `ingredient_lot.schema.json` | todo |
| F1.22 | M4 | Next.js layout + globals.css | todo |
| F1.23 | M4 | `/materials` page with risk badges | todo |
| F1.24 | M4 | `ChatBox` + `ActionCard` components | todo |
| F1.25 | M4 | `/chat` page wires `ChatBox` + `ActionCard` | todo |
| F1.26 | M4 | Typed API client `lib/api.ts` | todo |
| F1.27 | M5 | Walking-skeleton e2e test | todo |
| F2.1 | M3 | Define `production_formulas` table | todo |
| F2.2 | M3 | Define `production_schedules` table | todo |
| F2.3 | M3 | Define `retailer_orders` table | todo |
| F2.4 | M3 | Define `demand_forecasts` table | todo |
| F2.5 | M1 | OR-Tools scheduler service: base structure | todo |
| F2.6 | M1 | Allergen changeover constraint | todo |
| F2.7 | M1 | Waste-first objective term | todo |
| F2.8 | M1 | Demand forecasting service (LightGBM/Prophet) | todo |
| F2.9 | M2 | SchedulerAgent with 3 tools | todo |
| F2.10 | M3 | `POST /api/retailer_orders` triggers re-schedule | todo |
| F2.11 | M3 | `GET /api/schedules/diff` endpoint | todo |
| F2.12 | M4 | `/schedule` page with diff view | todo |
| F2.13 | M4 | `ScheduleDiff` component | todo |
| F2.14 | M4 | Forecast bands chart on `/scorecard` | todo |
| F2.15 | M3 | Fill in `schedule_diff.schema.json` | todo |
| F2.16 | M3 | `mes_mock.py`: POST approved schedule | todo |
| F2.17 | M5 | Update walking-skeleton test for Phase 2 | todo |
| F3.1 | M3 | Extend `suppliers` with MOQ + window + discount tiers | todo |
| F3.2 | M3 | Define `dock_schedules` table | todo |
| F3.3 | M3 | Define `moq_tax_ledger` table (append-only) | todo |
| F3.4 | M3 | Define `disruption_signals` table | todo |
| F3.5 | M3 | Define `negotiation_drafts` table | todo |
| F3.6 | M3 | MOQ engine service | todo |
| F3.7 | M3 | Delivery window optimizer (OR-Tools) | todo |
| F3.8 | M3 | Dock schedule checker service | todo |
| F3.9 | M3 | Stock horizon service | todo |
| F3.10 | M3 | Disruption risk scoring service | todo |
| F3.11 | M3 | Contract lifecycle service (60/30-day) | todo |
| F3.12 | M3 | Payment terms optimizer | todo |
| F3.13 | M2 | Negotiation draft generation (Claude Opus) | todo |
| F3.14 | M3 | `commodity_feed.py` + `news_feed.py` mocks | todo |
| F3.15 | M5 | Redis event stream publisher | todo |
| F3.16 | M4 | `MOQTaxBadge` component | todo |
| F3.17 | M4 | `SupplierCard` with window + MOQ-tax indicators | todo |
| F3.18 | M3 | `sap_mock.py`: POST PO + confirmation | todo |
| F3.19 | M3 | Fill `supplier_order` + `negotiation_draft` schemas | todo |
| F4.1 | M3 | Define `production_runs` table | todo |
| F4.2 | M3 | Define `waste_events` table (append-only) | todo |
| F4.3 | M3 | Define `finished_goods_pallets` table | todo |
| F4.4 | M1 | Yield variance service | todo |
| F4.5 | M1 | Yield anomaly diagnosis service | todo |
| F4.6 | M3 | `cmms_mock.py`: stub work-order creation | todo |
| F4.7 | M2 | YieldAgent with 3 tools | todo |
| F4.8 | M3 | ESG aggregation (waste counter) service | todo |
| F4.9 | M3 | ESG pattern analysis | todo |
| F4.10 | M3 | Scope 3 PDF generation | todo |
| F4.11 | M2 | ESGAgent with 3 tools | todo |
| F4.12 | M3 | FEFO routing service | todo |
| F4.13 | M4 | `YieldCounter` component | todo |
| F4.14 | M4 | `/scorecard` page (full ESG view) | todo |
| F4.15 | M4 | `LotGenealogyGraph` component (react-flow) | todo |
| F5.1 | M5 | PixiJS canvas mount + pan/zoom | todo |
| F5.2 | M5 | Plant + supplier + retailer node rendering | todo |
| F5.3 | M5 | Animated truck units along edges | todo |
| F5.4 | M5 | `LayerToggle` component | todo |
| F5.5 | M5 | Risk layer (supplier halos) | todo |
| F5.6 | M5 | Yield layer (per-plant counter overlay) | todo |
| F5.7 | M5 | Shelf-life layer (pallet color overlay) | todo |
| F5.8 | M5 | Forecast layer (retailer demand) | todo |
| F5.9 | M5 | `TimeScrubber` component | todo |
| F5.10 | M5 | SSE event channel for live overlays | todo |
| F5.11 | M5 | `/facilities` page wires canvas + all layers | todo |
| F5.12 | M5 | `FactoryView` (plant-floor) variant | todo |
| F5.13 | M5 | 5-minute scripted demo runs end-to-end | todo |
| NF.S.1 | M3 | Lock JSON Schema 2020-12 across `shared/schemas/` | todo |
| NF.S.2 | M3 | Document schema-freeze policy in CONTRIBUTING.md | todo |
| NF.S.3 | M3 | Pydantic v2 strict mode for backend models | todo |
| NF.S.4 | M4 | Generate TS types from JSON Schemas | todo |
| NF.R.1 | M3 | Append-only convention triggers | todo |
| NF.R.2 | M2 | HITL gate audit (every write tool returns card id) | todo |
| NF.R.3 | M3 | Action card confirm idempotency | todo |
| NF.R.4 | M5 | Nightly green-build gate | todo |
| NF.R.5 | M3 | Gmail draft integration (no auto-send) | todo |
| NF.R.6 | M3 | `notification_drafts` audit table + endpoint | todo |
| NF.R.7 | M3 | `stakeholders` table + seed | todo |
| NF.R.8 | M2 | Stakeholder identification tool | todo |
| NF.R.9 | M2 | `notify` action card kind | todo |
| NF.R.10 | M4 | `StakeholderSelector` component | todo |
| NF.R.11 | M5 | No-direct-send lint rule | todo |
| NF.O.1 | M3 | Weekly activity aggregation service | todo |
| NF.O.2 | M2 | Weekly summary narration via Claude | todo |
| NF.O.3 | M3 | Monday scheduled job | todo |
| NF.O.4 | M3 | `weekly_summaries` table | todo |
| NF.O.5 | M4 | `/summaries` archive page | todo |
| NF.P.1 | M1 | Pin ML deps to CPU-only | todo |
| NF.P.2 | M1 | faster-whisper small model only | todo |
| NF.P.3 | M3 | FastAPI async throughout | todo |
| NF.P.4 | M2 | LLM model selection via config | done |
| NF.U.1 | M4 | SSE client with auto-reconnect | todo |
| NF.U.2 | M4 | Action card no-Enter-confirm | todo |
| NF.U.3 | M4 | Locale-aware number formatting | todo |
| NF.U.4 | M4 | Loading + empty states everywhere | todo |
| NF.D.1 | M5 | docker-compose healthchecks | todo |
| NF.D.2 | M5 | `make up.full` correct startup ordering | todo |
| NF.D.3 | M5 | Vercel deploy config for frontend | todo |
| NF.D.4 | M5 | Render deploy config for backend + agent | todo |
| NF.D.5 | M5 | Single env-var swap to real integrations | todo |
| NF.D.6 | M5 | `.env.example` covers every env var read | todo |
| NF.C.1 | M5 | Backend CI (ruff + pytest) | todo |
| NF.C.2 | M5 | Agent CI (ruff + pytest) | todo |
| NF.C.3 | M5 | Frontend CI (lint + build) | todo |
| NF.C.4 | M5 | PR template with walking-skeleton checkbox | todo |

## Agent Phase (AG series)

| ID | Owner | Title | Status |
| :--- | :---: | :--- | :--- |
| AG.1 | M2 | Agent dependencies + pyproject.toml | done |
| AG.2 | M2 | Agent config module | done |
| AG.3 | M2 | AgentState definition | done |
| AG.4 | M2 | MongoDB prompt store | done |
| AG.5 | M2 | Seed default prompts to MongoDB | done |
| AG.6 | M2 | Orchestrator system prompt | done |
| AG.7 | M2 | Intent classifier prompt | done |
| AG.8 | M2 | Inventory tools | done |
| AG.9 | M2 | Procurement tools | done |
| AG.10 | M2 | InventoryAgent subgraph | done |
| AG.11 | M2 | ProcurementAgent subgraph | done |
| AG.12 | M2 | OrchestratorAgent intent classifier | done |
| AG.13 | M2 | LangGraph main graph + LangMem | done |
| AG.14 | M2 | Opik tracing + evaluation | done |

## Stretch goals

| ID | Owner | Title | Sizing |
| :--- | :---: | :--- | :---: |
| S.1 | M4+M3 | Slack / Teams action card push | ~2-4d |
| S.2 | M4+M2 | Multi-language UI (FR + ES) | ~3d |
| S.3 | M3+M4 | Supplier portal | ~4-5d |
| S.4 | M3+M5 | Real ERP integration playbook | ~2d + 1d/integration |
| S.5 | M5+M4 | Floor-worker mobile PWA | ~3-4d |
| S.6 | M3+M2 | Outbound notification analytics | ~2-3d |
