# BakeryPilot

> An agentic AI operations copilot for FGF Brands' production floors and supply network.
> No cameras. No hardware. Intelligence layered on top of data FGF already has --
> rendered as a live, strategy-game cockpit.

---

## The Problem

FGF Brands runs four Canadian plants, hundreds of SKUs, and thousands of tonnes of
perishable ingredients every week. At hackathon kickoff, a stakeholder put it plainly:

> *"If we don't have blueberries, we want the system to tell us what else we can bake."*

That one sentence expands into four operational loops, each bleeding money today:

| Loop | Pain | Dollar signal |
| :--- | :--- | :--- |
| **Inbound** | Ingredient shortfalls, late deliveries, MOQ over-ordering, punishing supplier terms | $10K-$50K per incident |
| **Production** | Expiring stock written off, allergen changeovers eat capacity, yield leaks per shift | Millions per year |
| **Outbound** | Finished pallets expire in the warehouse, short-shipment fines, demand spikes catch the team off-guard | Retailer fines + lost shelf space |
| **Network** | Cross-site imbalances resolved by phone and spreadsheet; transfer vs. overtime decided by gut | Overtime premium + transit waste |

BakeryPilot solves all four loops with one conversational interface, five specialist
AI agents, and a map-style cockpit that makes every decision visible.

---

## What It Is

Eight functional modules plus a shared UX chassis. Every module is independently
deployable; together they form one product.

### Functional features

| Module | Name | Core capability |
| :---: | :--- | :--- |
| 1 | Ingredient and Network Intelligence | Spoilage risk index per lot; substitution engine; min-cost-flow cross-facility balancer |
| 2 | Production Scheduler | Waste-first + allergen-aware OR-Tools optimizer; retailer-order-to-schedule back-calculation |
| 3 | Demand Engine and Retailer Negotiation | LightGBM/Prophet 14-day forecast; retailer PO reconciliation; negotiation response drafts |
| 4 | Procurement Intelligence and Supplier Negotiation | Total landed cost model; MOQ constraint engine; delivery window optimizer; dock scheduling; automated negotiation drafts; contract lifecycle management |
| 5 | Yield Intelligence | Actual vs. theoretical yield per line/shift; real-time dollar waste counter; anomaly diagnosis |
| 6 | Sustainability and ESG | Running waste avoidance counter; root-cause pattern analysis; retailer Scope 3 PDF |
| 7 | Multi-Agent Copilot and VoiceLog | LangGraph orchestrator routing to 5 specialist agents; 4-level voice verification hierarchy; RAG over SOPs |
| 8 | Finished Goods and Outbound | Pallet shelf-life tracking; FEFO routing; stranded inventory recovery ranking |
| 9 | FactoryView / FlowSight (UX chassis) | Live top-down strategy-game map; toggleable layers; animated truck units; time scrubber |

### Non-functional features

| Attribute | How it is realized |
| :--- | :--- |
| **Human-in-the-loop safety** | Every state-changing action (order, schedule, transfer) goes through an `action_card` confirm step; the agent never commits silently |
| **Auditability** | Append-only `inventory_events` and `waste_events` tables; corrections are new rows, never updates -- full historical trace by design |
| **Mock parity** | Each external integration (SAP S/4 HANA, MES, CMMS, supplier APIs, retailer EDI) has a byte-identical mock; one env-var per system swaps to the real client |
| **Schema-first contracts** | `shared/schemas/*.schema.json` is the cross-service contract, frozen on Day 1; additive changes only, renames require team agreement |
| **Walking-skeleton reliability** | End-to-end path (chat -> tool -> action card -> confirm -> DB) stays green every evening from Phase 1 onward; new features layer on, never replace |
| **CPU-only inference** | LightGBM / Prophet forecasts, OR-Tools schedules, and faster-whisper STT all run on commodity CPUs -- no GPU needed for the demo or production |
| **Streaming-first UX** | Server-Sent Events for chat responses and live FlowSight overlays; no polling, no full-page reloads |
| **Local-first dev** | `make up` brings the full stack on Docker Compose; no cloud account required to develop or demo offline |
| **Free-tier deployable** | Vercel (frontend) + Render (backend + agent); a single stable public demo URL with no infra commitment |
| **Hardware-free** | No cameras, no sensors, no edge devices; intelligence layered on the data FGF already has -- nothing to install on the production floor |
| **Provenance + recall** | Lot genealogy graph (react-flow) traces any finished-goods pallet back to its source ingredient lots through the production formula |
| **Pluggable LLM tier** | Claude Sonnet 4.6 by default for chat and tool use; Opus 4.7 reserved for high-stakes negotiation drafts -- one config line to retune |

---

## Module 4 in Detail -- Procurement Intelligence

This is the most differentiated module. It goes beyond "pick the cheapest supplier"
to model the true cost of every ordering decision.

**Total landed cost.** Every order recommendation includes: unit price, MOQ overage
quantity, warehouse holding cost per day by storage type (frozen / refrigerated / dry),
and expected days held before consumption. A supplier with a lower unit price but a
large MOQ is often more expensive in total than a slightly pricier supplier with a
smaller MOQ.

**MOQ constraint engine and MOQ-tax ledger.** When demand requires 650 kg and the
supplier's MOQ is 1000 kg, the agent does not round up silently. It quantifies the
350 kg overage, computes the holding cost over the expected days held, and offers
three resolution paths: pull forward future demand, split the order with a lower-MOQ
supplier, or accept the overage. The quarterly MOQ-tax ledger accumulates the full cost
of over-ordering attributable to MOQ floors -- this is the evidence used in supplier
renegotiations.

**Delivery window optimization.** Suppliers promise a range, not a date: "deliver
Tuesday through Friday." The agent picks the specific day within the window that
minimizes cold storage holding cost while respecting the production schedule, dock
availability at the receiving plant, and stockout risk. The chosen day is included
in the generated PO. If the supplier later shifts within their window, the agent
recomputes the cost impact and alerts procurement.

**Automated negotiation drafts.** Three triggers generate a ready-to-send draft:
(1) quarterly MOQ-tax crosses a threshold -- agent proposes a lower MOQ with a volume
commitment offer; (2) supplier consistently delivers at the late end of their window --
agent requests a tighter window, citing holding cost data; (3) contracted price has
drifted above the commodity benchmark -- agent drafts a renegotiation with benchmark
data and a comparable supplier quote as leverage.

**Contract lifecycle management.** At 60 days before expiry: full performance report
(on-time rate, fill rate, window compliance, price vs. benchmark) and a negotiation
brief. At 30 days: draft renewal counter-proposal or termination notice.

---

## Architecture

### Data Entry -- Three Paths, No Cameras, No Sensors

1. **Chat / natural language** -- workers type consumption events; managers enter
   retailer orders; agents update the database
2. **Pre-seeded database** -- Faker-generated ingredient lots, batches, pallets,
   shipments, and supplier histories (five suppliers with distinct personalities:
   reliable, cheap-but-late, high-MOQ, seasonally disrupted, new entrant)
3. **Simulated event stream** -- Python publisher writing inventory deltas, yield
   readings, and supplier risk signals to Redis every few seconds

### Agent Architecture

LangGraph stateful multi-agent orchestrator. Each specialist agent owns a bounded
set of tools. The orchestrator routes by intent; agents call each other's read-only
tools but write only to their own domain. Every order, schedule change, and transfer
requires explicit human confirmation before it commits.

```text
OrchestratorAgent
  InventoryAgent    -- lot records, substitution, cross-facility transfer
  SchedulerAgent    -- MES schedule, OR-Tools optimizer, allergen changeover
  ProcurementAgent  -- supplier master, MOQ engine, landed cost, PO generation, negotiation
  YieldAgent        -- yield variance, anomaly diagnosis, CMMS work orders
  ESGAgent          -- waste counter, root-cause patterns, Scope 3 report
```

### Tech Stack

| Layer | Technology | Notes |
| :--- | :--- | :--- |
| UX chassis | PixiJS + @pixi/react | 2D WebGL canvas; animated truck units, pan/zoom, toggleable layers |
| Frontend shell | Next.js 15 + React 19 + Tailwind + TypeScript | App router; SSE for streaming chat |
| Graph visualization | react-flow | Lot genealogy graph (recall / traceability) |
| Charts | Recharts | Demand forecast bands, yield curves |
| Agent orchestrator | LangGraph (Python) | Stateful multi-agent; human-in-the-loop checkpoints |
| LLM | Claude (Anthropic) via langchain-anthropic | Structured output for intent classification and response generation |
| Backend API | FastAPI + Pydantic v2 | Async; one router file per domain |
| Database | PostgreSQL 16 + pgvector | pgvector enabled for SOP/formula embedding search |
| Queue / event stream | Redis 7 | Simulated telemetry; async job queue |
| Demand forecasting | LightGBM or Prophet | Per-SKU daily forecast; CPU-fast, no GPU needed |
| Scheduling optimizer | Google OR-Tools | Allergen-aware changeover constraint solver |
| Network balancer | OR-Tools or NetworkX min-cost-flow | Cross-plant ingredient transfer optimizer |
| Voice STT | faster-whisper (small model) | Local inference; custom vocabulary for bakery terms |
| Voice input | Web Speech API | Browser-native; no extra hardware |
| Package manager | uv (Python) | All Python services |
| Mock integrations | FastAPI routes | SAP S/4 HANA, MES, CMMS -- one env-var swap per system |
| Local dev | Docker Compose | postgres + redis always live; full stack via profile |
| Deploy | Vercel (frontend) + Render (backend + agent) | Free tiers; single public demo URL |

### Monorepo Layout

```text
bakery-pilot/
  agent/                  -- LangGraph multi-agent (Python, uv)
    agent/
      graph.py            -- stateful graph definition
      state.py            -- AgentState pydantic model
      tools/              -- one file per tool; thin HTTP wrappers over backend
      prompts/            -- system and intent-classification prompts
  backend/                -- FastAPI API server (Python, uv)
    app/
      api/                -- one router per domain (inventory, suppliers, schedules, ...)
      services/           -- business logic (procurement.py, scheduler.py, ...)
      db/                 -- SQLAlchemy models and session
      integrations/       -- SAP mock, MES mock, CMMS mock
  frontend/               -- Next.js 15 app (TypeScript, npm)
    src/
      app/                -- pages: chat, materials, schedule, scorecard, facilities
      components/         -- ActionCard, SupplierCard, FlowSightCanvas, YieldCounter, ...
      lib/api.ts          -- typed HTTP client for all backend endpoints
  infra/
    supabase/
      schema.sql          -- full DB schema (append-only; never edit existing tables)
      seed.sql            -- facilities, suppliers, warehouse costs
    seed_lots.py          -- generates 150+ ingredient lots with realistic expiry dates
    event_stream.py       -- Redis publisher: inventory deltas, yield events, risk signals
  shared/
    schemas/              -- JSON Schema draft-2020-12; M3 owns; frozen after Day 1
  docker-compose.yml
  Makefile
```

### Database Schema (key tables)

| Table | Purpose |
| :--- | :--- |
| `facilities` | Four FGF plants with cold/dry storage capacity |
| `suppliers` | Full master: MOQ, packing unit, lead-time distribution, delivery window, pricing, discount tiers, payment terms, contract |
| `ingredient_lots` | Per-lot tracking with expiry date and computed spoilage risk score |
| `warehouse_costs` | $/kg/day per storage type (frozen/refrigerated/dry) per facility |
| `moq_tax_ledger` | Quarterly over-ordering cost per supplier -- negotiation evidence |
| `dock_schedules` | Receiving slot capacity and bookings per plant per day |
| `production_formulas` | Ingredient bill-of-materials per SKU |
| `production_schedules` | Approved and suggested schedules with waste_avoided_kg |
| `supplier_orders` | PO drafts through to confirmed; status state machine |
| `retailer_orders` | Firm POs from Costco, Walmart, Loblaws, Whole Foods |
| `demand_forecasts` | Per-SKU daily forecast from LightGBM/Prophet |
| `disruption_signals` | Supplier risk events (weather, commodity spike, miss) |
| `negotiation_drafts` | Auto-generated negotiation emails pending manager send |
| `production_runs` | Actual vs. theoretical yield per line per shift |
| `finished_goods_pallets` | Pallet shelf-life tracking; FEFO outbound routing |
| `waste_events` | Append-only ESG audit log with avoided flag |

---

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Python 3.11+ with [uv](https://github.com/astral-sh/uv)
- Node.js 20+ and npm
- [GitHub CLI](https://cli.github.com/) (`gh`) for auth

### Setup

```bash
git clone https://github.com/<your-org>/bakery-pilot.git
cd bakery-pilot
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY
# Leave SUPPLIER_USE_MOCK=true until you wire a real ERP
```

### Run

```bash
# Start postgres + redis
make up

# Apply schema and seed data
make schema.migrate
make schema.seed          # inserts facilities, suppliers, warehouse costs, and 150+ ingredient lots

# Start the backend (FastAPI on :8000)
make backend.install
make backend.run

# Start the agent (LangGraph)
make agent.install
make agent.run

# Start the frontend (Next.js on :3000)
make frontend.install
make frontend.run

# (Optional) Start the simulated event stream
python infra/event_stream.py
```

### Full stack in Docker

```bash
make up.full              # builds and starts all services
```

### Makefile reference

```bash
make up                   # postgres + redis only
make up.full              # all services in Docker
make down                 # stop everything
make reset                # wipe volumes (destructive)
make schema.migrate       # apply infra/supabase/schema.sql
make schema.seed          # apply seed.sql + run seed_lots.py
make seed.lots            # regenerate ingredient lots only
make seed.events          # start Redis event stream publisher
make backend.run          # FastAPI on :8000
make agent.run            # LangGraph agent
make frontend.run         # Next.js on :3000
make backend.test         # pytest for backend
make agent.test           # pytest for agent
```

---

## Scripted Demo (5 minutes)

| Time | Action | What the judge sees |
| :--- | :--- | :--- |
| 0:00 | FlowSight opens | Canada map; four plant nodes; supplier rail left; retailer rail right; two plants flashing amber |
| 0:30 | Click amber Plant 1 | Agent: *"0.8 kg blueberries on hand, 12 kg needed for 14:00 run. Alternatives: lemon poppy seed (full capacity), chocolate chip (full capacity). Reorder queued."* |
| 1:15 | Confirm substitution | Schedule re-tiles; SAP PO appears; waste counter +$1,200; truck spawns from Supplier B |
| 2:00 | Risk layer on -- news ticker fires | Supplier C halo turns red; bridge PO to Supplier A drafted; one click confirms; MOQ-tax badge updates |
| 2:30 | Chat: *"How much are we over-ordering from Supplier A due to MOQs?"* | *"$1,840 this quarter. Negotiation threshold: $3,000. Three more over-sized orders will trigger a draft proposal."* |
| 3:00 | Retailer layer -- Costco PO arrives 35% above forecast | Three negotiation options appear; manager picks one; draft sent |
| 3:45 | FactoryView, yield layer on | Line 2 waste counter climbing; *"Dough divider drift -- last calibrated 47 days ago."* Work order drafted |
| 4:30 | Shelf-life layer, Plant B warehouse | 12 pallets red; agent ranks reroute vs. donate; one click dispatches |
| 4:50 | Scorecard panel | $21K waste avoided; 1.9 t CO2e; MOQ-tax $1,840 flagged; 3 disruptions caught before impact |

---

## What We Are Not Building

- No cameras or computer vision
- No physical IoT hardware (sensors, RFID, edge devices)
- No live ERP access (SAP is mocked; one env-var swap to wire the real endpoint)
- No live SCADA or OPC-UA (asset telemetry is simulated)
- No real supplier API calls (all mocked with the same interface pattern)
- No real retailer POS or EDI integration (all mocked)
- No compliance or regulatory reporting (FSMA-204, HACCP)
- No asset health monitoring or predictive maintenance

Every external integration has a mock behind a clearly labeled swap point in code.
The mock and the real client are byte-identical in interface -- switching is one
environment variable.

---

## Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Backend
DATABASE_URL=postgresql://bakery:bakery@localhost:5432/bakery
REDIS_URL=redis://localhost:6379
ALLOWED_ORIGINS=http://localhost:3000

# Mock toggles (set to false to wire real endpoints)
SUPPLIER_USE_MOCK=true      # SAP S/4 HANA PO endpoint
MES_USE_MOCK=true           # Manufacturing Execution System
CMMS_USE_MOCK=true          # Maintenance work orders

# Frontend
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000

# Optional
CBOT_WHEAT_API_KEY=         # commodity price feed; falls back to seeded price series
NEWS_API_KEY=               # supplier risk news signal; falls back to seeded events
```

---

## Development Phases

Five phases with one hard rule: the end-to-end walking skeleton (chat -> tool call ->
action card -> confirm -> DB write) goes green at the end of Phase 1 and stays green
every evening after. Every later phase is depth on top of that path, never a
replacement of it. Cut Phase 4 stretch features before cutting Phase 1 polish -- a
judge sees one path five times, not five paths once.

### Phase 1 -- MVP

- **Goal:** Chat answers *"what can we bake?"* and confirms a procurement order with total landed cost.
- **Definition of done:** A user types a shortage question, the InventoryAgent ranks substitutions against expiring lots, the ProcurementAgent surfaces an action card with unit price + MOQ overage + holding cost, the user confirms, the order persists, the schedule re-tiles. Walking skeleton green.
- **Tech pulled from the stack:** PostgreSQL 16 (`ingredient_lots`, `suppliers`, `warehouse_costs`); FastAPI routers (`inventory`, `suppliers`); LangGraph orchestrator + InventoryAgent + ProcurementAgent; Claude via langchain-anthropic; Next.js 15 chat shell + `ActionCard`; Docker Compose (postgres + redis).
- **Lead:** M3, with M2 wiring the agent loop and M4 wiring the chat shell.

### Phase 2 -- Production loop

- **Goal:** Retailer order in, waste-first schedule out.
- **Definition of done:** A retailer PO entered in `/schedule` triggers OR-Tools, which returns an allergen-aware schedule that prefers near-expiry lots. The schedule diff renders before/after; demand bands chart loads on `/scorecard`; SchedulerAgent answers *"why this schedule?"* with the binding constraints.
- **Tech pulled from the stack:** Google OR-Tools (allergen changeover constraint + waste-first objective); LightGBM or Prophet (per-SKU daily forecast); Recharts (forecast bands, schedule diff); `production_formulas` + `production_schedules` + `demand_forecasts` tables; SchedulerAgent.
- **Lead:** M1.

### Phase 3 -- Full procurement

- **Goal:** Delivery window optimizer, MOQ-tax ledger, disruption risk feed, negotiation drafts.
- **Definition of done:** Each supplier order picks a specific delivery day within its window that minimizes holding cost; the MOQ-tax ledger accumulates per-quarter over-ordering cost; the Redis event stream flips supplier halos in the UI when risk fires; each of the three negotiation triggers (MOQ threshold crossed, late-window pattern, price drift vs. benchmark) produces a draft email pending manager send.
- **Tech pulled from the stack:** OR-Tools (delivery window + dock scheduling); Redis 7 (disruption_signals stream); pgvector (RAG over past disruptions and SOPs); Claude (negotiation draft generation); `dock_schedules` + `moq_tax_ledger` + `disruption_signals` + `negotiation_drafts` tables; one FastAPI router per domain.
- **Lead:** M3.

### Phase 4 -- ESG, yield, finished goods

- **Goal:** Yield counter live, ESG scorecard, pallet FEFO.
- **Definition of done:** YieldWatch shows actual-vs-theoretical variance per line per shift with a live dollar waste counter and anomaly diagnosis that drafts a CMMS work order; ESG scorecard renders waste avoided + CO2e + a downloadable Scope 3 PDF; finished-goods pallets ranked FEFO with reroute / donate / write-off options on each.
- **Tech pulled from the stack:** `production_runs` + `waste_events` + `finished_goods_pallets` tables; LightGBM (yield anomaly detection); YieldAgent + ESGAgent; ReportLab or WeasyPrint (Scope 3 PDF); CMMS mock.
- **Lead:** M1 and M3.

### Phase 5 -- FlowSight

- **Goal:** Animated Canada-map cockpit with toggleable layers and a time scrubber.
- **Definition of done:** A PixiJS canvas renders four plants, five suppliers, and four retailers as nodes; truck units animate between them on confirmed transfers; layer toggles (risk / yield / shelf-life / forecast) reveal the corresponding overlays; the time scrubber replays the last 24 hours of events; the 5-minute scripted demo runs end-to-end without manual intervention.
- **Tech pulled from the stack:** PixiJS + @pixi/react (2D WebGL canvas); react-flow (lot genealogy graph for recall view); SSE for live updates from FastAPI; faster-whisper for in-cockpit voice.
- **Lead:** M5.

---

## Phase 1 -- MVP: Detailed Plan

The MVP is the **walking skeleton**: a single end-to-end path from user message
to confirmed DB write. Every later phase layers depth on top of this path. If the
path is not green by the end of Phase 1, nothing else ships.

### The walking-skeleton path (6 hops)

1. User types a shortage question (*"We're short on blueberries -- what can we bake?"*) into the `/chat` shell.
2. Frontend POSTs the message to `/api/chat` over SSE.
3. LangGraph orchestrator classifies intent and routes to **InventoryAgent**, which calls the substitution tool to rank alternative production runs achievable with current stock.
4. Orchestrator hands the recommendation to **ProcurementAgent**, which calls `compute_landed_cost` and emits an `action_card` JSON with unit price + MOQ overage + holding cost.
5. Frontend streams the agent reply and renders the `ActionCard` with a single confirm button.
6. User confirms -> backend `POST /api/orders` persists the supplier order, the SAP mock returns a confirmation number, and `/materials` re-renders with updated risk badges.

If those 6 hops run green from `make up.full`, the MVP is done.

### Day-1 schema freeze (M3 owns; locks by lunch)

- **DB tables for MVP:** `facilities`, `suppliers`, `ingredient_lots`, `warehouse_costs`, `supplier_orders`, `production_formulas` (minimal columns only -- everything else is additive in later phases).
- **`shared/schemas/action_card.schema.json`** -- the contract M2 emits and M4 renders.
- **`shared/schemas/ingredient_lot.schema.json`** -- the shape M1's substitution endpoint returns.
- **`shared/schemas/supplier_order.schema.json`** -- the shape M3 persists after confirm.

After lunch on Day 1, schema changes require team agreement. Additive columns are allowed any time.

### M1 -- ML / Optimization Engineer in MVP

**Owns:**

- **Spoilage risk score** (`backend/app/services/spoilage.py`) -- pure function `kg_on_hand / kg_scheduled_before_expiry`; >= 1.0 = red, 0.7-1.0 = amber, < 0.7 = green.
- **Substitution engine, MVP version** (`backend/app/services/substitution.py`) -- given a blocked SKU, return ranked alternative SKUs whose ingredient bills can be fully covered by current `ingredient_lots`; rank by margin contribution (a seeded constant per SKU is fine for MVP).
- The min-cost-flow network balancer is **not** in MVP -- the substitution tool returns "no transfer recommended" until Phase 2.

**Tech for MVP:** Python stdlib + pandas. No OR-Tools yet -- a greedy ranking is enough to demo the path; depth comes in Phase 2.

**Handoffs:** M3 calls these as pure functions from the API layer; M2's tool layer wraps the same functions for the agent.

### M2 -- AI / Agent Engineer in MVP

**Owns:**

- **LangGraph orchestrator** (`agent/agent/graph.py`) -- 3-node graph: classify intent -> route to specialist -> render action_card or plain reply.
- **InventoryAgent + 2 tools** -- `query_materials` (read-only lot lookup) and `substitution_engine` (HTTP call to M1's service).
- **ProcurementAgent + 2 tools** -- `compute_landed_cost` (HTTP call to M3's service) and `build_supplier_order` (emits an `action_card` JSON pending confirm).
- **`action_card` JSON contract** -- frozen Day 1 against `shared/schemas/action_card.schema.json`.
- **Prompts** -- `agent/agent/prompts/orchestrator.md` (system) and `intent_classifier.md` (router).
- **SSE streaming logic** wired through the chat endpoint M3 hosts.

**Tech for MVP:** LangGraph (Python, uv); langchain-anthropic with Claude Sonnet 4.6 (Opus 4.7 stays reserved for Phase 3 negotiation drafts); httpx for tool HTTP calls.

**Handoffs:** M4 consumes the SSE stream and the `action_card` JSON; M3 hosts the underlying API endpoints the tools call.

### M3 -- Backend / Procurement Engineer in MVP

**Owns:**

- **Schema freeze + seed data** -- inserts 4 facilities, 5 suppliers (one per personality: reliable, cheap-but-late, high-MOQ, seasonally disrupted, new entrant), 30+ ingredient lots with realistic expiry dates, 10+ warehouse cost rows.
- **FastAPI app skeleton** (`backend/app/main.py`) and routers: `inventory`, `suppliers`, `orders`, `chat`.
- **Endpoints required for MVP:**
  - `GET /api/lots` -- list with spoilage badge
  - `GET /api/lots/{id}/spoilage` -- single-lot score
  - `GET /api/substitution_candidates?sku=...` -- proxies M1's substitution service
  - `GET /api/suppliers` -- master list with MOQ and price
  - `POST /api/orders` -- the confirm endpoint; persists `supplier_orders` row + posts to SAP mock
  - `POST /api/chat` -- SSE proxy to the LangGraph orchestrator
- **Landed cost service** (`backend/app/services/landed_cost.py`) -- `unit_price * qty + overage_qty * holding_cost_per_day * days_held`.
- **MOQ engine, MVP version** (`backend/app/services/moq_engine.py`) -- detects demand < MOQ, computes overage; the quarterly tax ledger lands in Phase 3.
- **SAP mock** (`backend/app/integrations/sap_mock.py`) -- accepts a PO, returns a confirmation number after ~200 ms latency.
- **`shared/schemas/*.schema.json`** -- publishes Day 1, locks after lunch.

**Tech for MVP:** FastAPI + Pydantic v2; SQLAlchemy 2.0 async; PostgreSQL 16; Faker for seed data; httpx for the SAP mock client.

**Handoffs:** Schema + endpoints published Day 1 so M1, M2, M4 are unblocked from minute one.

### M4 -- Frontend Engineer in MVP

**Owns:**

- **Next.js 15 app shell** -- `layout.tsx`, `globals.css`, Tailwind wired up.
- **Typed API client** (`frontend/src/lib/api.ts`) -- `getLots()`, `getSubstitutionCandidates(sku)`, `postOrder(payload)`, typed against the JSON Schemas M3 published.
- **`ChatBox` component** -- SSE-streamed messages; agent reply chunks render as they arrive; input box at bottom.
- **`ActionCard` component** -- renders an `action_card` JSON as a 3-line summary (unit price / MOQ overage / holding cost) with a single confirm button that POSTs to `/api/orders`.
- **`/chat` page** -- chat shell + action card render area.
- **`/materials` page** -- lot table with red/amber/green spoilage badges; "see alternatives" button per red lot links to `/chat` with a pre-filled query.

**Tech for MVP:** Next.js 15 + React 19 + Tailwind + TypeScript; native EventSource for SSE. No PixiJS or react-flow yet -- those land in Phase 5 and Phase 2 respectively.

**Handoffs:** Consumes M2's SSE chat API and M3's REST endpoints; FlowSight integration with M5 starts in Phase 5.

### M5 -- FlowSight + DevOps / PM in MVP

**Owns:**

- **`docker-compose.yml`** -- postgres + redis stand up cleanly with `make up`; full stack stands up with `make up.full`.
- **Makefile** -- every target in the Makefile reference section works end-to-end.
- **Deployment skeleton** -- Vercel project for frontend, Render service for backend + agent, env-var checklist filled in.
- **Walking-skeleton smoke test** -- end-to-end test (pytest fixture or bash script) that drives the 6-hop path against a live local stack and exits non-zero if any hop fails; runs in CI on every push.
- **Nightly green-build gate** -- if the smoke test fails, the team fixes it before adding features.
- **PM duties** -- Day-1 schema freeze enforcement, daily standup, scope cuts when needed, ownership of the MVP demo script (lines 0:00-1:15 of the Scripted Demo).
- **FlowSight placeholder** -- `FlowSightCanvas` renders an empty canvas with the four plant nodes positioned; animations come in Phase 5.

**Tech for MVP:** Docker Compose; Vercel CLI; Render Blueprint; Make; pytest or bash for the smoke test.

**Handoffs:** Provides M1-M4 a green local stack from minute one; reports daily skeleton-green status to the team.

### MVP definition of done

- `make up.full` brings the entire stack up with one command and exits cleanly.
- A user can open `/chat`, type *"What can we bake if blueberries are short?"*, and see a streamed reply with at least two substitution candidates ranked by margin.
- The reply includes a rendered `ActionCard` with unit price, MOQ overage, holding cost, and a confirm button.
- Clicking confirm POSTs the order, persists it to `supplier_orders`, returns a SAP confirmation number, and re-renders `/materials` with updated spoilage badges.
- The smoke test (M5) passes locally and in CI.
- All MVP-scoped `shared/schemas/*.schema.json` files are committed and frozen.

### MVP cut order (if behind schedule)

If MVP is at risk, cut in this order -- preserve the green walking skeleton above all else:

1. **Multi-candidate substitution ranking** -- ship with one candidate instead of three.
2. **Holding cost in landed cost** -- ship with unit price + MOQ overage only.
3. **Spoilage badges on `/materials`** -- a plain text list is acceptable.
4. **SAP confirmation latency simulation** -- return immediately.
5. **CI smoke test** -- run locally only for MVP, wire to CI in Phase 2.

Do **not** cut: the SSE chat, the `ActionCard` confirm, the DB write. Those three
are the walking skeleton.

---

## Key Engineering Rules

- **Schema freeze:** `shared/schemas/*.schema.json` is the cross-service contract.
  M3 owns it. Changes require full-team agreement. Additive changes (new tables,
  new optional columns) are allowed at any time.
- **Human in the loop:** every agent action that writes state (order, schedule,
  transfer) must go through an `action_card` approval step. The agent never commits
  without an explicit confirm.
- **Mock parity:** every external integration has a mock that is byte-identical in
  interface. Never diverge the mock from the real client.
- **Append-only audit tables:** `inventory_events` and `waste_events` are never
  updated -- only inserted. Corrections are new rows.
- **Walking skeleton first:** the end-to-end path (chat message -> tool call ->
  action card -> confirm -> DB write) must stay green every evening from Day 1
  onward. Features are depth on top of that path, never replacements of it.

---

## Team (5 members)

Roles split along the architecture's natural seams so each member builds against the
Day-1 schema freeze in parallel. Names are placeholders -- assign based on individual
strengths and current ownership of named modules.

### Roles at a glance

| Member | Role | Modules owned |
| :--- | :--- | :--- |
| **M1** | ML / Optimization Engineer | M1 IngredientIQ (lead), M5 YieldWatch (lead), M7 VoiceLog STT |
| **M2** | AI / Agent Engineer | M3 Demand + OrderSense agent surface, M7 LangGraph orchestrator + RAG (lead) |
| **M3** | Backend / Procurement Engineer | M4 Procurement (lead), M6 ESG (lead), M8 Finished Goods (lead), DB schema, integration mocks |
| **M4** | Frontend Engineer | All UI surfaces: chat, action cards, dashboards, charts, genealogy graph |
| **M5** | FlowSight + DevOps / PM | M2 Scheduler integration surface, M9 FlowSight (lead), Docker, deploy, demo |

### M1 -- ML / Optimization Engineer

- Owns Module 1 IngredientIQ: spoilage risk score per lot, substitution candidate ranking, cross-facility transfer min-cost-flow.
- Owns Module 5 YieldWatch: actual-vs-theoretical yield variance per line/shift, real-time dollar waste counter, anomaly diagnosis that drafts a CMMS work order.
- Owns the demand forecasting model (per-SKU daily) that M2 wraps as an OrderSense tool.
- Owns the VoiceLog STT layer in Module 7 (custom bakery vocabulary).
- **Tech:** Google OR-Tools (substitution, allergen scheduler, min-cost-flow, delivery window); LightGBM / Prophet (demand + anomaly); NetworkX (network balancer fallback); faster-whisper (voice STT).
- **Hands off to:** M3 a stable `spoilage_risk_score` column and substitution-candidates endpoint; M5 the yield counter event stream and the schedule-diff payload.

### M2 -- AI / Agent Engineer

- Owns the LangGraph orchestrator and the five specialist agents (Inventory, Scheduler, Procurement, Yield, ESG).
- Owns the Module 7 RAG layer: pgvector embeddings over SOPs, production formulas, and allergen matrices.
- Owns the OrderSense agent surface (Module 3) -- turns M1's demand model into a retailer-PO reconciliation tool.
- Defines and enforces the `action_card` contract: every write goes through human-in-the-loop confirm.
- **Tech:** LangGraph (Python, uv); langchain-anthropic + Claude (Sonnet 4.6 default; Opus 4.7 reserved for negotiation drafts); pgvector; FastAPI streaming endpoints.
- **Hands off to:** M4 a stable SSE chat API and `action_card` JSON shape; consumes M3's tool endpoints and M1's optimizer outputs.

### M3 -- Backend / Procurement Engineer

- Owns Module 4 Procurement Intelligence end-to-end -- the most differentiated module: total landed cost, MOQ engine, MOQ-tax ledger, delivery window optimizer, dock scheduling, negotiation triggers, contract lifecycle.
- Owns Module 6 Sustainability and ESG: waste counter aggregation, root-cause patterns, retailer Scope 3 PDF.
- Owns Module 8 Finished Goods: pallet shelf-life, FEFO routing, stranded inventory recovery.
- Owns the DB schema (`infra/supabase/schema.sql`), the FastAPI backend skeleton, all integration mocks (SAP S/4 HANA, MES, CMMS), and `shared/schemas/*.schema.json` (the Day-1 contract freeze).
- **Tech:** FastAPI + Pydantic v2; PostgreSQL 16 + pgvector; Redis 7; SQLAlchemy; OR-Tools (delivery window + dock scheduling); ReportLab or WeasyPrint (Scope 3 PDF).
- **Hands off to:** everyone the API contract and schema by end of Day 1; pairs with M5 on docker-compose and seed scripts.

### M4 -- Frontend Engineer

- Owns the Next.js 15 + React 19 app shell, routing, and the typed API client (`src/lib/api.ts`).
- Builds the chat UI with SSE streaming, `ActionCard`, `SupplierCard`, `YieldCounter` components.
- Builds dashboard pages: `/materials` (risk badges), `/schedule` (diff view), `/scorecard` (ESG + waste + MOQ-tax), `/facilities`.
- Builds the lot-genealogy graph (react-flow) and the forecast / yield charts (Recharts).
- Coordinates with M5 on the FlowSight cockpit -- the canvas is M5's, the surrounding chrome and confirm overlays are M4's.
- **Tech:** Next.js 15 + React 19 + Tailwind + TypeScript; react-flow; Recharts; native EventSource (SSE).
- **Hands off to:** M5 a deployable frontend; consumes M2's chat + action_card API and M3's domain endpoints.

### M5 -- FlowSight + DevOps / PM

- Owns Module 9 FlowSight: PixiJS + @pixi/react top-down strategy-game canvas, plant + supplier + retailer nodes, animated truck units, pan/zoom, toggleable layers (risk / yield / shelf-life / forecast), time scrubber.
- Owns the Module 2 Scheduler integration surface (the optimizer is M1's; the UI surface is M5's, coordinated with M4).
- Owns deployment: Docker Compose, Vercel (frontend), Render (backend + agent), env-var management, single stable public demo URL.
- Acts as integration owner -- keeps the walking skeleton green every evening and unblocks cross-team handoffs.
- Runs the demo script (Scripted Demo, 5 minutes) and the 90-second pitch.
- **Tech:** PixiJS + @pixi/react; Docker Compose; Vercel; Render; Makefile owner.
- **Hands off to:** the team a reliable demo environment; pairs with M3 on docker-compose and M4 on the canvas-to-React layout.

### Cross-team dependencies

- **Day-1 contract freeze:** M3 publishes `shared/schemas/*.schema.json` (lot, action_card, order, schedule_diff, negotiation_draft) so M1, M2, M4, M5 build against stable interfaces. Additive changes allowed; renames require team agreement.
- **Optimizer -> agent:** M1's substitution, scheduler, and forecast outputs are wrapped as M2's tool responses; the JSON shape is locked alongside the schema freeze.
- **Agent -> UI:** M2's `action_card` JSON drives M4's `ActionCard` component and M5's confirm overlays on FlowSight nodes -- one shape, two render targets.
- **Backend <-> FlowSight:** M3 and M5 jointly own the SSE event channel that streams supplier risk, yield deltas, and pallet shelf-life updates into the canvas.
- **Everyone -> M5:** walking skeleton checked end-to-end every evening; nightly green-build gate is non-negotiable.

---

## Pitch (90 seconds)

> FGF Brands makes over 2 billion baked goods a year. At this hackathon, a stakeholder
> gave us one sentence: *"If we don't have blueberries, we want to know what else we
> can bake."*
>
> That sounds simple. Behind it is a cascade: which lots are expiring, which lines can
> run, which allergen runs have to be separated -- and upstream: which supplier is
> about to miss their delivery, whether the order we placed last Tuesday was forced
> 40% over what we needed because of a minimum order quantity, and whether our
> contract with that supplier is even worth renewing.
>
> BakeryPilot runs that entire cascade in seconds. Five specialist agents. One
> interface. And you don't see it in a spreadsheet -- you see it on a map. A live,
> strategy-game cockpit of FGF's entire supply network. Every plant, every supplier,
> every pallet, every truck, on one screen.
>
> No cameras. No sensors. Just the data FGF already has, finally made actionable.
> And the suppliers FGF buys from, finally held accountable.
