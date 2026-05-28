# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Infrastructure (postgres + redis)
make up               # start postgres + redis only
make up.full          # build and start all services via Docker Compose
make down             # stop everything
make reset            # wipe volumes (destructive)

# Schema and seed
make schema.migrate   # apply infra/supabase/schema.sql
make schema.seed      # apply seed.sql + run backend/scripts/seed_lots.py (150+ ingredient lots)
make seed.lots        # regenerate ingredient lots only
make seed.events      # start Redis event stream publisher (infra/event_stream.py)

# Backend (FastAPI on :8000)
make backend.install  # uv sync
make backend.run      # uvicorn app.main:app --reload --port 8000
make backend.test     # pytest

# Agent (LangGraph)
make agent.install    # uv sync
make agent.run        # python -m agent.graph
make agent.test       # pytest

# Frontend (Next.js on :3000)
make frontend.install # npm install
make frontend.run     # npm run dev (also: npm run build, npm run lint)
```

All Python services use `uv`. Run commands from `backend/` or `agent/` directly with `uv run <cmd>` for one-offs.

## Architecture

BakeryPilot is an agentic AI operations copilot for bakery supply chains. It uses a **LangGraph multi-agent orchestrator** layered on top of a **FastAPI backend**, served to a **Next.js 15 frontend** with a PixiJS map cockpit (FlowSight).

### Service layout

| Service | Port | Location | Runtime |
|---|---|---|---|
| PostgreSQL 16 + pgvector | 5432 | Docker | — |
| Redis 7 | 6379 | Docker | — |
| FastAPI backend | 8000 | `backend/` | Python / uv |
| LangGraph agent | — | `agent/` | Python / uv |
| Next.js frontend | 3000 | `frontend/` | Node / npm |

### Agent architecture

`OrchestratorAgent` routes by intent to five specialist agents. Each agent owns a bounded set of tools (thin HTTP wrappers over backend endpoints in `agent/agent/tools/`). Agents may call each other's read-only tools but write only to their own domain.

```
OrchestratorAgent
  InventoryAgent    -- lot records, substitution, cross-facility transfer
  SchedulerAgent    -- MES schedule, OR-Tools optimizer, allergen changeover
  ProcurementAgent  -- supplier master, MOQ engine, landed cost, PO generation, negotiation
  YieldAgent        -- yield variance, anomaly diagnosis, CMMS work orders
  ESGAgent          -- waste counter, root-cause patterns, Scope 3 report
```

**LLM tier:** Claude Sonnet 4.6 by default; Opus 4.7 reserved for negotiation draft generation. Configured via `langchain-anthropic`.

**Human-in-the-loop:** every state-changing action (order, schedule change, transfer) goes through an `action_card` approval step before committing. The agent never writes silently.

### Frontend pages and key components

Pages live in `frontend/src/app/`: `chat`, `materials`, `schedule`, `scorecard`, `facilities`.

Key components: `ActionCard` (human-in-the-loop confirm), `SupplierCard`, `FlowSightCanvas` (PixiJS map), `YieldCounter`. The typed HTTP client for all backend calls is `frontend/src/lib/api.ts`.

Chat uses `EventSource` (SSE) for streaming responses from the agent.

### Backend structure

```
backend/app/
  main.py            -- FastAPI entrypoint
  api/               -- one router per domain (inventory, suppliers, schedules, ...)
  services/          -- business logic (procurement.py, scheduler.py, ...)
  db/                -- SQLAlchemy models and session
  integrations/      -- SAP mock, MES mock, CMMS mock
```

Mock integrations share a byte-identical interface with real clients. One env-var per system (`SUPPLIER_USE_MOCK`, `MES_USE_MOCK`, `CMMS_USE_MOCK`) swaps between them.

### Database

PostgreSQL 16 with pgvector (for SOP/formula RAG). Schema is in `infra/supabase/schema.sql`. Key tables: `ingredient_lots`, `suppliers`, `warehouse_costs`, `moq_tax_ledger`, `dock_schedules`, `production_formulas`, `production_schedules`, `supplier_orders`, `retailer_orders`, `demand_forecasts`, `disruption_signals`, `negotiation_drafts`, `production_runs`, `finished_goods_pallets`, `waste_events`.

`inventory_events` and `waste_events` are append-only audit tables — corrections are new rows, never updates.

### Shared schemas

`shared/schemas/*.schema.json` is the cross-service contract (JSON Schema draft-2020-12). Shapes defined here: `lot`, `action_card`, `order`, `schedule_diff`, `negotiation_draft`. Additive changes are allowed; renames require team agreement.

### Simulated data

- `backend/scripts/seed_lots.py` — generates 150+ ingredient lots with realistic expiry dates using Faker
- `infra/event_stream.py` — Redis publisher writing inventory deltas, yield readings, and supplier risk signals every few seconds (five suppliers with distinct personalities: reliable, cheap-but-late, high-MOQ, seasonally disrupted, new entrant)

## Key constraints

- **Walking skeleton must stay green:** the end-to-end path (chat → tool call → action_card → confirm → DB write) must remain functional at all times. New features add depth on top of this path, never replace it.
- **Schema is append-only:** never edit existing tables in `infra/supabase/schema.sql`. New tables and optional columns only.
- **Mock parity:** never let a mock integration diverge in interface from the real client it replaces.
- **No GPU required:** LightGBM/Prophet forecasting, OR-Tools scheduling, and faster-whisper STT all run on commodity CPUs.
