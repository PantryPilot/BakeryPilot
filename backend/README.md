# backend

FastAPI + Pydantic v2 backend for BakeryPilot. **Mock mode**: every endpoint
returns deterministic stub data; no DB calls, no LangGraph agent calls. The
shapes are stable enough for the frontend to build against.

## Structure

- `app/main.py` -- FastAPI app, CORS, router mounts
- `app/config.py` -- env settings via pydantic-settings
- `app/mock_data.py` -- deterministic seed data + in-memory mutable state (action cards, orders)
- `app/models/` -- Pydantic request/response models, grouped by domain
- `app/api/` -- one router per domain (each defines its own URL prefix)
- `app/services/` -- placeholder stubs for real business logic (Phase 2+)
- `app/db/` -- placeholder stubs for SQLAlchemy session + models (Phase 1 task)
- `app/integrations/` -- placeholder stubs for SAP / MES / CMMS / Gmail mocks

## Run

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Then open the auto-generated OpenAPI UI at <http://localhost:8000/docs>.

## Endpoint surface

| Method | Path | What it does |
| :--- | :--- | :--- |
| GET | `/healthz` | Liveness probe |
| GET | `/api/lots` | List ingredient lots with spoilage risk |
| GET | `/api/lots/{id}` | Single lot detail |
| GET | `/api/lots/{id}/substitutions` | Substitution candidates |
| GET | `/api/suppliers` | List suppliers |
| GET | `/api/suppliers/{id}` | Supplier scorecard |
| GET | `/api/suppliers/{id}/moq_tax` | MOQ-tax ledger |
| POST | `/api/orders/draft` | Create PO draft -> returns action card |
| GET | `/api/orders` | List confirmed supplier orders |
| GET | `/api/retailer_orders` | List retailer POs |
| POST | `/api/retailer_orders` | Create retailer PO -> triggers schedule action card |
| GET | `/api/action_cards` | List action cards (filter by `?state=`) |
| GET | `/api/action_cards/{id}` | Single action card |
| POST | `/api/action_cards/{id}/confirm` | Idempotent confirm |
| POST | `/api/action_cards/{id}/reject` | Reject |
| GET | `/api/schedules` | List production schedules |
| GET | `/api/schedules/{id}` | Single schedule |
| GET | `/api/schedules/{id}/diff` | Mock before/after diff |
| POST | `/api/schedules/{id}/what_if` | What-if simulation |
| POST | `/api/schedules/{id}/post` | Mock MES post |
| GET | `/api/forecasts` | Per-SKU demand forecast |
| GET | `/api/yield` | Yield runs with variance |
| GET | `/api/yield/{id}` | Single yield run |
| GET | `/api/yield/{id}/diagnose` | Anomaly diagnosis |
| POST | `/api/cmms/work_orders` | Mock CMMS work order |
| GET | `/api/esg/counter` | Running waste counter |
| GET | `/api/esg/patterns` | Root-cause patterns |
| GET | `/api/esg/scope3.pdf` | Stub PDF download |
| GET | `/api/pallets` | Finished goods pallets |
| GET | `/api/pallets/stranded` | Pallets near expiry without committed order |
| POST | `/api/pallets/{id}/route` | Route choice -> action card |
| POST | `/api/chat` | SSE stream: chat response + substitutions + action_card |
| POST | `/api/voice/upload` | Mock STT + 4-level verification routing |
| GET | `/api/notifications/drafts` | List Gmail drafts created |
| POST | `/api/notifications/drafts` | Create one Gmail draft per stakeholder (never sends) |
| GET | `/api/stakeholders` | Stakeholder directory (filter by `?tag=`) |
| POST | `/api/stakeholders/identify` | Identify stakeholders relevant to an action_kind |
| GET | `/api/summaries` | Weekly summaries archive |
| GET | `/api/summaries/{id}` | Single summary |
| POST | `/api/jobs/weekly_summary/run` | Manual trigger (idempotent per week) |
| GET | `/api/events` | SSE stream of mock FlowSight overlay events |
| GET | `/api/disruptions` | Supplier risk signal feed |
| GET | `/api/negotiations` | Negotiation drafts list |
| POST | `/api/negotiations` | Create a draft |
| POST | `/api/negotiations/{id}/mark_sent` | Mark draft sent |

## Quick smoke test

```bash
# Healthz
curl http://localhost:8000/healthz

# List the riskiest lots
curl 'http://localhost:8000/api/lots' | head -c 600

# Stream a chat response (SSE)
curl -N -X POST http://localhost:8000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"what can we bake?"}'

# Draft a PO and confirm it
CARD_ID=$(curl -s -X POST http://localhost:8000/api/orders/draft \
  -H 'Content-Type: application/json' \
  -d '{"supplier_id":"sup_a","items":[{"ingredient_id":"ing_blueberries","quantity_kg":200,"unit_price":5}],"delivery_date":"2026-05-28"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['action_card_id'])")
curl -X POST "http://localhost:8000/api/action_cards/$CARD_ID/confirm"

# Stream live FlowSight events
curl -N http://localhost:8000/api/events
```

## When to leave mock mode

Each router currently imports from `app.mock_data`. Phase 1 task F1.9
(SQLAlchemy session) lands the DB layer; from there each router swaps its
`mock_data.X` reads for `services.X` calls. The route surface and response
shapes do not change -- only the source of the data.
