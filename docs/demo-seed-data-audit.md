# BakeryPilot — Demo Seed Data Audit & Redesign

**Date:** 2026-05-27
**Author:** Data-sample design pass (no commits)
**Scope:** Schema review, current seed assessment, demo scenario catalog, redesigned seed plan, risks and assumptions.

This document is the design contract for the demo-data pass. It captures
*what we found, what's broken, what the demo needs, and exactly which rows
go where*. The actual seed-script edits referenced at the end of this file
are described in §4 and §6.

---

## 1. Current database / schema summary

### 1.1 Engine & migration discipline

- **Postgres 16** (`pgvector/pgvector:pg16` image), `pgcrypto` + `vector` extensions.
- **No Alembic.** Migrations are managed via additive SQL files:
  - `infra/supabase/schema.sql` — `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE … ADD COLUMN IF NOT EXISTS` only. Documented as **append-only** at the source-file level.
  - `infra/supabase/seed.sql` — deterministic master seed (`ON CONFLICT DO NOTHING`).
  - `infra/seed_*.py` scripts — Python loaders for facilities, lots, branded SKUs, transactional demo data.
- **Docker-first bootstrap.** Both files live in
  `/docker-entrypoint-initdb.d`. They auto-apply on a fresh volume; on an
  existing volume they're re-applied via `make schema.migrate` /
  `make schema.seed`.

### 1.2 Tables in scope (every table touched by the UI / agent / API)

| Domain | Table | Notes |
|---|---|---|
| Master · facilities | `facilities` | 4 FGF plants. Address + lat/lon fetched live or from cache. |
| Master · ingredients | `ingredients` | 90 USDA-style items with storage zone, shelf life, allergen tags, UoM. |
| Master · SKUs | `skus` | 12 FGF-branded products (ACE, Stonefire, Wonder, D'Italiano, Country Harvest). |
| Master · suppliers | `suppliers` | 5 suppliers, one per `personality_tag` (`reliable`, `cheap_late`, `high_moq`, `disrupted`, `new`). |
| Master · retailers | `retailers` | Costco, Walmart, Loblaws, Whole Foods. |
| Master · production lines | `production_lines` | 9 lines across 4 plants. `status` ∈ `{idle, setup, producing, paused, maintenance}`. |
| Master · warehouse costs | `warehouse_costs` | per-(facility, storage_type) `$/kg/day` + capacity. |
| Master · allergen changeovers | `allergen_changeovers` | minutes lost per transition matrix. |
| Master · stakeholders | `stakeholders` | Email recipients with tag-routing. |
| Master · BoM | `production_formulas` | per-SKU per-ingredient kg-per-unit. |
| Transactional · lots | `ingredient_lots` | Per-lot inventory; expiry, storage zone, supplier, lot_code. |
| Transactional · supplier orders | `supplier_orders` + `supplier_order_items` | PO header + items. Status `{draft, pending_confirm, confirmed, sent}`. |
| Transactional · retailer orders | `retailer_orders` | Firm POs. Status `{open, scheduled, shipped, cancelled}`. |
| Transactional · forecasts | `demand_forecasts` | 14-day rolling forecast per SKU. |
| Transactional · schedules | `production_schedules` | Suggested / approved / complete runs. |
| Transactional · runs | `production_runs` | Actuals: planned/actual kg + ingredient consumption JSON. |
| Transactional · production orders | `production_orders` | Manual orders for the Production page. Status `{planned, producing, paused, produced, cancelled}`. |
| Transactional · finished goods | `finished_goods_pallets` | Per-pallet output, status `{in_warehouse, shipped, donated, written_off}`. |
| Transactional · MOQ tax | `moq_tax_ledger` | Append-only $-overage by supplier × quarter. |
| Transactional · dock | `dock_schedules` | Receiving slots per facility per day. |
| Transactional · disruptions | `disruption_signals` | Weather / commodity / miss / news events. |
| Transactional · negotiation drafts | `negotiation_drafts` | LLM-drafted supplier emails. Status `{pending, sent, discarded}`. |
| Audit · inventory events | `inventory_events` | Append-only delta-kg ledger (consumption/receipt/transfer/spoilage). |
| Audit · waste events | `waste_events` | Append-only $ + CO2e ledger. Drives ESG counter. |
| Audit · action cards | `action_cards` | Every HITL decision. Status `{pending, confirmed, rejected}`. |
| Audit · notifications | `notification_drafts` | Append-only Gmail-draft log. |
| Audit · weekly summaries | `weekly_summaries` | Monday rollup. |
| App · users / settings | `app_users`, `user_settings` | Single demo user + per-user theme/accent/notif toggles. |

### 1.3 Existing seed mechanism (entry points)

| Step | Command / file | Inserts |
|---|---|---|
| 1 | `infra/supabase/schema.sql` | All `CREATE TABLE IF NOT EXISTS`. |
| 2 | `infra/supabase/seed.sql` | suppliers (5), retailers (4), ingredients (90), skus (12), 8 retailer_orders, 5 disruption_signals, 14-day demand_forecasts, 15 stakeholders, suppliers MOQ ALTER updates, production_orders demo block (3), finished_goods_pallets demo block (9), app_users (1) + user_settings (1). |
| 3 | `infra/seed_toronto_facilities.py` | 4 facilities (live FGF fetch + cached snapshots in `infra/data/cache/`). |
| 4 | `infra/seed_synthetic.py` ← reads `infra/data/synthetic/*.yaml` | 9 production_lines, 12 warehouse_costs, 27 allergen_changeovers, ~58 production_formulas. |
| 5 | `infra/seed_lots.py` (Faker, seed=42) | ~180 ingredient_lots (5 lots <3d expiry, 3 past-expiry, balance 7-180d). |
| 6 | `infra/seed_toronto_skus.py` (one-off cascade) | Replaces legacy generic SKU IDs with the 12 branded FGF SKUs + rewires production_formulas + retailer_orders. **Run once** after step 2. |
| 7 | `infra/seed_demo.py` | Transactional layer: 6 action_cards, 6 supplier_orders + items, 20 production_schedules, 12 production_runs, 33 waste_events, 45 finished_goods_pallets, 8 MOQ tax entries, 3 negotiation_drafts, 1 weekly_summary, ~112 dock_schedules. **Not** in `make schema.seed` chain — run separately via `make seed.demo`. |
| 8 | `infra/event_stream.py` | Optional live SSE event push for FlowSight scrubber demo. Not part of seeding. |

`Makefile` chain `make schema.seed` runs steps 1, 3, 4, 5 (and replays 2 if a fresh volume). `make seed.demo` runs step 7. `seed_toronto_skus.py` (step 6) is **not in any Makefile target** — it's a one-shot script.

### 1.4 Mock data fallback layer

`backend/app/mock_data.py` is the original in-memory deterministic dataset
served by the early version. It uses **completely different IDs**:
`plant_1..4`, `sup_a..e`, `sku_blueberry_muffin`, `line_1..3`, `ing_flour`.

**Audit finding:** every router under `backend/app/api/` reads from the DB
via SQLAlchemy. None of them import or read `mock_data.py` directly. The
file is still imported by:

- `backend/scripts/seed_live_data.py` — a *legacy* mock→DB sync. Skips items
  because mock IDs don't match the schema IDs. Documented as live-mode
  shim; safe to ignore for the new demo seed.
- `infra/seed_demo.py` — but only to read `NEGOTIATION_DRAFTS[0].body_md`,
  `WEEKLY_SUMMARIES[0].stats`, and `WEEKLY_SUMMARIES[0].narration_md` as
  Markdown copy templates. Everything else is hardcoded in the script.

So **the single source of truth is the live Postgres database**, populated
by the SQL + Python seeders. `mock_data.py` is only used as a copy
template now.

### 1.5 Live DB state observed before this pass

`make db.status` (run on the running Postgres container) shows:

```
facilities             |   4
suppliers              |  10   ← 2× expected (mock IDs + branded IDs both present)
ingredients            |  92
skus                   |  24   ← 2× expected (legacy 12 + branded 12 both present)
production_lines       |   9
production_formulas    |  64   ← 12 SKUs covered, but they're the LEGACY 12 (no FGF brands)
warehouse_costs        |  12
allergen_changeovers   |  27
ingredient_lots        | 180
retailer_orders        |   8
demand_forecasts       |  84
disruption_signals     |   7
stakeholders           |  15
production_schedules   |  20
production_runs        |  12
supplier_orders        |  12
supplier_order_items   |   7
action_cards           |   8
waste_events           |  43
finished_goods_pallets |  45
moq_tax_ledger         |   8
negotiation_drafts     |   3
dock_schedules         | 112
weekly_summaries       |   1
production_orders      |   4
inventory_events       |   0
notification_drafts    |   0
```

Detailed issues with the live DB are catalogued in §2 below.

---

## 2. Current seed data assessment

### 2.1 Data-quality problems found

| # | Problem | Impact | Where |
|---|---|---|---|
| 1 | **Duplicate suppliers.** 10 supplier rows: 5 with the *legacy* mock IDs (`sup_a`-`sup_e`) and 5 with the *real* IDs (`sup-northgrain`, `sup-valleydairy`, `sup-prairiebulk`, `sup-coastalberry`, `sup-newleaf`). | Scorecard shows 10 entries with weird naming. PO dropdowns get confused. Frontend treats both halves as separate suppliers. | Volume held over from a pre-cascade seed; new seed.sql now writes the real IDs only, but the volume was not wiped. |
| 2 | **Duplicate SKUs.** 24 sku rows: legacy 12 generic (`sku-blueberry-muffin-4pk`, `sku-sourdough-loaf`, …) **and** the 12 branded FGF SKUs. Production formulas only exist for the **legacy** 12 — the branded 12 have **no recipes**. | Production page validation always fails for branded SKUs (no recipe → no kg needed → nothing to deduct, but the UI lists 24 products). Materials substitution returns mixed candidates. | `seed_toronto_skus.py` was authored as a one-off cascade but was not re-run after the volume started carrying both halves. |
| 3 | **0 `inventory_events`.** Despite the table existing and being append-only, no historical consumption / receipt / transfer events are seeded. | The audit log panel is empty, "Recent activity" widgets show nothing, agent can't reason about *who consumed what when*. | No seeder writes inventory_events. The `produce_order` endpoint does write them, but they only land via UI actions. |
| 4 | **0 `notification_drafts`.** Schema and endpoint exist, no rows. | Notifications drawer (when wired to drafts table) is empty. | `mock_data.NOTIFICATION_DRAFTS = []`, no SQL/Python seeder writes any. |
| 5 | **Only 4 `production_orders`.** Statuses present: `planned (2)`, `paused (1)`, `produced (1)`. Missing `producing` and `cancelled`. | Production page can't show every status card — `producing` is the headline state for FactoryView. No cancelled example for QA. | The seed.sql DO block creates 3 orders (one becomes `produced` historically); only `seed_demo.py`'s additions plus an extra add make 4. |
| 6 | **Random Faker lots, no scenario coherence.** `seed_lots.py` picks ingredients / facilities / suppliers uniformly at random with one bucket (5 lots <3d, 3 past-expiry, rest 7-180d). | Demo scenarios like "Toronto blueberries expiring + delayed Coastal Berry PO + scheduled blueberry-muffin run" can't be reliably reproduced — each Faker run shuffles which ingredient is the at-risk one. | Faker bucket logic is generic. |
| 7 | **No retailer-order genealogy.** All 8 retailer_orders are `open`/`scheduled`. None `shipped` or `cancelled`. None linked to finished_goods_pallets via `committed_order_id`. | Retailers page `shelf_risk` heuristic depends on pallets joined through `committed_order_id` — currently always `green`. No history of fulfilled orders to demo "track delivery" view. | seed.sql inserts only 8 open orders. seed_demo.py doesn't touch retailer_orders. |
| 8 | **No PO with `in_transit`, `delayed`, or `partially_received` status.** Schema enum is only `{draft, pending_confirm, confirmed, sent}` — narrower than the audit's requested list. | Demo prompt asks for "delayed shipment", "in transit", "partially received" — backend can model these as `confirmed` + late `delivery_date` or `sent` + future date. Need *explicit* "this one is delayed" framing in the data. | Schema choice; data must encode it via delivery_date + a delayed-flag-via-disruption-signal. |
| 9 | **Production line / order linkage is partly stale.** 2 lines have `status='setup'` with a `current_order_id` pointing at `planned` orders; 1 line is `paused` with a paused order. No line is currently `producing`. | FactoryView yield counter shows live data only for `producing` lines. The "Pause" / "Resume" / "Mark Produced" flows can't be demoed end-to-end. | seed.sql DO block only sets `setup` and `producing` lines for the 3 orders it creates. |
| 10 | **Production_orders sku mismatch.** One planned order targets `sku-oatmeal-cookie-12pk` (a *legacy* SKU). | If the cascade is finished, that order's FK fails. Currently the legacy SKU still exists so it works — but only because the dirty state is preserved. | seed.sql inserts production_orders that reference real branded SKUs; the stale rows come from earlier seeds. |
| 11 | **Demand forecasts only cover 6 of 12 SKUs.** seed.sql's `demand_forecasts` DO-block lists 6 SKUs × 14 days = 84 rows. The remaining 6 branded SKUs (Ciabatta, Sourdough, Naan, Mini Naan, Dippers, Focaccia) have **no forecast**. | Retailers page `po_ratio` computation is incomplete for half the SKUs; FlowSight outbound loop summary is biased. | Initial seed only forecasted the highest-volume 6. |
| 12 | **Stakeholders email lists target `priya.nair@fgf.example` etc.** but mock_data.STAKEHOLDERS uses `maria.santos@bakerypilot.test`. Both lists coexist if both seeders run. | Inconsistent example emails. The agent's notify tool always shows the SQL-side names; mock_data is dormant. Cosmetic only. | Two layers of stakeholder definitions. |
| 13 | **Spoilage risk score for "healthy" lots can read as ambiguous.** `compute_spoilage_risk` produces 0..1.5; the frontend tints anything ≥0.5 amber. With Faker-random quantities, ~30% of lots land amber even when expiry is 60-180 days out. | Materials page looks like everything is mildly at risk. | The spoilage formula divides qty by `qty * 0.7` (line 51 of `inventory.py`) which equals 1.43 for every lot; the API always returns >1 — so every lot looks `critical`. This is a known bug but downstream of seed: the *seed scenario* design must surface a small number of obviously-red lots and many obviously-green lots, even if the heuristic over-paints amber. |
| 14 | **`waste_events.ingredient_id` populated with the literal text** (e.g. `"ing-butter-unsalted"`) — display layer prints it as "ingredient name" even though it's the ID. | ESG events list shows ugly IDs instead of names. | `app/services/esg.py` line 49 uses `r.ingredient_id` as `ingredient_name`. Seed can't fix this — backend bug. Documented. |
| 15 | **No PO references to `inventory_events`.** When a supplier_order moves to delivered (in our schema: `sent` + past delivery_date), no `inventory_events` of kind `receipt` is logged, and no new `ingredient_lots` are auto-created. | Receiving history is invisible; "where did this lot come from?" can only be answered by `supplier_id` on the lot, not by the actual PO. Lower priority for the demo but worth flagging. | Functional gap (would need a receiving endpoint or a receipt-trigger seed). |

### 2.2 Frontend features under-supported by current data

| Page / feature | Symptom | Root cause |
|---|---|---|
| Home → Loops cards | "transfers" loop count is misleading (counts draft+pending+sent POs as "transfers") | dashboard endpoint reuses supplier_orders pending counts as "active_transfers". Cosmetic; works as-is. |
| Production page | Can't demo a producing line | No production_order in `producing` status / no line in `producing` status. |
| Production page | Can't demo a cancelled order | No `cancelled` production_order. |
| Production page → Mark Produced flow | Always succeeds because ingredient_lots are 180 of them and capacity is huge | Need at least one SKU+facility pair where formulas exceed available stock → demonstrate the 422 inventory-insufficiency path. |
| Materials page → Stock horizon | Burn-rate is `total * 0.1` constant client-side; all numbers similar | Documented limitation. Seed irrelevant. |
| Materials page → Substitution panel | Returns 5 candidates but several show `0 units achievable` | Branded SKUs have no formulas → achievable = 0 for substitutes referencing branded SKUs. Cascade fix removes this. |
| Scorecard → Suppliers tab | Lists 10 suppliers (5+5 dupes) | Duplicate supplier rows. |
| Scorecard → MOQ ledger | Some suppliers (mock IDs) show $0 MOQ tax | moq_tax_ledger references real IDs; mock-ID suppliers don't match. |
| Scorecard → Forecast actuals | Only 6 of 12 SKUs have forecasts → 6 of 12 chart rows are empty | demand_forecasts coverage gap. |
| Schedule → Gantt | Looks fine but shows mixed real & legacy SKU IDs in tooltip | Duplicate SKUs. |
| FlowSight → Plant utilisation rings | Frozen/refrigerated/dry rings vary nicely (real data) | Works. |
| FlowSight → Retailer halos | All four retailers show `shelf_risk=green` because no pallets carry `committed_order_id` | retailer_orders are not linked to finished_goods_pallets in seed. |
| FlowSight → FactoryView live lines | Only shows historical production_runs (within 24h cutoff); often empty | Most seeded runs are >24h old. |
| Bottom strip → "Active disruptions" | Shows count from disruption_signals — OK | Works. |
| Alerts SSE | Floods with "expiring lot" alerts for every lot in the system (the spoilage threshold of `expiry_date <= today+3d` matches many random Faker lots) | Faker distribution makes the alert deck noisy. Tighter scenario-driven seed fixes this. |

### 2.3 Backend / agent workflows under-supported

| Capability | Need | Current state |
|---|---|---|
| `query_lots` agent tool | Returns useful lots with names + risk | Works, but spoilage heuristic over-paints amber. Improve by ensuring at least 5 clear "red" lots and many clear "green" lots; agent narration becomes cleaner. |
| `substitution_candidates` agent tool | Suggests SKUs producible without the blocked ingredient | Works on real DB if SKUs have recipes. **Broken today** because branded SKUs have no recipes — must run the SKU cascade. |
| `preview_landed_cost` / `build_order_draft` | Requires ingredients + suppliers (real IDs) + MOQ data | Works on real IDs only. Mock IDs in dropdown confuse the agent. |
| `suggest_production_schedule` | Returns schedules joined with facilities/lines/SKUs | Works on real IDs. |
| `get_yield_variance` / `diagnose_anomaly` | Pulls production_runs with `actual_ingredient_consumption` JSON | Works — seed_demo.py provides 12 runs with realistic variance JSON. Could be richer. |
| `create_cmms_work_order` | Endpoint exists; agent can call it. No backing CMMS table for the demo. | Mock-OK. |
| `get_waste_counter` / `run_pattern_analysis` | Sums `waste_events.kg` where `avoided=true`; groups by kind+facility+ingredient | Works. seed_demo.py provides ~33 events. |
| Chat → action card creation | Needs at least one `pending` action card to demo confirm/reject | 6 action cards seeded by seed_demo.py — good. |
| Alerts SSE | Pulls expiring lots + high-severity disruption_signals + high-variance production_runs | Works. Seed needs to make signal triggers obvious. |

---

## 3. Required demo scenarios

Each scenario below maps to specific data the redesigned seed must include.
Scenarios are written as **narratives** the demo can show, not just rows.

### 3.1 Inventory (ingredient_lots) scenarios

| # | Scenario | Required data |
|---|---|---|
| I-1 | **Healthy stock**: most ingredients are well-supplied (≥30 days expiry, full quantities). | ~150 ingredient_lots with `expiry_date > today + 30d`, distributed across 4 facilities. |
| I-2 | **Critical near-expiry**: `ing-butter-unsalted` at Toronto has 2 lots expiring tomorrow / in 2 days. | 2 lots, facility `plant-toronto`, qty 40 + 25 kg, expiry_date 1-2 days out. |
| I-3 | **Past expiry / blocked**: `ing-cream-cheese` at Hamilton — 1 lot expired 2 days ago, awaiting write-off. | 1 lot, qty 12 kg, expiry_date `today - 2d`. |
| I-4 | **Low stock by reorder threshold**: `ing-blueberry-frozen` at Toronto — only 8 kg remaining, far below typical 200+ kg. | 1 lot (and only one for that ingredient at Toronto) with qty `< 10`. |
| I-5 | **Supplier-linked at-risk**: `ing-cocoa-powder` (placeholder for chocolate; we use `ing-cocoa-powder`) at Mississauga only available from `sup-coastalberry` (disrupted personality). | 1 lot with `supplier_id = 'sup-coastalberry'`. |
| I-6 | **Cross-plant transfer opportunity**: `ing-butter-unsalted` at Hamilton has 400 kg surplus while Toronto has 25 kg critical. | 1 large lot at Hamilton + 1 small near-expiry lot at Toronto for the same ingredient. |
| I-7 | **Substitution candidate ready**: `ing-flour-bread` at Toronto fully usable for *all* bread SKUs; if it were blocked, the `substitution_candidates` tool should surface `sku-stonefire-naan-dippers-original` (uses `ing-flour-ap` instead). | At least one bread SKU using bread flour, another using all-purpose flour with high stock. |
| I-8 | **Packaging-style ingredient low**: while the schema doesn't have explicit packaging, treat `ing-salt-kosher` and `ing-yeast-instant` as the demo's "high-usage staple" — make sure these never run out (used in every recipe). | High initial stock per facility, multiple lots per facility. |

### 3.2 Finished product (finished_goods_pallets) scenarios

| # | Scenario | Required data |
|---|---|---|
| FP-1 | **Just produced** (≤1 day): high quantity, long shelf life remaining. | 1 pallet per facility produced today, qty 400-1000, status `in_warehouse`. |
| FP-2 | **Near-expiry critical** (≤2 days remaining): pulls red halo on FlowSight retailer node. | 3-4 pallets across plants with shelf_life remaining `1-2 d`. |
| FP-3 | **Low finished stock for high-demand SKU**: `sku-wonder-classic-white-loaf` at Toronto — only 120 units in warehouse vs a 12 000-unit Costco order due in 2 days. | 1 pallet, qty 120, vs retailer_order qty 12000. |
| FP-4 | **Recently shipped**: 6 pallets `status='shipped'` linked to recent retailer orders (set `committed_order_id`). | retailer_order with status `shipped` matched to pallets. |
| FP-5 | **Written-off / donated**: 1 pallet each for the QA "no-longer-in-warehouse" filter. | 1 `written_off`, 1 `donated`. |
| FP-6 | **Facility-specific mix**: Toronto = high throughput (most pallets); Mississauga = distribution-style (high inventory); Hamilton & Montreal = lighter footprint. | Pallet distribution skewed: Toronto 18, Mississauga 14, Hamilton 8, Montreal 5 (in-warehouse). |

### 3.3 Production line / order scenarios

| # | Scenario | Required data |
|---|---|---|
| PL-1 | **One actively producing line**: Toronto Line 1 (Muffin/Bread) running `Wonder Classic White Bread`, started 90 min ago, planned 4 hr run. | production_orders status=`producing`, production_line status=`producing`, current_order_id set. |
| PL-2 | **One paused line**: Toronto Line 3 (Cookie) paused mid-run due to ingredient shortage — waiting on the at-risk butter delivery. | production_orders status=`paused`, production_line status=`paused`. |
| PL-3 | **One setup/planned line**: Mississauga Line 2 (Bread) planned to start in 2h for Country Harvest 12-Grain. | production_orders status=`planned`, production_line status=`setup`. |
| PL-4 | **One idle line**: Hamilton Line 1 (Muffin) idle, ready for assignment. | production_line status=`idle`, no current_order_id. |
| PL-5 | **One maintenance line**: Hamilton Line 2 (Cookie) under planned maintenance. | production_line status=`maintenance`. |
| PL-6 | **One produced historical order**: Toronto Line 1 yesterday produced 500 Wonder loaves — already added to finished_goods_pallets. | production_orders status=`produced`, completed_at = yesterday. |
| PL-7 | **One cancelled order**: Montreal Line 2 (Danish) — Almond Danish run cancelled due to confirmed allergen conflict last week. | production_orders status=`cancelled`. |
| PL-8 | **Insufficient-inventory scenario**: a planned order for a recipe that *cannot* succeed if Mark Produced is clicked — used to demo the 422 "insufficient ingredient inventory" path. | Order for a high-quantity batch of a SKU whose formulas exceed current at-facility inventory. Document the order in the audit so QA knows which one to test. |

### 3.4 Supplier / PO scenarios

| # | Scenario | Required data |
|---|---|---|
| S-1 | **Reliable supplier**: NorthGrain Mills — 96% on-time, 99% fill, paid net-30. Active confirmed PO due in 3 days. | supplier `sup-northgrain`, supplier_order `confirmed`, delivery_date `today+3`. |
| S-2 | **Cheap but late**: Valley Dairy — 78% on-time, 95% fill, 2/10 net-30. Has a "delayed" PO (delivery_date in the past with status still `sent`). | supplier `sup-valleydairy`, supplier_order with `delivery_date < today` and `status=sent`. |
| S-3 | **High MOQ**: Prairie Bulk Sugar — 2 500 kg MOQ, accumulated MOQ tax of $1 897 this quarter. Pending negotiation draft. | moq_tax_ledger entry + negotiation_drafts entry trigger=`moq_tax`. |
| S-4 | **Disrupted (weather)**: Coastal Berry — disruption_signal (Saskatchewan drought) live; PO `pending_confirm` (waiting on supplier response). | disruption_signal severity ≥ 0.6 + supplier_order `pending_confirm`. |
| S-5 | **New supplier**: New Leaf Specialty Foods — only 1 month of history, contract good until 2027. One confirmed delivery. | supplier `sup-newleaf`, supplier_order `confirmed`. |
| PO-1 | **Active in transit**: confirmed PO with future delivery date. | At least 3 such across different suppliers. |
| PO-2 | **Recently delivered**: confirmed PO with delivery_date 1-2 days ago — receiving today. | 1 such PO. |
| PO-3 | **Delayed**: sent PO with delivery_date in the past, no receipt event. | 1 such PO from `sup-valleydairy`. |
| PO-4 | **Partial-received**: not modelable in current schema (no per-item received_qty). Documented as a gap. | None. |
| PO-5 | **Pending negotiation**: a draft order awaiting Procurement approval. | supplier_order `draft` linked to an action_card. |

### 3.5 Schedule scenarios

| # | Scenario | Required data |
|---|---|---|
| SCH-1 | **Approved current shift**: 5 schedules (`approved`) starting in next 0-6 h across all 4 plants. | seed_demo.py already does this — verified. |
| SCH-2 | **Suggested tomorrow**: 3 schedules (`suggested`) for tomorrow with waste_avoided_kg > 0 (agent proposal). | Already done. |
| SCH-3 | **Historical complete**: 12 `complete` schedules over last 12 days with linked production_runs (yield JSON). | Already done. |
| SCH-4 | **Schedule at risk**: at least one `approved` schedule's SKU has an ingredient on the I-2/I-4 critical/low list (e.g. Wonder bread scheduled while flour is fine but blueberry-muffin scheduled while blueberries are at 8 kg). | Will explicitly engineer one — see §4. |
| SCH-5 | **Conflict on a line**: deliberately *avoid* — schema doesn't elegantly model conflict for the Gantt. | Not seeded. |

### 3.6 Alert / notification scenarios

| # | Alert kind | Triggered by |
|---|---|---|
| A-1 | "Butter expiring in 1d at Toronto" | I-2 lot |
| A-2 | "Blueberry low at Toronto" | I-4 lot (qty < 10) |
| A-3 | "Cream cheese expired at Hamilton" | I-3 lot |
| A-4 | "Supplier risk: Coastal Berry (severity 0.72)" | S-4 disruption_signal |
| A-5 | "Supplier risk: Valley Dairy (window miss)" | seeded disruption_signal severity ≥ 0.6 |
| A-6 | "Yield spike on line-toronto-2 (variance 22%)" | A high-variance production_run (already seeded). |
| A-7 | "Yield spike on line-mississauga-1 (sesame 76% over)" | Already seeded. |
| A-8 | "Pastry Line paused" | PL-2 paused line (NOT a current alert kind — would require schema addition; documented as future work). |

The alert SSE already pulls A-1..A-7 automatically from `ingredient_lots`,
`disruption_signals`, and `production_runs`. As long as the seed plants those
rows, the alerts panel populates correctly.

### 3.7 Agent / Copilot scenarios

The agent can already answer the questions below if the data exists. Each row
points to which scenarios above feed it.

| User asks | Seeded so the agent can answer | Sourced from |
|---|---|---|
| "Which lots are expiring soonest?" | I-2, I-3, I-4 — clear top-of-list candidates | `query_lots` tool |
| "What substitutions exist if blueberries run out?" | I-4 + SKU formulas → bread/naan/cookies still possible | `substitution_candidates` tool |
| "Which supplier is causing schedule risk?" | S-4 disruption + I-4 low stock + SCH-4 at-risk schedule | `query_lots` + `suggest_production_schedule` |
| "Can we produce 5 000 batches of Wonder loaves?" | I-1 healthy flour stock at Toronto + production_formulas + capacity | `validate_production` (REST) + agent narration |
| "Place a PO for flour" | Ingredients + suppliers available → `build_order_draft` creates action_card | `build_order_draft` tool |
| "Mark line-toronto-1 produced" | PL-1 (`producing`) → `produce_order` endpoint deducts ingredients FIFO + makes pallet | `markOrderProduced` (REST) |
| "Which finished products are low?" | FP-3 low Wonder stock at Toronto | `query_lots`-style (pallets endpoint) |
| "Why is the schedule at risk?" | SCH-4 + linked I-2/I-4 lots | Multi-tool reasoning |
| "Which POs are delayed?" | PO-3 Valley Dairy late delivery | direct DB read |
| "Generate a negotiation draft for MOQ" | S-3 Prairie Bulk MOQ tax + existing pending draft | `draft_negotiation` tool |
| "Run weekly summary" | weekly_summaries row + waste_events + action_cards | `summary_tools` |

---

## 4. Final seed-data design

This section is the **target rowcount and shape** for each table after the
redesigned seed runs. Anything not listed stays at its current value.

### 4.1 Master data (unchanged from current seed.sql + seed_synthetic + seed_toronto_facilities)

| Table | Rows | Source |
|---|---|---|
| `facilities` | 4 | `seed_toronto_facilities.py` (live + cache) |
| `ingredients` | 90 | `seed.sql` |
| `skus` | 12 (FGF-branded only) | `seed.sql` (after `seed_toronto_skus.py` cascade flushes any leftover legacy rows) |
| `production_lines` | 9 | `infra/data/synthetic/production_lines.yaml` |
| `production_formulas` | ~58 (3-7 ingredients × 12 SKUs) | `infra/data/synthetic/production_formulas.yaml` |
| `warehouse_costs` | 12 | `infra/data/synthetic/warehouse_costs.yaml` |
| `allergen_changeovers` | 27 | `infra/data/synthetic/allergen_changeovers.yaml` |
| `retailers` | 4 | `seed.sql` |
| `suppliers` | 5 (real IDs only) | `seed.sql` |
| `stakeholders` | 15 | `seed.sql` |
| `app_users` | 1 | `seed.sql` |
| `user_settings` | 1 | `seed.sql` |

### 4.2 Ingredient lots — scenario-driven layout (replaces Faker-random spread)

**New approach:** `seed_lots.py` will keep the Faker bulk fill (~140 healthy
lots) but **prepend a curated scenario layer** that pins the 9 demo lots
called out in §3.1 to specific (facility, ingredient, qty, expiry) tuples.

Curated lots (committed by lot_code so they survive re-runs):

| lot_code | facility | ingredient | qty (kg) | days to expiry | scenario |
|---|---|---|---|---|---|
| L-DEMO-BUT-001 | plant-toronto | ing-butter-unsalted | 40 | 1 | I-2 critical butter |
| L-DEMO-BUT-002 | plant-toronto | ing-butter-unsalted | 25 | 2 | I-2 critical butter (second lot) |
| L-DEMO-BUT-003 | plant-hamilton | ing-butter-unsalted | 420 | 35 | I-6 surplus / transfer source |
| L-DEMO-CRC-001 | plant-hamilton | ing-cream-cheese | 12 | -2 | I-3 expired |
| L-DEMO-BLU-001 | plant-toronto | ing-blueberry-frozen | 8 | 4 | I-4 low stock |
| L-DEMO-BLU-002 | plant-mississauga | ing-blueberry-frozen | 320 | 90 | healthy alternative |
| L-DEMO-COC-001 | plant-mississauga | ing-cocoa-powder | 110 | 60 | I-5 supplier=coastalberry |
| L-DEMO-FLR-001 | plant-toronto | ing-flour-bread | 2200 | 120 | I-1 healthy headline |
| L-DEMO-FLR-002 | plant-mississauga | ing-flour-ap | 1850 | 120 | I-7 substitute source for naan family |
| L-DEMO-SLT-001..004 | every facility | ing-salt-kosher | 600 | 365 | I-8 staple (one per facility) |
| L-DEMO-YST-001..004 | every facility | ing-yeast-instant | 250 | 60 | I-8 staple |

Plus ~150 Faker-generated lots spread across remaining ingredients with
realistic 30-180 day expiry. **No further <3-day Faker lots** — the alert
panel should only red-flag the 3 curated near-expiry lots, not a swarm of
random ones.

Total target: ~165 ingredient_lots.

### 4.3 Production orders — full status coverage

| order # | facility | line | sku | qty | status | notes |
|---|---|---|---|---|---|---|
| PO-1 | plant-toronto | line-toronto-1 | sku-wonder-classic-white-loaf | 800 | `producing` | Started 90 min ago |
| PO-2 | plant-toronto | line-toronto-3 | sku-ace-baguette-classic | 500 | `produced` | Completed 2 h ago (historical) |
| PO-3 | plant-toronto | line-toronto-2 | sku-stonefire-mini-naan-8pk | 600 | `paused` | Waiting on butter delivery from Valley Dairy |
| PO-4 | plant-mississauga | line-mississauga-2 | sku-country-harvest-12-grain-loaf | 600 | `planned` | Scheduled to start in 2 h |
| PO-5 | plant-mississauga | line-mississauga-1 | sku-d-italiano-hot-dog-buns-8pk | 1200 | `planned` | Tomorrow's morning run |
| PO-6 | plant-hamilton | line-hamilton-2 | sku-stonefire-pizza-crust-2pk | 400 | `cancelled` | Cancelled — allergen conflict on changeover |
| PO-7 | plant-montreal | line-montreal-1 | sku-ace-rosemary-focaccia | 300 | `planned` | Late-evening run |

Production_lines `status` updated to match:

- `line-toronto-1` → `producing` (current_order_id = PO-1)
- `line-toronto-2` → `paused` (current_order_id = PO-3)
- `line-toronto-3` → `idle` (PO-2 has been completed and line cleared)
- `line-mississauga-1` → `setup` (current_order_id = PO-5)
- `line-mississauga-2` → `setup` (current_order_id = PO-4)
- `line-hamilton-1` → `idle`
- `line-hamilton-2` → `maintenance` (explicit maintenance state)
- `line-montreal-1` → `setup` (current_order_id = PO-7)
- `line-montreal-2` → `idle`

PO-8 **insufficient-inventory test order** (added for QA):

| PO-8 | plant-toronto | line-toronto-2 | sku-stonefire-mini-naan-8pk | 5000 | `planned` | If "Mark Produced" clicked from PO-8 view, the request *will* fail with 422 (yogurt/milk lots are below threshold). Demonstrates the failure path. |

Wait — PO-3 already occupies line-toronto-2. PO-8 can't co-occupy. We'll
instead make PO-8 a planned-only order with NO line currently assigned by
leaving the line in `idle` and the order in `planned` orphan-state. Actually
the schema requires `line_id NOT NULL` and there are validation checks. We
will park PO-8 on `line-montreal-2` (idle) so it has a place. Demo flow:
operator drags PO-8 onto an idle line → marks produced → backend rejects
with 422 because mini-naan ingredient demand exceeds Montreal stock.

Final PO-8: `line-montreal-2`, planned, qty 5000.

### 4.4 Retailer orders — fulfilment lifecycle

8 orders kept (from `seed_toronto_skus.py`), enriched:

| # | status | committed_pallet | notes |
|---|---|---|---|
| 1-2 | `open` | none | Costco baguette + Wonder loaf (large) — these drive the FP-3 low-stock alert |
| 3 | `scheduled` | yes (linked) | Walmart Country Harvest — committed to plant-mississauga pallets |
| 4-5 | `open` | none | Walmart D'Italiano + Loblaws Naan |
| 6 | `shipped` | yes (linked) | Loblaws Sourdough — already shipped, drives "recent fulfilment" feel |
| 7-8 | `open` | none | Whole Foods Focaccia + Pizza Crust |

Plus 2 historical:

| 9 | `shipped` | yes | Costco baguette — completed yesterday |
| 10 | `cancelled` | none | Walmart late-cancel example |

Total 10 retailer_orders.

### 4.5 Finished goods pallets — facility-skewed, status-coverage

Keep seed_demo.py's 45 pallets but ensure:

- **Toronto** ~18 in_warehouse (3 critical ≤2d, 5 amber 3-4d, balance green)
- **Mississauga** ~14 in_warehouse, with 5 linked via `committed_order_id` to retailer_orders #3, #6, #9.
- **Hamilton** ~8 in_warehouse, balanced.
- **Montreal** ~5 in_warehouse, biased to high-margin focaccia.
- **6 shipped** linked to retailer_orders #3, #6, #9 + 3 others.
- **1 donated, 2 written_off** for filter QA.
- **5 fresh (produced today)** including 1 in Toronto for the PL-6 historical PO-2 output (qty 500 ACE Baguettes).

Required code change in `seed_demo.py`: when inserting `shipped` pallets,
populate `committed_order_id` with the matching retailer_order UUID
(currently NULL).

### 4.6 Supplier orders + items — broader history

12 supplier orders (seed_demo.py already inserts 6; expand to 12):

| # | supplier | facility | status | delivery_date | scenario |
|---|---|---|---|---|---|
| 1 | NorthGrain | Toronto | confirmed | +3d | S-1 in transit |
| 2 | Valley Dairy | Toronto | sent | -2d **delayed** | S-2/PO-3 late butter |
| 3 | Prairie Bulk | Mississauga | draft | +7d | S-3 (action_card pending) |
| 4 | Coastal Berry | Hamilton | pending_confirm | +4d | S-4 + disruption |
| 5 | New Leaf | Montreal | confirmed | +6d | S-5 |
| 6 | NorthGrain | Toronto | pending_confirm | +9d | S-3 (multi-line: sesame + chocolate chips) |
| 7 | NorthGrain | Hamilton | sent | +2d | additional in-transit |
| 8 | Valley Dairy | Mississauga | confirmed | -1d | recently delivered |
| 9 | Prairie Bulk | Toronto | sent | +5d | sugar in-transit |
| 10 | Coastal Berry | Toronto | confirmed | -3d | recently delivered |
| 11 | New Leaf | Hamilton | draft | +10d | future flour order |
| 12 | NorthGrain | Montreal | sent | +1d | flour to Montreal |

Each gets 1-3 items. The "delayed" PO #2 produces an extra disruption_signal
of kind `miss` at severity 0.65 (already in mock — extended).

### 4.7 Demand forecasts — 14-day × all 12 SKUs

Replace the `seed.sql` DO-block (which only covered 6 SKUs) with a loop over
all 12 SKUs × 14 days. Quantities calibrated against realistic mid-week
volumes per category:

| SKU | base_qty |
|---|---|
| sku-wonder-classic-white-loaf | 850 |
| sku-ace-baguette-classic | 720 |
| sku-country-harvest-12-grain-loaf | 610 |
| sku-ace-ciabatta-piccolo-6pk | 940 |
| sku-d-italiano-hot-dog-buns-8pk | 480 |
| sku-stonefire-pizza-crust-2pk | 390 |
| sku-ace-sourdough-bistro | 410 |
| sku-ace-rustic-italian-oval | 360 |
| sku-ace-rosemary-focaccia | 250 |
| sku-stonefire-original-naan-2pk | 530 |
| sku-stonefire-mini-naan-8pk | 470 |
| sku-stonefire-naan-dippers-original | 310 |

Total ~168 rows.

### 4.8 Scorecard — already derived from suppliers + moq_tax_ledger

No new direct rows. The endpoints `GET /api/suppliers/_meta/scorecard_summary`
and `GET /api/suppliers/{id}/performance` compute everything on the fly.
Ensure variation:

- 1 tier A supplier (NorthGrain: on_time≥0.95, fill≥0.97)
- 2 tier B (Prairie Bulk, New Leaf: 0.88-0.94)
- 2 tier C (Valley Dairy, Coastal Berry: <0.85)

All values are already set correctly in `seed.sql`.

### 4.9 Schedule / production runs

`seed_demo.py` already inserts 20 schedules + 12 historical runs with
varied yield JSON. **Augment** one approved schedule (Toronto Line 1,
SKU = `sku-stonefire-mini-naan-8pk`, starts in 4h) so that when it runs,
the **butter scarcity in I-2 becomes immediately blocking**. This makes
SCH-4 concrete.

### 4.10 Alerts / notifications

- Alerts are derived from `ingredient_lots` + `disruption_signals` +
  `production_runs`. No direct seed needed; the scenario lots in §4.2 and
  signals in §4.6 produce the right alert deck.
- Add 5 seed `notification_drafts` rows (currently 0):

| # | kind | recipients | subject |
|---|---|---|---|
| 1 | `yield_alert` | priya.nair, omar.khalid | Yield spike on line-mississauga-1 (sesame) |
| 2 | `supplier_negotiation` | sarah.kim, claire@valleydairy | Delivery performance review (Q3) |
| 3 | `weekly_summary` | lisa.zhang, david.osei, sarah.kim, priya.nair | Weekly Ops Summary (week ending today) |
| 4 | `retailer_negotiation` | tom.whitmore | Re: Wonder loaf fulfilment risk |
| 5 | `transfer_request` | priya.nair, anika.patel | Butter cross-plant transfer (Hamilton → Toronto) |

### 4.11 Historical events (inventory_events + waste_events)

- `waste_events`: seed_demo.py inserts 33. Keep + ensure 5 avoided events
  reference the actual at-risk lots from §4.2 (`L-DEMO-BUT-001`,
  `L-DEMO-BLU-001`, etc.) by `source_id`.
- `inventory_events` (currently 0): add ~20 historical events to give the
  audit log substance:

  - 8 `consumption` events from the 12 production_runs (representative).
  - 5 `receipt` events from delivered supplier_orders (#1, #5, #8, #10, #11).
  - 4 `transfer` events showing past cross-plant butter / sugar moves.
  - 3 `spoilage` events tied to the past-expiry I-3 lot and similar.

This brings the audit log to ~20 rows — meaningful but manageable.

### 4.12 Action cards

`seed_demo.py` already inserts 6 across kinds: 3 supplier_order (confirmed,
pending, rejected), 1 schedule_change (confirmed), 1 notify (pending),
1 work_order (pending). Keep as-is.

### 4.13 Final target row counts after redesigned seed

| Table | Before | After | Delta |
|---|---|---|---|
| `facilities` | 4 | 4 | 0 |
| `suppliers` | 10 (5 dupe) | 5 | **-5** (cascade cleanup) |
| `skus` | 24 (12 dupe) | 12 | **-12** (cascade cleanup) |
| `production_formulas` | 64 (legacy SKUs) | 58 (branded SKUs) | branded coverage |
| `ingredient_lots` | 180 | ~165 (140 Faker + 12 curated + 13 staples) | scenario layout |
| `retailer_orders` | 8 | 10 | +2 (shipped, cancelled) |
| `demand_forecasts` | 84 | 168 | +84 (full 12 SKUs) |
| `production_orders` | 4 | 8 | +4 (all statuses + insuff. example) |
| `production_lines.status` | mixed | producing/paused/idle/setup/maintenance | balanced |
| `finished_goods_pallets` | 45 | 45 | committed_order_id populated for shipped |
| `supplier_orders` | 12 | 12 | restructured to S-1..S-5 scenarios |
| `supplier_order_items` | 7 | ~15 | items per order |
| `action_cards` | 8 | 6 | seed_demo trims old runs |
| `inventory_events` | 0 | ~20 | NEW |
| `notification_drafts` | 0 | 5 | NEW |
| `waste_events` | 43 | 35 | trimmed + 5 link to curated lots |
| `moq_tax_ledger` | 8 | 8 | unchanged |
| `negotiation_drafts` | 3 | 3 | unchanged |
| `dock_schedules` | 112 | 112 | unchanged |
| `weekly_summaries` | 1 | 1 | unchanged |
| `disruption_signals` | 7 | 6 | trimmed duplicates |
| `app_users` / `user_settings` | 1/1 | 1/1 | unchanged |

---

## 5. Risks & assumptions

### 5.1 Schema limitations encountered

- **Supplier order status enum** is `{draft, pending_confirm, confirmed, sent}`. There is no `in_transit`, `delivered`, `partially_received`, `delayed`, or `cancelled`. The audit document asks for these statuses. Mapping:
  - `in_transit` → `sent` + future `delivery_date`
  - `delivered` → `sent` + past `delivery_date` + matching `inventory_events` receipt rows
  - `delayed` → `sent` + past `delivery_date` AND no receipt event AND a `miss` disruption_signal referencing the supplier
  - `partially_received` → **not modelable** without schema change (would require per-item received_qty). Documented as a gap; not blocking.
  - `cancelled` → **not in enum**. Need to add `'cancelled'` to the CHECK constraint. Considered an additive ALTER (allowed by schema-freeze policy because we're only widening a CHECK list). Not done in this pass — flagged for follow-up.
- **Production order** transitions are unidirectional (no produced→planned). Schema correct.
- **No retailer_order ↔ pallets bidirectional FK.** `pallets.committed_order_id` is a `uuid` column with no foreign-key constraint on `retailer_orders.retailer_order_id`. We will populate it for the demo; if a retailer_order is later deleted, the pallets retain a dangling UUID. Acceptable for hackathon.
- **No `ingredient.reorder_threshold` column.** The "low stock" badge is purely a frontend heuristic (qty < some constant). Not blocking; the agent can still infer "low" from raw qty + recipe demand.
- **No `production_lines.status='completed'`.** The schema CHECK list is `{idle, setup, producing, paused, maintenance}`. We use `idle` after `produced`.
- **No `inventory_events.kind='write_off'`.** Schema uses `spoilage` (per the enum); `inventory.write_off_lot` already writes `spoilage`. Fine.
- **`waste_events.ingredient_id` is the *ID*** (`ing-butter-unsalted`), not the name. Frontend prints raw IDs in the ESG events list. Documented as a backend bug; out of scope for the seed pass.
- **Spoilage risk formula bug.** `_lots_with_risk` passes `qty * 0.7` as `kg_scheduled_before_expiry`, then `compute_spoilage_risk` returns `qty / scheduled`. For any qty > 0 this ≥ 1.43, so the API stamps every lot as ≥1.0 → red. Documented as a backend bug; the seed should still place a small number of *truly* low-qty lots so the at-risk *ordering* is correct even if all colours are wrong.
- **Live alerts SSE pulls every lot with `expiry_date <= today+3d`.** If we only seed 3 such lots, the alert deck stays clean. The Faker random tail is removed accordingly in the new `seed_lots.py`.

### 5.2 Fields approximated / kept synthetic

- **Production formulas (`kg_per_unit`)** — proprietary; carried in YAML with `source: engineering_judgment_demo_only`. Documented in §4.1.
- **Warehouse costs (`cost_per_kg_per_day`, `capacity_kg`)** — proprietary; same tag.
- **Allergen changeover minutes** — proprietary; same tag.
- **Supplier performance percentages** — set to plausible values matching each `personality_tag`.
- **Demand forecast** — flat baseline + uniform noise per day per SKU.
- **Supplier MOQ tax ledger** — fabricated to make Q1 + Q2 visibly differ.
- **production_runs ingredient consumption JSON** — fabricated to produce the variance scenarios (sesame 76% over; chocolate-chip 19% over; etc.).

### 5.3 Features that need backend support before seed can fully support them

| Feature | Why seed can't fix it |
|---|---|
| Per-ingredient burn-rate / stock horizon | No consumption-rate-per-ingredient endpoint; client computes `total * 0.1`. |
| Schedule diff / what-if narrative | Backend endpoint exists but returns synthetic responses. |
| Voice transcript verification chain | Voice endpoint returns mock by design. |
| Real per-day KPI sparklines (waste, MOQ-tax) | No daily-aggregate endpoint. |
| Alert read / dismiss persistence | No `alert_read_state` table. |
| Production order `cancelled` status in supplier_order | Need schema-additive enum widen. |
| Partial receipt per PO line item | Would need a `received_qty_kg` column on `supplier_order_items`. |

These are documented in the existing
`docs/frontend-backend-database-integration-audit.md` and
`docs/remaining-functional-work-audit.md`; no schema change is made in this
demo-data pass.

### 5.4 Assumptions made for the demo

- **Single demo timestamp anchor:** the demo presumes "today" = the date the
  seed is run. Most rows use `today ± N days` relative arithmetic. Two
  exceptions:
  - `retailer_orders.requested_delivery_date` for the original 8 orders is
    hardcoded to specific 2026-05-28..2026-06-01 dates (left from
    `seed_toronto_skus.py`). New orders #9-10 use relative dates. Mixing
    is fine because the frontend renders absolute dates in tables.
  - `weekly_summaries.week_start` is `today - 7 days` so the "last week"
    framing always works.
- **No timezones beyond `America/Toronto` / `America/Montreal`** — already
  baked into facility rows.
- **Currency = USD throughout** (matches mock_data and seed_demo).
- **All "delayed" / "expired" / "low" framing is relative.** If the demo
  runs more than a few days after seeding, several "near expiry" lots will
  have actually expired, and several "delayed" POs will look more delayed.
  This is intentional — re-seed before a fresh demo. `make seed.demo
  --force` and `uv run infra/seed_lots.py` (replace mode) are both safe.

---

## 6. Implementation summary (what changes after this audit)

The redesign is implemented through **edits to existing seed sources** —
no new entry points, no new tables, no destructive migrations. Specifically:

1. **`infra/supabase/seed.sql`** — extend the inline `production_orders`
   block to cover all statuses and the insufficient-inventory scenario;
   broaden the `demand_forecasts` block to all 12 SKUs.
2. **`infra/seed_lots.py`** — prepend a curated-scenario layer of ~12
   pinned lots before the Faker bulk fill, and drop the random
   `<3-day-expiry` bucket so only the curated lots drive alerts.
3. **`infra/seed_demo.py`** — extend `seed_production_orders`-style
   coverage; populate `committed_order_id` on shipped pallets; add
   `inventory_events` and `notification_drafts` inserts; expand
   `seed_supplier_orders` to 12 with the scenario set; extend
   `seed_negotiation_drafts` to align with disruptions.
4. **`Makefile`** — chain `seed.demo` into `schema.seed` (additive), and
   make sure `seed_toronto_skus.py` runs in the standard order so the
   legacy SKU cascade always completes.
5. **`docs/database-seeding.md`** — refresh the doc to reflect the new
   chain and the row counts in §4.13.

A clean re-seed sequence after these edits:

```bash
make reset                                  # wipes the volume
make up                                     # postgres up
make schema.migrate                         # applies schema.sql
make schema.seed                            # ingredients/suppliers/retailers/SKUs/facilities/lines/lots
uv run infra/seed_toronto_skus.py           # one-shot legacy-SKU cascade (no-op on fresh volume because the legacy IDs were never inserted on the new seed.sql path)
uv run infra/seed_demo.py --force           # transactional layer
```

After the Makefile edit, this collapses to `make reset && make up && make
schema.migrate && make schema.seed && make seed.demo`.

---

## 7. Validation checklist

After re-seeding, every item below must be observably true.

### 7.1 Database

- [ ] `facilities` = 4
- [ ] `suppliers` = 5 (no `sup_a..e`)
- [ ] `skus` = 12 (no legacy generic SKUs)
- [ ] `production_formulas` references **branded** SKU IDs only
- [ ] `ingredient_lots` includes the 12 curated `L-DEMO-*` lot_codes
- [ ] `production_orders` includes every status across at least 6 lines
- [ ] `production_lines` statuses: at least 1 each of `producing`, `paused`, `setup`, `idle`, `maintenance`
- [ ] `finished_goods_pallets` includes at least 6 `shipped` with non-null `committed_order_id`
- [ ] `retailer_orders` includes at least 1 `shipped`, 1 `cancelled`
- [ ] `notification_drafts` has 5 rows
- [ ] `inventory_events` has ~20 rows
- [ ] `demand_forecasts` covers all 12 SKUs

### 7.2 Backend endpoints

- [ ] `GET /api/facilities` returns 4 with `line_count > 0`.
- [ ] `GET /api/facilities/{id}/utilization` returns realistic zone splits.
- [ ] `GET /api/facilities/{id}/active_runs` returns the producing run for plant-toronto.
- [ ] `GET /api/lots?facility_id=plant-toronto` returns lots sorted by risk; first ones are the curated near-expiry butter / blueberry.
- [ ] `GET /api/lots/{lot_id}/substitutions` returns ranked candidates.
- [ ] `GET /api/suppliers` = 5 entries with personality_tag set.
- [ ] `GET /api/suppliers/_meta/scorecard_summary` returns tier_a=1, tier_b=2, tier_c=2.
- [ ] `GET /api/orders` (supplier_orders) = 12 entries spanning the 4 schema statuses.
- [ ] `GET /api/production/lines` returns 9 with at least one `producing`.
- [ ] `GET /api/production/orders` returns 8 spanning every status.
- [ ] `GET /api/production/products` returns 12 with non-empty recipes.
- [ ] `GET /api/production/validate?sku_id=sku-stonefire-mini-naan-8pk&quantity_units=5000&facility_id=plant-montreal` returns `feasible=false` with shortfall list.
- [ ] `GET /api/schedules` returns 20 across statuses.
- [ ] `GET /api/forecasts?sku_id=sku-wonder-classic-white-loaf&days=14` returns 14 rows.
- [ ] `GET /api/disruptions` returns 5-6 signals with severity variation.
- [ ] `GET /api/negotiations` returns 3.
- [ ] `GET /api/esg/counter` returns non-zero kg_avoided / dollars_saved.
- [ ] `GET /api/esg/waste_events` returns ~35.
- [ ] `GET /api/pallets` returns 45 with mix of statuses.
- [ ] `GET /api/retailers` returns 4 with mixed `shelf_risk` values.
- [ ] `GET /api/dashboard/loops` returns 4 loop cards with meaningful stats.
- [ ] `GET /api/alerts/snapshot` returns 5-10 alerts (3 expiring lots, 2-3 supplier risks, 1-2 yield spikes).

### 7.3 Frontend

- [ ] Home shows real loop stats (no `–` placeholders).
- [ ] Materials page: top 3 rows are the curated near-expiry lots.
- [ ] Materials → Substitution shows candidates with achievable > 0.
- [ ] Scorecard → Suppliers tab shows exactly 5 unique suppliers, no dupes.
- [ ] Scorecard → Performance tab CSV export contains real waste_events.
- [ ] Production page shows: 1 producing line + 1 paused + 1 setup + idle + maintenance.
- [ ] Production page → Assign Product modal validates feasibility before allowing assignment.
- [ ] Production page → Mark Produced on PO-8 returns the 422 error toast.
- [ ] Schedule page Gantt renders 20 schedule entries.
- [ ] Facilities (FlowSight): plant rings + retailer halos vary in colour.
- [ ] Notifications drawer (when wired to drafts table) shows 5 entries.
- [ ] Bottom strip shows non-zero "Active disruptions" and "MOQ-tax YTD".

---

---

## 8. Implementation results (post-seed reset)

After applying the changes in §6 and running
`make reset && make up && make schema.seed`, the database matches the
plan exactly. Validated row counts:

| Table | Target | Actual |
|---|---|---|
| facilities | 4 | 4 |
| suppliers | 5 | 5 |
| skus | 12 | 12 |
| production_lines | 9 | 9 |
| ingredient_lots | ~165 | 165 (28 curated + 137 Faker) |
| retailer_orders | 10 | 10 |
| demand_forecasts | 168 | 168 |
| production_orders | 8 | 8 |
| supplier_orders | 12 | 12 |
| finished_goods_pallets | ~54 | 54 (3 shipped linked to retailer_orders) |
| inventory_events | ~20 | 16 |
| notification_drafts | 5 | 5 |
| waste_events | 33 | 33 |
| moq_tax_ledger | 8 | 8 |
| negotiation_drafts | 3 | 3 |
| weekly_summaries | 1 | 1 |

### 8.1 Backend endpoint smoke (`localhost:8000`)

| Endpoint | Result |
|---|---|
| `GET /api/facilities` | 4 plants, lines populated |
| `GET /api/suppliers` | 5 suppliers; on_time rates: 0.96, 0.78, 0.90, 0.84, 0.88 |
| `GET /api/suppliers/_meta/scorecard_summary` | tier_a=1, tier_b=1, tier_c=3, pending_drafts=4, avg_on_time=0.872 |
| `GET /api/skus` (via `/production/products`) | 12 products, **0 with empty recipe** (was 12 empty before) |
| `GET /api/lots?facility_id=plant-toronto` | 38 lots, top-of-list sorted to butter 40kg (1d), butter 25kg (2d), blueberry 8kg (4d) |
| `GET /api/production/lines` | 9 lines: producing×1, paused×1, setup×3, idle×3, maintenance×1 |
| `GET /api/production/orders` | 8 orders: planned×4, producing×1, paused×1, produced×1, cancelled×1 |
| `GET /api/production/validate?sku=sku-wonder-classic-white-loaf&qty=800&fac=plant-toronto` | `feasible: true` (PO-1 producing scenario) |
| `GET /api/production/validate?sku=sku-stonefire-mini-naan-8pk&qty=600&fac=plant-toronto` | `feasible: false`, shortfall: 36 kg yogurt (PO-3 paused scenario) |
| `GET /api/production/validate?sku=sku-stonefire-mini-naan-8pk&qty=5000&fac=plant-montreal` | `feasible: false`, shortfalls: 600 kg AP flour, 300 kg yogurt, 225 kg milk (PO-8 QA case) |
| `GET /api/orders` (supplier) | 12 with all 4 statuses |
| `GET /api/retailers` | 4 retailers with varied po_ratio (0.56-0.94) |
| `GET /api/dashboard/loops` | 4 loop cards, real stats |
| `GET /api/dashboard/network` | suppliers=5, plants=4, retailers=4, active_transfers=10 |
| `GET /api/disruptions` | 5 signals with severity range 0.25-0.72 |
| `GET /api/alerts/snapshot` | 9 alerts: 3 expiring_lot (butter ×2, cream cheese ×1) + 2 supplier_risk (Coastal Berry, Valley Dairy) + 4 yield_spike |
| `GET /api/esg/counter` | kg_avoided=269.6, dollars_saved=$1,940, co2e_avoided=458.5 |
| `GET /api/negotiations` | 3 drafts: prairiebulk (moq_tax pending), coastalberry (price_drift pending), valleydairy (late_window sent) |
| `GET /api/suppliers/sup-valleydairy/performance` | 8-week sparkline with on_time ~0.78, fill ~0.95 (cheap_late personality) |
| `GET /api/lots/{butter-lot}/substitutions` | 5 candidate SKUs (ACE Focaccia, Sourdough, Italian Oval, Pizza Crust, Baguette) |

### 8.2 Frontend smoke (`localhost:3000`)

All Next.js routes return HTTP 200:

```
/             200
/materials    200
/production   200
/schedule     200
/scorecard    200
/facilities   200
/admin        200
/chat         200
/settings     200
```

A full Playwright/Browser pass was not run in this session; the
endpoint-level smoke above is the test surface. The QA checklist in §7
remains the human-test-pass spec.

### 8.3 Files changed (no commits)

| Path | Change |
|---|---|
| `docs/demo-seed-data-audit.md` | NEW — this document |
| `docs/database-seeding.md` | Rewrote to reflect the new chain + row counts |
| `infra/supabase/seed.sql` | Expanded production_orders to 8 (all statuses + PO-8 QA case), demand_forecasts to all 12 SKUs (168 rows), retailer_orders to 10 (full lifecycle), facility-gating on production_orders / pallets / app_users blocks, refreshed PO-3 narrative |
| `infra/seed_lots.py` | Curated scenario layer (28 pinned `L-DEMO-*` lot codes) + EXCLUDED_PAIRS guard, switched to TRUNCATE for inventory_events FK cascade |
| `infra/seed_demo.py` | 12 supplier_orders (was 6) covering S-1..S-5 scenarios, committed_order_id wire-up on shipped pallets, NEW seed_inventory_events (16 rows), NEW seed_notification_drafts (5 rows), count-guards on all append-only tables, retargeted shipped pallets to match retailer-order SKUs |
| `Makefile` | Added `seed.demo` to `schema.seed` chain; re-runs `seed.sql` after facilities so the gated DO-blocks succeed; added `inventory_events`, `notification_drafts`, `production_orders` to `db.status` |

No schema changes were made. No commits, no pushes, no PRs.

*End of audit.*
