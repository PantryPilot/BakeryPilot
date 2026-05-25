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

| Phase | Goal | Key deliverables |
| :--- | :--- | :--- |
| **1 -- MVP** | Chat answers *"what can we bake?"* and confirms a procurement order with total landed cost | `ingredient_lots` + `suppliers` schema; spoilage risk endpoint; LangGraph wired; `/materials` page with risk badges; action card |
| **2 -- Production loop** | Retailer order in, waste-first schedule out | OR-Tools scheduler; allergen changeover matrix; demand forecasting; schedule diff view |
| **3 -- Full procurement** | Delivery window optimizer, MOQ-tax ledger, disruption risk, negotiation drafts | `dock_schedules`, `disruption_signals`, `negotiation_drafts` schema; event stream publisher |
| **4 -- ESG, yield, finished goods** | Yield counter live, ESG scorecard, pallet FEFO | `production_runs`, `waste_events`, `finished_goods_pallets`; YieldAgent; ESGAgent |
| **5 -- FlowSight** | Animated Canada-map cockpit with toggleable layers | PixiJS canvas; plant/supplier/retailer nodes; truck animations; time scrubber |

Full implementation detail for each phase is in [`DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md).

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

## Contributors

| Contributor | Modules owned |
| :--- | :--- |
| Matin | Module 1 (IngredientIQ lead), Module 5 (YieldWatch), Module 7 VoiceLog |
| Alireza | Module 4 (Procurement lead), Module 6 (ESG), Module 1 spoilage scoring |
| Dan | Module 2 (Scheduler lead), Module 3 OrderSense, Module 8, Module 9 FlowSight |
| Arian | Module 3 (Demand lead), Module 7 LangGraph orchestrator, Module 7 RAG |
| M3 | DB schema, FastAPI backend, shared schemas, seed data, Docker |
| M4 | Next.js frontend, API client, FlowSight canvas integration |

Full feature-to-contributor attribution is in [`Ideas/Alireza/MERGED_PLAN.md`](Ideas/Alireza/MERGED_PLAN.md).

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
