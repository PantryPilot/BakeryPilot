# Services — how to reach everything

Every public-facing URL, every internal service, and how to talk to each one.
For how to deploy this in the first place, see [deployment.md](deployment.md).

The examples below use `134.87.11.86` as the public IP — replace with yours.

---

## Public URLs (the only things the internet can see)

All traffic enters through **nginx on port 80**. There are no other public
ports. The frontend, backend, and all three datastores live on the internal
Docker network and are unreachable from outside the VM.

| URL | What it is | Notes |
| --- | --- | --- |
| `http://134.87.11.86/` | FlowSight cockpit (Next.js) | The product UI |
| `http://134.87.11.86/chat` | Chat page | SSE-streamed responses from the LangGraph orchestrator |
| `http://134.87.11.86/materials` | Materials / ingredient lots view | |
| `http://134.87.11.86/schedule` | Production schedule | |
| `http://134.87.11.86/scorecard` | Supplier scorecard | |
| `http://134.87.11.86/facilities` | Multi-facility map view | |
| `http://134.87.11.86/admin` | **Built-in database browser** — tables, paginated rows, sorting | Backed by `/api/admin/*` endpoints |
| `http://134.87.11.86/healthz` | Liveness probe | `{"status":"ok"}` |
| `http://134.87.11.86/docs` | **FastAPI Swagger UI** — interactive, "Try it out" | All 49 endpoints |
| `http://134.87.11.86/redoc` | ReDoc — read-only API reference | Same data as `/docs`, prettier |
| `http://134.87.11.86/openapi.json` | Raw OpenAPI 3 spec | Drop into Postman / Insomnia |
| `http://134.87.11.86/api/*` | All 49 REST + SSE endpoints | See sections below |

### How nginx routes

```
/                       → frontend:3000
/api/*                  → backend:8000     (REST + SSE)
/healthz                → backend:8000
/docs, /redoc, /openapi.json → backend:8000
```

---

## Internal-only services (no public access)

These run on the `bakery-pilot_default` Docker bridge. The host doesn't bind
them. You reach them via `docker compose exec` or via the backend's API
surface.

| Service | Internal address | Image | Volume |
| --- | --- | --- | --- |
| Backend (FastAPI + LangGraph) | `http://backend:8000` | `bakery-pilot/backend:local` | — |
| Frontend (Next.js 15) | `http://frontend:3000` | `bakery-pilot/frontend:local` | — |
| PostgreSQL 16 + pgvector | `postgres:5432` | `pgvector/pgvector:pg16` | `bakery-pilot-postgres-data` |
| Redis 7 | `redis:6379` | `redis:7-alpine` | `bakery-pilot-redis-data` |
| MongoDB 7 | `mongo:27017` | `mongo:7` | `bakery-pilot_mongo-data` |

### Why not expose 5432 / 6379 / 27017?

| Port | Risk | Mitigation |
| --- | --- | --- |
| Postgres `:5432` | Default `bakery:bakery` credentials — full RW access | Keep internal; browse via `/admin` or `/api/admin/*` |
| Redis `:6379` | No auth, `CONFIG SET dir` RCE trick is well-known | Keep internal |
| Mongo `:27017` | No auth | Keep internal |

If you really need direct access (psql / DBeaver / mongosh from your laptop),
tighten the OpenStack security group to your admin IP, rotate the password,
and add a `ports:` mapping in `docker-compose.prod.yml`. **Do not skip the
password rotation.**

---

## REST API — quick tour

The full spec is at `/docs`. The most useful endpoints to know by hand:

### Read endpoints

```bash
BASE=http://134.87.11.86

curl -s $BASE/api/lots | jq '. | length'                       # 180
curl -s $BASE/api/lots | jq '.[0]'                             # first lot
curl -s $BASE/api/suppliers | jq '.[] | {id: .supplier_id, name, on_time_rate}'
curl -s $BASE/api/disruptions | jq .
curl -s $BASE/api/forecasts?days=7 | jq .
curl -s $BASE/api/schedules | jq .
curl -s $BASE/api/pallets/stranded | jq .
curl -s $BASE/api/esg/counter | jq .                           # $ saved, CO2e avoided
curl -s $BASE/api/esg/patterns | jq .                          # root-cause patterns
curl -s $BASE/api/yield | jq .
```

### Write endpoints (every state-change goes through an action card)

```bash
# 1. Draft a purchase order → returns an action_card in "pending" state
CARD=$(curl -s -X POST $BASE/api/orders/draft \
  -H 'Content-Type: application/json' \
  -d '{
    "supplier_id": "sup-northgrain",
    "items": [{"ingredient_id": "ing-blueberries", "quantity_kg": 200, "unit_price": 5}],
    "delivery_date": "2026-06-15"
  }' | jq -r '.action_card_id')
echo "Draft created: $CARD"

# 2. Inspect the card
curl -s $BASE/api/action_cards/$CARD | jq .

# 3. Confirm it (idempotent) — flips state to "confirmed" and writes the order
curl -s -X POST $BASE/api/action_cards/$CARD/confirm | jq .

# 4. Verify the order landed
curl -s $BASE/api/orders | jq --arg id "$CARD" '.[] | select(.action_card_id == $id)'
```

---

## SSE streams (chat + live overlays)

Three Server-Sent Event endpoints — open with `curl -N`, an `EventSource` in
the browser, or any SSE client.

### `POST /api/chat` — streaming chat with the LangGraph orchestrator

```bash
curl -N -X POST http://134.87.11.86/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "what can we bake if blueberries are short?", "history": []}'
```

Event types emitted:

| `event:` | `data:` payload | Meaning |
| --- | --- | --- |
| `message` | `{"content": "..."}` | A token / word / table row of the response |
| `substitutions` | `{"candidates": [...]}` | Alternate SKUs the agent suggests |
| `action_card` | `{"action_card_id": "..."}` | A state-changing draft the user must confirm |
| `done` | `{}` | Stream end |

Requires `ANTHROPIC_API_KEY` in `.env`. Without it the stream emits
`{"content": "[agent error: ...]"}` and ends cleanly.

### `GET /api/chat/ping` — sanity check for the SSE pipe (no LLM)

```bash
curl -N http://134.87.11.86/api/chat/ping
```

Emits three tokens (`pong from backend!`) and `done`. Useful for verifying
nginx isn't buffering.

### `GET /api/events` — live FlowSight overlays

```bash
curl -N http://134.87.11.86/api/events
```

Emits five events (`yield`, `risk`, `shelf_life`, `yield`, `forecast`) with a
1-second pause between, then `done`. Today this is a deterministic
demo loop in `backend/app/api/events.py`; in production it would fan out from
Redis pub/sub.

### `GET /api/alerts` — alert banner stream

Polled by `frontend/src/components/AlertBanner.tsx`.

---

## Database access

You have three ways to look at the data, in increasing levels of raw control.

### 1. Browser — `/admin` (recommended for poking around)

`http://134.87.11.86/admin` lists every public table with row counts. Click
one to page through rows; sort by column; per_page query string supported.

### 2. JSON API — `/api/admin/*`

```bash
# List tables with row counts
curl -s http://134.87.11.86/api/admin/tables | jq .

# Paginated rows from a single table
curl -s 'http://134.87.11.86/api/admin/tables/ingredient_lots/rows?page=1&per_page=10&sort=expiry_date&order=asc' | jq .
```

### 3. `psql` inside the container (for raw SQL)

```bash
PROD="-f docker-compose.yml -f docker-compose.prod.yml"

# Interactive shell
docker compose $PROD exec postgres psql -U bakery -d bakery

# One-off query
docker compose $PROD exec -T postgres \
  psql -U bakery -d bakery -c "SELECT count(*) FROM ingredient_lots WHERE expiry_date < CURRENT_DATE + 3;"

# Row counts across every table (the Makefile target)
make db.status
```

### Table inventory (what's in Postgres)

```
facilities                4      Master data — the 4 FGF plants
suppliers                 5      One per supplier personality
ingredients              92      Ingredient master from infra/data/
skus                     12
production_lines          9
production_formulas      64
allergen_changeovers     27
warehouse_costs          12
retailers                 4
retailer_orders           8
ingredient_lots         180      Faker-seeded; the live demo data
inventory_events          0      Append-only audit table
supplier_orders           0      Created via /api/orders/draft + confirm
supplier_order_items      0
production_schedules      0
demand_forecasts          0
action_cards              0      Created by every state-changing intent
```

`inventory_events` and `waste_events` are **append-only** — corrections are
new rows, never updates. A trigger enforces this.

### Redis

```bash
docker compose $PROD exec redis redis-cli
docker compose $PROD exec redis redis-cli KEYS '*'
docker compose $PROD exec redis redis-cli INFO | head -20
```

Used by Redis pub/sub fan-out for live events (the `infra/event_stream.py`
publisher is a stub today, so this is mostly idle).

### MongoDB

```bash
docker compose $PROD exec mongo mongosh bakery_pilot
docker compose $PROD exec mongo mongosh --quiet --eval 'db.prompts.find().toArray()'
```

Holds hot-reloadable prompt bodies (`agent/agent/prompts/store.py`). If Mongo
is down or empty, the agent falls back to the `.md` files in the prompts
directory — Mongo is genuinely optional.

---

## Backend Python shell

Useful for "what does the backend think its config is right now?"

```bash
PROD="-f docker-compose.yml -f docker-compose.prod.yml"

docker compose $PROD exec backend python -c \
  "from app.config import settings; print(settings.model_dump())"

# Trigger the agent graph directly (bypass HTTP)
docker compose $PROD exec backend python -c "
from agent.graph import stream
for chunk in stream('what can we bake?', thread_id='test'):
    pass
print('messages:', len(chunk.get('messages', [])))
"
```

---

## Logs

```bash
PROD="-f docker-compose.yml -f docker-compose.prod.yml"

docker compose $PROD logs -f                    # all services, live
docker compose $PROD logs -f backend            # just one
docker compose $PROD logs --tail=200 nginx      # last 200 lines
docker compose $PROD logs --since=10m backend   # last 10 minutes
```

nginx access log includes upstream timing:

```
$remote_addr "$request" $status rt=... uct=... urt=...
```

`urt` (upstream response time) tells you whether the backend or nginx is the
slow one.

---

## Things that are NOT in this deployment

These are mentioned in the dev compose or README but aren't reachable in
production today:

| Mentioned | Status |
| --- | --- |
| Standalone `agent` container | Disabled — agent runs in-process inside the backend. The dev compose's entrypoint (`python -m agent.graph`) is a smoke test that exits. |
| Redis pub/sub event stream | `infra/event_stream.py` is a 1-line stub — `/api/events` returns a deterministic 5-event demo loop. |
| Real SAP / MES / CMMS integrations | All `*_USE_MOCK=true`. The integration factory's real branches are placeholders. |
| Auth on the backend | None. Anyone with the URL can call any endpoint. Acceptable today because the deployment is a demo behind an obscure IP; add Basic Auth in nginx or an OIDC proxy before exposing this to untrusted users. |
| TLS / HTTPS | Not configured. See [deployment.md#tls--https](deployment.md#tls--https). |
| LangSmith / Opik dashboards | SaaS — set `LANGCHAIN_TRACING_V2=true` + keys in `.env` to enable. |

---

## Cheat sheet

```bash
PROD="-f docker-compose.yml -f docker-compose.prod.yml"
IP=134.87.11.86

# Browser bookmarks
http://$IP/              # app
http://$IP/admin         # DB browser
http://$IP/docs          # API explorer

# Health
curl -s http://$IP/healthz

# Live data
curl -s http://$IP/api/lots | jq '. | length'
curl -N http://$IP/api/events

# Container ops
docker compose $PROD ps
docker compose $PROD logs -f backend
docker compose $PROD restart nginx

# DB
docker compose $PROD exec postgres psql -U bakery -d bakery
make db.status
```
