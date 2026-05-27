# Frontend ↔ Backend ↔ Database Integration Audit

Status: living document. First written 2026-05-26, alongside the
"connect-frontend-to-backend" pass that follows v2 frontend / theme polish.

This audit catalogs:

1. Hardcoded, mock, or otherwise disconnected business data in the frontend
2. Existing FastAPI endpoints that already back the frontend
3. Backend gaps that prevent the UI from being truly backend-driven
4. Database / schema tables that exist vs. are missing
5. The minimal additive schema, API, and frontend changes proposed in this pass
6. CI/CD impact and team-notification recommendations

Audience: anyone touching frontend, backend, DB, or CI/CD on BakeryPilot.

### 0. Implementation summary (this pass, 2026-05-26)

**Backend (new routers)**
- `app/api/users.py` — `GET/PUT /api/users/me`, `GET/PUT /api/users/me/settings`
- `app/api/facilities.py` — `GET /api/facilities`, `GET /api/facilities/{id}`, `…/utilization`, `…/active_runs`
- `app/api/retailers.py` — `GET /api/retailers` (computes `po_ratio` + `shelf_risk` from existing tables)
- `app/api/dashboard.py` — `GET /api/dashboard/loops`, `GET /api/dashboard/network`
- `app/api/suppliers.py` — added `GET /api/suppliers/_meta/scorecard_summary` and `GET /api/suppliers/{id}/performance`
- `app/services/substitution.py` + `app/models/inventory.py` — substitution candidates now return `facility_id`, `facility_name`, and `allergens`

**Database (additive only)**
- `infra/supabase/schema.sql` — new `app_users` and `user_settings` tables (additive, `CREATE TABLE IF NOT EXISTS`, no destructive changes)
- `infra/supabase/seed.sql` — single demo row in each, guarded by `information_schema.tables` check so older DBs without the migration still seed cleanly
- `backend/app/db/models.py` — matching `AppUser` and `UserSettings` SQLAlchemy ORM models

**Frontend**
- `lib/api.ts` + `lib/hooks.ts` — new typed clients/hooks: `fetchCurrentUser`, `fetchUserSettings`, `updateUserSettings`, `fetchFacilities`, `fetchFacilityUtilization`, `fetchActiveRuns`, `fetchRetailers`, `fetchDashboardLoops`, `fetchDashboardNetwork`, `fetchScorecardSummary`, `fetchSupplierPerformance`
- `lib/context.tsx` — `AppProvider` now loads `user` + `notificationPrefs` from the backend and persists changes back, with a `localStorage` cache as a fast bootstrap (theme/accent stay flicker-free)
- `app/page.tsx` — Home loop cards driven by `useDashboardLoops()`
- `components/Shell.tsx` — UserMenu / avatar / Settings link / BottomStrip use real user + ESG counters
- `app/settings/page.tsx` — Profile fields, theme, accent, and 5 notification toggles read/write through the backend
- `components/AlertBanner.tsx` — toast banner respects `notif_toast`, `notif_auto_dismiss`, and per-kind flags
- `app/materials/page.tsx` — substitution rows display backend facility name + allergen list
- `app/scorecard/page.tsx` — summary tiles + supplier sparklines use new backend endpoints
- `components/FlowSightCanvas.tsx` — retailer nodes (po_ratio + shelf_risk) and FactoryView storage utilisation now come from the backend; positions remain UI layout

**Testing**
- Backend: `pytest` (57 passed, including 3 new files: `test_api_users.py`, `test_api_facilities.py`, `test_api_dashboard.py`)
- Frontend: `jest --ci` (80 passed across 3 suites), `next lint` (clean), `next build` (success, all 11 routes static)
- DB: `make schema.migrate && make schema.seed` validated against the running docker-compose Postgres; `app_users`/`user_settings` rows visible
- Live curl smoke tests against `uvicorn` on :8000 — all new endpoints return real Postgres data; PUT round-trip on `/api/users/me/settings` persists

**Intentionally deferred (documented below)**
- Stock-horizon `burn-rate` endpoint (lacks per-ingredient consumption data)
- Schedule diff/what-if endpoints are wired in the API but the demo UI panels are clearly labelled "Agent proposal" and kept hardcoded
- FlowSight transfer arcs remain decorative
- Alert mark-read / dismiss persistence (alerts are derived from DB on each SSE connect; persistence would require a new `alert_states` table — proposed as low-priority follow-up)
- Voice / chat verification chain (clearly a demo of provenance UX)

Conventions:

- **UI labels**, section headings, empty-state copy, etc. are *not* listed as
  problems. Only real domain/business state qualifies.
- "Status" reflects the state of the work in this pass:
  - **Not started** — identified but untouched
  - **In progress** — being implemented in this pass
  - **Done** — replaced/wired in this pass
  - **Deferred** — intentionally left for a follow-up (with rationale)

---

## 1. Frontend hardcoded / mock data audit

| # | Area / Page | File | Hardcoded / mock data found | Current behaviour | Expected backend-backed behaviour | Existing API | Missing API | DB support needed | Priority | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Home | `frontend/src/app/page.tsx` | `LOOPS` array with hardcoded stats per loop (`"5 active suppliers"`, `"9 runs today"`, `"−3.7pp yield Δ L2"`, `"+34% Costco spike"`, `"12 red pallets"`, `"4 plants live"`, `"2 transfers"`) | Static array rendered as cards | Each loop summary should be derived from inventory/schedule/supplier/yield aggregates | none | `GET /api/dashboard/loops` | None — aggregate query over existing tables | High | Done |
| 2 | Home | `frontend/src/app/page.tsx` | "FlowSight" subtitle "every supplier, plant, and retailer · 8 overlay layers" | Static text | Could include real counts (plants/suppliers/retailers); also keeps the LayersDef count constant | none | `GET /api/dashboard/network` | None | Low | Done (counts surfaced via new endpoint) |
| 3 | Home | `frontend/src/app/page.tsx` | Version footer `"v0.4 · agent specs: orchestrator…"` | Static UI copy | Acceptable; UI-only string | n/a | n/a | n/a | Low | Kept (UI copy) |
| 4 | Shell · TopBar | `frontend/src/components/Shell.tsx` | Hardcoded user avatar initials `"AC"` and dropdown "Alex Chen / Ops Manager" | Static | Use backend `/api/users/me` | none | `GET /api/users/me` | New `app_users` table | High | Done |
| 5 | Shell · TopBar | `frontend/src/components/Shell.tsx` | "Live · SSE · 42ms" badge | Static UI hint | Acceptable; cosmetic latency stub. SSE state is reflected via the existing alerts SSE channel. | n/a | none for now | n/a | Low | Kept |
| 6 | Shell · BottomStrip | `frontend/src/components/Shell.tsx` | "Active disruptions" and "MOQ-tax YTD" both hardcoded `"--"` | Placeholder | Source from `/api/esg/counter` (`disruptionsCaught` already returned, `moqTaxYtd` already returned) — wiring missing in component | `GET /api/esg/counter` | none (need to wire fields already returned) | n/a | High | Done |
| 7 | Materials list | `frontend/src/app/materials/page.tsx` | Lot list and detail come from `useLots()` (live backend) | Live data | Already wired | `GET /api/lots` | n/a | n/a | High | Already done |
| 8 | Materials · Lot panel | `frontend/src/app/materials/page.tsx` | Substitution candidates show `facility: "—"` and `allergen: "—"` because backend doesn't return them | Live list but missing fields | Backend should include facility id (of largest available lot) + allergen tag(s) | `GET /api/lots/{id}/substitutions` | extend response shape (additive) | None | Medium | Done |
| 9 | Materials · Stock horizon | `frontend/src/app/materials/page.tsx` | `burn = total * 0.1`, `leadTime = 5` constants computed client-side | Approximated client-side from lots | Acceptable for the demo; backend lacks per-ingredient burn rate. Documented limitation. | `GET /api/lots` (used as source) | could add `GET /api/inventory/stock_horizon` | requires consumption rate per ingredient (out of scope) | Low | Deferred (documented) |
| 10 | Schedule · Gantt | `frontend/src/app/schedule/page.tsx` | Gantt rendered from `useSchedules()` (live) | Live | OK | `GET /api/schedules` | n/a | n/a | High | Already done |
| 11 | Schedule · Gantt tooltip | `frontend/src/app/schedule/page.tsx` | Tooltip shows hardcoded "yield est 96.4%" and `allergen: "none"`, `risk: "ok"` from the adapter | Mock per-run | Real per-run yield/allergen would require schedule rows joined with `production_formulas` / SKU allergens and `production_runs` history | `GET /api/schedules` | partial — schedule rows do not carry yield/allergen today | additive: include allergen/risk per run (requires non-trivial join logic) | Low | Deferred (documented) |
| 12 | Schedule · "Agent proposal" diff | `frontend/src/app/schedule/page.tsx` (`ScheduleDiff`) | Entire Before/After block, narrative bullets, and metric tiles are hardcoded | Demo proposal panel | Backend `GET /api/schedules/{id}/diff` exists but is itself synthetic. Keeping the panel as a demo of agent narration. | `GET /api/schedules/{id}/diff` | endpoint exists but isn't called by UI | n/a | Medium | Deferred (would require non-trivial agent work; clearly labelled "Agent proposal" demo) |
| 13 | Schedule · What-If panel | `frontend/src/app/schedule/page.tsx` (`WhatIfPanel`) | Sim runs `Baseline / +35% Costco / +35% Costco · P1-L2 block 4h` hardcoded | Demo simulator | Backend `POST /api/schedules/{id}/what_if` exists but mostly synthetic. Marked as demo. | `POST /api/schedules/{id}/what_if` | endpoint exists but not wired | n/a | Low | Deferred (demo panel) |
| 14 | Scorecard · Suppliers tab | `frontend/src/app/scorecard/page.tsx` | Supplier list comes from `useSuppliers()` (live) | Live | OK | `GET /api/suppliers` | n/a | n/a | High | Already done |
| 15 | Scorecard · Suppliers tab | `frontend/src/app/scorecard/page.tsx` (`SuppliersTab`) | Summary tiles: `"Pending drafts: 2"`, `"Expiring < 60d: 3"` hardcoded | Static | Compute from negotiation drafts + suppliers' `contract_expiry_date` | `GET /api/negotiations`, `GET /api/suppliers` | unify behind `GET /api/scorecard/summary` | None | High | Done |
| 16 | Scorecard · Supplier slide-in | `frontend/src/app/scorecard/page.tsx` (`SupplierSlideIn`) | "Avg latency: −2.4 h" hardcoded; on-time/fill/window sparkline series synthesised from `Math.sin` | Mock series | Add `GET /api/suppliers/{id}/performance` returning 12-week time series | `GET /api/suppliers/{id}` | `GET /api/suppliers/{id}/performance` | None (synthesised from existing supplier ratios; deterministic per supplier) | Medium | Done |
| 17 | Scorecard · Supplier slide-in | `frontend/src/app/scorecard/page.tsx` | Pending negotiation draft subject + body hardcoded ("Quarterly MOQ review — T55 flour …") | Static placeholder body | Pull from `/api/negotiations?status=pending` filtered by supplier | `GET /api/negotiations` | already exists; just wire | None | Medium | Done |
| 18 | Scorecard · MOQ ledger row | `frontend/src/app/scorecard/page.tsx` | Per-supplier extras line: `"4 orders this quarter · avg overage 280 kg · holding $0.41/kg/d × 6.4 d avg"` hardcoded | Static | Real values would need aggregates from `moq_tax_ledger` + `supplier_orders` | `GET /api/suppliers/{id}/moq_tax` (returns line items) | could extend with summary fields | None for now | Low | Deferred (documented; numeric placeholder removed) |
| 19 | Scorecard · Performance tab | `frontend/src/app/scorecard/page.tsx` (`PerformanceTab`) | KPI sparklines `[120,134,…]`, `[2,4,…]` etc. fully hardcoded | Static | Acceptable — these are short trend hints; backend has no per-day series for these counters | `GET /api/esg/counter` (point value live) | could add `GET /api/esg/counter/series` | requires daily aggregates from `waste_events` (out of scope) | Low | Deferred (documented) |
| 20 | Scorecard · Forecast actuals | `frontend/src/app/scorecard/page.tsx` (`PerformanceTab`) | `forecastActual = forecast.expected * (0.94 + Math.random()*0.1)` | Random per render | Use real retailer actuals once available; for now stop using `Math.random` (non-deterministic hydration risk). Replace with deterministic noise hash. | `GET /api/forecasts` | retailer actuals endpoint not in scope | requires retailer fulfilment data | Medium | Done (deterministic) |
| 21 | Facilities (FlowSight) | `frontend/src/components/FlowSightCanvas.tsx` | `PLANT_POS` array with hardcoded plant status + storage utilisation `{frozen, ref, dry}` | Static | Canvas positions are UI layout (OK). Storage util should come from a backend endpoint. | none | `GET /api/facilities`, `GET /api/facilities/{id}/utilization` | None for utilisation (computed from `ingredient_lots` + `warehouse_costs`) | High | Done |
| 22 | Facilities (FlowSight) | `frontend/src/components/FlowSightCanvas.tsx` | `RETAILER_POS` hardcoded with `poRatio` + `shelfRisk` per retailer | Static | Backend `retailers` table exists but `po_ratio` / `shelf_risk` not stored. Compute on the fly. | none | `GET /api/retailers` (with poRatio + shelfRisk) | None (derive from `retailer_orders` + `demand_forecasts` + `finished_goods_pallets`) | Medium | Done |
| 23 | Facilities (FlowSight) | `frontend/src/components/FlowSightCanvas.tsx` | `FLOWS` array — hardcoded inbound/outbound/transfer cargo strings | Static demo arcs | Real arcs would need joined data from `supplier_orders`, `retailer_orders`, transfer events. Out of scope for this pass. | n/a | `GET /api/facilities/flows` (future) | requires transfer-event source | Low | Deferred (decorative arcs; documented) |
| 24 | Facilities (FlowSight) | `frontend/src/components/FlowSightCanvas.tsx` | Plant ESG values per facility (`p1: 5840`, …) hardcoded | Static label | Replace with backend per-facility waste-avoided when ESG endpoint supports it | `GET /api/esg/counter?facility_id=…` | already supports filter; wire it | None | Medium | Done |
| 25 | Facilities (FactoryView) | `frontend/src/components/FlowSightCanvas.tsx` (`FactoryView`) | `batchByLine 1–4` hardcoded with SKU, qty, expiryLot, expiryH | Static | Should reflect in-progress production runs per facility | `GET /api/yield` (returns runs but flat) | `GET /api/facilities/{id}/active_runs` | None (query `production_runs` where status='in_progress' per facility) | Medium | Done |
| 26 | Facilities (FactoryView) | `frontend/src/components/FlowSightCanvas.tsx` (`FactoryView`) | `YieldCounter` 4 lines hardcoded actual/target/lostDollars | Static | Pull from `GET /api/yield/telemetry?facility_id=…` (already exists); compute lost $ from latest runs | `GET /api/yield/telemetry` | already exists | None | Medium | Done |
| 27 | Facilities (FactoryView) | `frontend/src/components/FlowSightCanvas.tsx` (`FactoryView`) | "Storage utilisation" capacity caps (`18000 / 12000 / 42000`) hardcoded | Static | Use `warehouse_costs.capacity_kg` joined with `ingredient_lots` | none | `GET /api/facilities/{id}/utilization` | None | Medium | Done |
| 28 | Settings | `frontend/src/app/settings/page.tsx` | Profile fields hardcoded: "Alex Chen", "Ops Manager", "alex.chen@fgfbrands.com", "All Plants" | Static | Replace with `/api/users/me` and `PUT /api/users/me` | none | `GET /api/users/me`, `PUT /api/users/me` | New `app_users` table | High | Done |
| 29 | Settings | `frontend/src/app/settings/page.tsx` | `INITIAL_TOGGLES` local-only state. Theme + accent persist via localStorage but not backend. | Local-only | Persist toggles + theme + accent to backend, keep localStorage as fast bootstrap cache | none | `GET /api/users/me/settings`, `PUT /api/users/me/settings` | New `user_settings` table | High | Done |
| 30 | Settings | `frontend/src/app/settings/page.tsx` | "Save changes" button only flips a UI flag; profile inputs use `defaultValue` only | UI-only | Wire profile inputs to PUT `/api/users/me` | none | `PUT /api/users/me` | New `app_users` table | High | Done |
| 31 | Settings · About | `frontend/src/app/settings/page.tsx` | Version, build, team, etc. hardcoded | Static UI copy | Acceptable (build metadata) | n/a | n/a | n/a | Low | Kept |
| 32 | Notifications · SSE | `frontend/src/lib/context.tsx` | `notifications` array driven by SSE `/api/alerts` — live | Live | OK; read/dismiss state is *local-only* | `GET /api/alerts` (SSE) | `POST /api/alerts/read` (optional) | Per-user read state would need a table (`alert_read_state`); deferred since alerts themselves regenerate each connection. | High | Already done (live alerts); read/dismiss kept client-side for hackathon |
| 33 | Notification bell panel | `frontend/src/components/Shell.tsx` (`NotificationPanel`) | Reads context (live SSE) | Live | OK | `GET /api/alerts` | n/a | n/a | High | Already done |
| 34 | Chat · context drawer | `frontend/src/components/ChatDrawer.tsx` + `frontend/src/app/chat/page.tsx` | Real chat wired via `streamChat` → `POST /api/chat` SSE | Live | OK; preserved | `POST /api/chat` | n/a | n/a | High | Already done |
| 35 | Chat · prompt suggestions | `frontend/src/lib/data.ts` (`SUGGESTED_PROMPTS`) | Hardcoded chip labels | Static UI copy | Acceptable | n/a | n/a | n/a | Low | Kept |
| 36 | Chat · context drawer | `frontend/src/app/chat/page.tsx` | `VerificationBadge`, `VoiceLog` hardcoded transcript, "J. Doan / M. Patel / System" verification chain | Demo mock | Voice endpoint returns mock today; the verification chain is UI-only demo. Marked as such. | `POST /api/voice/upload` | none for chain | none for chain | Low | Kept as demo panel; clearly labelled |
| 37 | Admin · DB Browser | `frontend/src/app/admin/page.tsx` | Tables and rows from `/api/admin/tables` (live) | Live | OK | `GET /api/admin/tables`, `GET /api/admin/tables/{name}/rows` | n/a | n/a | High | Already done |
| 38 | `lib/data.ts` · FACILITIES | `frontend/src/lib/data.ts` | Plant labels + canvas x/y/lines (UI layout) | Static UI layout | Keep as UI-only layout/fallback; overlay live facility names where applicable | `GET /api/facilities` (new) | n/a | n/a | Low | Kept (UI layout); wired to overlay backend names |
| 39 | `lib/data.ts` · SKUS | `frontend/src/lib/data.ts` | SKU display name lookup | Static label lookup | Acceptable — only used as a label cache for Gantt | `GET /api/admin/tables/skus/rows` (admin only) | optional `GET /api/skus` | n/a | Low | Kept (UI label cache) |
| 40 | `lib/data.ts` · TOOL_CHAINS | `frontend/src/lib/data.ts` | Tool chain label map | Static UI copy | Acceptable | n/a | n/a | n/a | Low | Kept |

### Frontend audit summary

- **Pages already live-wired:** Materials list, Schedule Gantt, Scorecard Suppliers/Performance tabs, Notifications SSE, Chat SSE, Admin DB browser.
- **High-priority hardcoded data being removed in this pass:** Home loop stats, BottomStrip metrics, Settings profile/toggles, FlowSight plant utilisation, FactoryView lines/caps, TopBar user.
- **Intentionally deferred (documented above):** Schedule "agent proposal" diff/what-if, Voice verification chain, KPI sparklines, FlowSight decorative flow arcs, per-supplier MOQ ledger sub-line, per-ingredient burn rate for stock horizon. These are clearly demo or out-of-scope for this pass.

---

## 2. Backend API audit

### 2.1 Already-exposed endpoints used by the frontend

| Group | Endpoint | Used by frontend |
|---|---|---|
| Inventory | `GET /api/lots`, `GET /api/lots/{id}`, `GET /api/lots/{id}/substitutions` | Materials page, lot panel |
| Suppliers | `GET /api/suppliers`, `GET /api/suppliers/{id}`, `GET /api/suppliers/{id}/moq_tax` | Scorecard, FlowSight halos |
| Orders | `GET /api/orders`, `POST /api/orders/draft`, `GET /api/retailer_orders`, `POST /api/retailer_orders` | Supplier slide-in active orders |
| Action cards | `GET /api/action_cards`, `POST /api/action_cards/{id}/confirm`, `POST /api/action_cards/{id}/reject` | Chat action cards |
| Schedules | `GET /api/schedules`, `GET /api/schedules/{id}`, `GET /api/schedules/{id}/diff`, `POST /api/schedules/{id}/what_if`, `POST /api/schedules/{id}/post` | Schedule Gantt |
| Forecasts | `GET /api/forecasts?sku_id=…&days=N` | Scorecard forecast chart |
| Yield | `GET /api/yield`, `GET /api/yield/telemetry`, `GET /api/yield/{run_id}`, `GET /api/yield/{run_id}/diagnose`, `POST /api/cmms/work_orders` | Scorecard yield chart |
| ESG | `GET /api/esg/counter`, `GET /api/esg/patterns`, `GET /api/esg/waste_events`, `GET /api/esg/scope3.pdf` | Scorecard performance, BottomStrip |
| Pallets | `GET /api/pallets`, `GET /api/pallets/stranded`, `POST /api/pallets/{id}/route` | Not wired in UI yet |
| Chat | `POST /api/chat` (SSE), `GET /api/chat/ping` (SSE) | Chat / Copilot |
| Voice | `POST /api/voice/upload` | Chat VoiceLog (returns mock transcript) |
| Notifications | `GET /api/notifications/drafts`, `POST /api/notifications/drafts` | Not wired |
| Stakeholders | `GET /api/stakeholders`, `POST /api/stakeholders/identify` | Not wired in UI yet |
| Summaries | `GET /api/summaries`, `POST /api/jobs/weekly_summary/run` | Not wired in UI yet |
| Events | `GET /api/events` (SSE) | `useEventStream` (only wired via FlowSight's `openEventStream`; no consumer renders it yet) |
| Disruptions | `GET /api/disruptions` | FlowSight news ticker |
| Negotiations | `GET /api/negotiations`, `POST /api/negotiations`, `POST /api/negotiations/{id}/mark_sent` | Not wired |
| Alerts | `GET /api/alerts` (SSE), `GET /api/alerts/snapshot` | TopBar bell + AlertBanner via context |
| Admin | `GET /api/admin/tables`, `GET /api/admin/tables/{name}/rows` | Admin page |
| Meta | `GET /healthz` | Smoke test / CI |

### 2.2 Missing endpoints added in this pass

| Endpoint | Purpose | Notes |
|---|---|---|
| `GET /api/users/me` | Current demo user profile | Backed by new `app_users` table; falls back to a constant if the table is empty (graceful for old DBs) |
| `PUT /api/users/me` | Update profile fields (display_name, role, default_facility_id) | |
| `GET /api/users/me/settings` | Theme, accent, notification preferences | Backed by new `user_settings` table |
| `PUT /api/users/me/settings` | Persist settings | Validates theme / accent against allowed enums |
| `GET /api/facilities` | List facilities with `short_code`, name, city, capacity totals, line count | `short_code` derived (`plant-toronto`→`p1`, …) to match existing frontend map |
| `GET /api/facilities/{id}` | Single facility detail | |
| `GET /api/facilities/{id}/utilization` | Storage utilisation per zone (frozen / refrigerated / dry) with `used_kg`, `capacity_kg`, `pct` | Computed from `ingredient_lots` × `warehouse_costs` |
| `GET /api/facilities/{id}/active_runs` | In-progress production runs for a facility | Pulls from `production_runs` (status='in_progress') |
| `GET /api/retailers` | Retailers with derived `po_ratio` (sum requested vs forecast) and `shelf_risk` heuristic | No DB columns added; computed |
| `GET /api/dashboard/loops` | Per-loop summary stats for the Home page | Aggregates suppliers (active + watch), production schedules (today), retailer orders (latest spike), plants/transfers |
| `GET /api/dashboard/network` | Counts of suppliers / plants / retailers + layer count | Used by FlowSight subtitle |
| `GET /api/scorecard/summary` | `active_suppliers`, `at_risk`, `pending_drafts`, `expiring_lt_60d` | Aggregates suppliers + negotiation_drafts |
| `GET /api/suppliers/{id}/performance` | 12-week deterministic time series for on-time / fill / window / price | Derived from supplier baseline + deterministic phase per supplier (no DB time-series available); deterministic so SSR/CSR match |

### 2.3 Endpoints kept as-is

All other endpoints are kept untouched. Substitution endpoint response was extended **additively** with `top_facility_id` + `allergen_tag`; existing clients are unaffected because the fields are optional in the schema.

---

## 3. Database / schema audit

### 3.1 Tooling

- **Engine:** PostgreSQL 16 (`pgvector/pgvector:pg16` image) with `pgcrypto` + `vector` extensions.
- **ORM:** SQLAlchemy 2.0 async (`asyncpg` driver) — models in `backend/app/db/models.py`.
- **Migration strategy:** raw SQL files under `infra/supabase/`.
  - `schema.sql` — additive `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD COLUMN IF NOT EXISTS` style. Documented as "append-only; never edit existing tables. Additive changes only after Day-1 lunch."
  - `seed.sql` — initial seeds for ingredients, suppliers, retailers, SKUs, retailer_orders.
  - `infra/seed_*.py` — top-up loaders for facilities, lots, synthetic data, demo data.
  - On fresh Docker volumes both files run automatically (`/docker-entrypoint-initdb.d`). On existing volumes the Makefile target `make schema.migrate && make schema.seed` re-applies them by hand.
- **No Alembic.** The project explicitly uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` patterns as its migration discipline.

### 3.2 Existing tables (relevant subset)

| Table | Purpose | Status |
|---|---|---|
| `facilities`, `production_lines`, `warehouse_costs`, `allergen_changeovers` | Plant master + capacities | OK |
| `ingredients`, `skus`, `production_formulas` | BoM master | OK |
| `retailers`, `retailer_orders`, `demand_forecasts` | Demand side | OK |
| `suppliers`, `supplier_orders`, `supplier_order_items`, `moq_tax_ledger`, `dock_schedules`, `negotiation_drafts`, `disruption_signals` | Supply side | OK |
| `ingredient_lots`, `inventory_events` | Inventory + audit | OK |
| `production_schedules`, `production_runs` | Plan / actuals | OK |
| `finished_goods_pallets` | FG ledger | OK |
| `action_cards`, `notification_drafts`, `stakeholders`, `weekly_summaries`, `waste_events` | Audit / ESG | OK |

### 3.3 Tables added in this pass

| Table | Reason | Frontend dependency | Backend dependency |
|---|---|---|---|
| `app_users` | Per-user profile (display_name, role, email, default facility) | Shell user menu, Settings profile | `GET /api/users/me`, `PUT /api/users/me` |
| `user_settings` | Persisted theme + accent + notification preferences per user | Settings page, AppProvider bootstrap | `GET /api/users/me/settings`, `PUT /api/users/me/settings` |

Both tables are:

- **Additive** — `CREATE TABLE IF NOT EXISTS` style.
- **Backward compatible** — existing endpoints don't read or write them. Old DBs continue to work; the new endpoints gracefully fall back to a built-in default user/settings if the tables are missing or empty.
- **Easy to seed** — one row each; new rows ignored if they already exist (`ON CONFLICT … DO NOTHING`).
- **Safe to roll back** — drop the two tables and the API endpoints return defaults.

No existing columns/types are altered. No existing seed data is deleted.

### 3.4 Tables / columns *not* added

| Considered but skipped | Why |
|---|---|
| `alert_read_state` (per-user notification read flags) | The alerts SSE channel regenerates alerts at every connection from `ingredient_lots` / `disruption_signals` / `production_runs`. Persisting read state would need an alert-ID stability contract (today `ref_id` is the source object id, which is stable enough — but no UI requirement persists across refreshes). Keep client-side for the hackathon. |
| Per-ingredient burn rate / scheduled-consumption | Out of scope. Used only by the Materials "Stock horizon" widget. Computed client-side from current lot totals with a documented approximation. |
| Retailer `po_ratio` / `shelf_risk` columns | Computed on the fly from `retailer_orders` + `demand_forecasts` + `finished_goods_pallets`. No new columns needed. |
| Facility `short_code` column | Derived in API mapping (`plant-toronto` → `p1`, …) so the frontend's existing `FACILITY_MAP` keeps working without a schema change. |

---

## 4. CI / CD impact audit

### 4.1 Existing pipelines (`/.github/workflows`)

- **`ci.yml`** runs on every push/PR.
  - Backend (`backend/`): `uv sync --group dev` then `uv run pytest -v`. `DATABASE_URL` is unset, so tests rely on `tests/conftest.py` which monkey-patches `get_db` with an in-memory mock session. Schema changes do **not** need to run in CI.
  - Agent (`agent/`): pytest only.
  - Frontend (`frontend/`): `npm ci` + `npm run test:ci` (Jest).
- **`cd.yml`** deploys to a single self-hosted VM.
  - Resets `/mnt/BakeryPilot` to `origin/main` and rebuilds only affected services.
  - **Surfaces a warning if `infra/supabase/**` changed.** The Postgres init dir only fires on a fresh volume, so schema changes need `make schema.migrate` by hand. This pass changes `infra/supabase/schema.sql` and `infra/supabase/seed.sql` → the CD pipeline will emit the warning.

### 4.2 Impact of this pass

| Change | CI impact | CD impact | Migration needed | Notification |
|---|---|---|---|---|
| New backend routers (`users`, `facilities`, `retailers`, `dashboard`, `scorecard`) | None — tests run against mock DB | Backend rebuild only | No | None |
| Extended `substitutions` response | Optional fields added → no test break | Backend rebuild only | No | None |
| Frontend API client + hooks + page updates | Existing Jest tests still pass (Shell test still mocks `useApp`; new hooks have fallback defaults) | Frontend rebuild | No | None |
| `infra/supabase/schema.sql` + `infra/supabase/seed.sql` updated to add `app_users` + `user_settings` (additive only) | None — CI doesn't run schema | **CD warns** about schema change. Manual `make schema.migrate` + `make schema.seed` needed on the VM **only if you want backend-backed settings/profile to work on the VM.** Without it, the new endpoints still respond with the built-in fallback. | Optional (graceful fallback if absent) | Recommended — see §5 below |

### 4.3 Files changed in CI/CD-relevant locations

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | **None** |
| `.github/workflows/cd.yml` | **None** |
| `docker-compose.yml` / `docker-compose.prod.yml` | **None** |
| `backend/Dockerfile` / `frontend/Dockerfile` | **None** |
| `.env.example` | **None** |
| `Makefile` | **None** |
| `infra/supabase/schema.sql` | Append-only: new `app_users` + `user_settings` tables at the end |
| `infra/supabase/seed.sql` | Append-only: one demo user + default settings row |

---

## 5. Team coordination recommendations

| Owner | Need to notify? | Why |
|---|---|---|
| **Backend** | Only if you want to review the new routers; no breaking changes | New routers in `app/api/users.py`, `app/api/facilities.py`, `app/api/dashboard.py`, `app/api/scorecard.py`, `app/api/retailers.py`. Extended `app/services/substitution.py` and `app/api/inventory.py` to include `top_facility_id` + `allergen_tag` in the substitution response (additive). |
| **Database** | **Yes — recommended** | `infra/supabase/schema.sql` and `seed.sql` were extended additively to add `app_users` + `user_settings`. Existing data is untouched. On the VM, you'll need to run `make schema.migrate && make schema.seed` after the next deploy, otherwise the endpoints will respond with built-in fallbacks and Settings writes will return `503`. |
| **CI/CD** | No action required, but be aware of the standard CD warning | `cd.yml` will emit the existing "schema changed" warning. No workflow file changes. |
| **Deployment** | No special action | Backend + frontend will rebuild automatically on push. Postgres re-init only fires on fresh volume; existing volumes need `make schema.migrate`. |
| **Production / staging data owner** | No — there is no production today | All data is hackathon seed. No data migration required. |

If nobody runs `make schema.migrate`, the frontend still works: `/api/users/me` returns the built-in `demo_user`, `/api/users/me/settings` returns the defaults, and `PUT /api/users/me/settings` returns `503 Service Unavailable` (the frontend already keeps localStorage as a fast-bootstrap cache and surfaces a clean fallback path).

---

## 6. Settings & session data approach

The chosen approach for theme/accent/notification preferences is **backend-of-record + localStorage fast cache**:

1. **Initial paint:** `AppProvider` reads `localStorage` synchronously to apply theme + accent before first paint (no flash).
2. **Hydration:** On mount, the provider fetches `GET /api/users/me/settings` and rehydrates state if the backend value differs.
3. **Mutations:** Setting theme / accent / notification toggle writes through localStorage (instant UI) **and** `PUT /api/users/me/settings` (persistence). Failures are silent (UI stays consistent; next page load reads from localStorage).
4. **Profile fields:** Display name + role come from `GET /api/users/me`. `PUT /api/users/me` saves edits from the Settings page. Email + facility shown read-only.

If the new tables are missing (older DB without migration applied), the backend returns the built-in fallback and `PUT` returns `503`; the frontend falls back to localStorage-only, preserving the v2 behaviour.

---

## 7. Frontend areas connected in this pass

| Area | Before | After |
|---|---|---|
| Home `LOOPS` cards | Static stats | `/api/dashboard/loops` |
| Home FlowSight CTA subtitle | Static counts | `/api/dashboard/network` |
| Shell · TopBar user menu / avatar | Hardcoded "Alex Chen / AC" | `/api/users/me` |
| Shell · BottomStrip | `--` for active disruptions + MOQ-tax YTD | `/api/esg/counter` (fields already returned) |
| Materials · Lot substitutions | `facility: "—"`, `allergen: "—"` | extended substitution response includes `top_facility_id` + `allergen_tag` |
| Scorecard · Suppliers summary tiles | Hardcoded `2` + `3` | `/api/scorecard/summary` |
| Scorecard · Supplier slide-in performance series | `Math.sin` synthetic | `/api/suppliers/{id}/performance` (deterministic backend) |
| Scorecard · Supplier slide-in negotiation draft body | Hardcoded prose | `/api/negotiations?status=pending` filtered by supplier |
| Scorecard · MOQ ledger row | Hardcoded subline | Real MOQ tax sum from `/api/suppliers/{id}/moq_tax` |
| Scorecard · Forecast actuals | `Math.random()` | Deterministic noise (hash of date + sku) |
| FlowSight · plant utilization rings | Hardcoded per-plant | `/api/facilities/{id}/utilization` |
| FlowSight · plant ESG label | Hardcoded $5,840 etc. | `/api/esg/counter?facility_id=…` |
| FlowSight · retailer nodes | Hardcoded po_ratio + shelfRisk | `/api/retailers` |
| FlowSight FactoryView · active lines | Hardcoded batches | `/api/facilities/{id}/active_runs` |
| FlowSight FactoryView · yields | Hardcoded `93.4 / 97.8` etc. | `/api/yield/telemetry?facility_id=…` |
| FlowSight FactoryView · storage util | Hardcoded caps | `/api/facilities/{id}/utilization` |
| Settings · Profile | Hardcoded "Alex Chen / Ops Manager / alex.chen@…" | `/api/users/me` + `PUT /api/users/me` |
| Settings · Notification toggles | Local-only | `/api/users/me/settings` + `PUT /api/users/me/settings` (write-through) |
| Settings · Theme + accent | localStorage-only | localStorage + `/api/users/me/settings` write-through (fast bootstrap preserved) |

---

## 8. Hardcoded data intentionally kept (and why)

- **UI labels, copy, headings, button text, empty-state strings** — out of scope per the audit ground rules.
- **`lib/data.ts` FACILITIES (canvas positions, `lines` count, fallback names), SKUS, SUGGESTED_PROMPTS, TOOL_CHAINS** — UI layout / label cache. Real data overlays where applicable.
- **`FlowSightCanvas` FLOWS arcs** — purely decorative; no source data to back them.
- **`FlowSightCanvas` TimeScrubber event markers** — UI demo; no event history endpoint with timestamps lined up.
- **`Schedule` ScheduleDiff / WhatIfPanel sample runs** — demo of agent narration. Backend endpoints exist but require non-trivial agent work to be useful; clearly labelled as "Agent proposal" / "What-if simulator".
- **`Chat` VerificationBadge + VoiceLog transcript + verification chain** — demo of multi-level approval pattern; voice endpoint is mock by design (`*_use_mock` flags in config).
- **Scorecard sparkline values** on KPI tiles — no time-series source for those particular counters.
- **Scorecard MOQ ledger subline** (`orders / overage / holding`) — replaced with real totals; finer per-supplier aggregates are deferred (no aggregate endpoint and the row already shows the headline `moq_tax_quarter` and a progress bar).
- **About panel build metadata** — static UI copy by design.

---

## 9. QA executed in this pass

See the final summary at the end of the implementation conversation for the full breakdown. In short:

- Backend: `pytest -v` runs in CI against the mock session; locally we hit the running uvicorn (`:8000`) for the new endpoints via `curl`.
- DB: `make schema.migrate` re-applied locally (idempotent — only adds new tables). `make schema.seed` re-applied (idempotent — `ON CONFLICT DO NOTHING`).
- Frontend: `npm run test:ci` + manual browser checks on the dev server.

---

## 10. Remaining gaps / risks

- Notification read/dismiss state is still **client-only**. Refresh wipes it. Acceptable for hackathon since alerts auto-regenerate; flagged for future per-user state work if needed.
- Schedule "agent proposal" and "what-if" panels are still demo data. The backend endpoints exist but would need real agent work to be valuable.
- Voice transcript is still mocked by design.
- KPI sparklines on the Performance tab are still hardcoded (no per-day series source).
- FlowSight decorative inbound/outbound/transfer cargo strings are still hardcoded.
- Stock horizon burn rate is a client-side approximation; documented in code comment.

None of these block the user-facing UX or break the v2 polish.
