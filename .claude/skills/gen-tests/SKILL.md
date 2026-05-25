---
name: gen-tests
description: Scan the BakeryPilot codebase and generate a full test suite — pytest for backend and agent, Jest + React Testing Library for frontend — then wire everything into a GitHub Actions CI workflow that runs on every push and pull request. Use this skill whenever someone asks to "add tests", "generate tests", "set up CI", "add GitHub Actions", "write tests for the backend/frontend/agent", or "make tests run on push". Invoke proactively when a service gains new routes or components with no corresponding tests.
---

# gen-tests

Generate a working, no-database-required test suite for BakeryPilot and a GitHub Actions CI workflow that runs on every push.

## Branch

Accept an optional branch argument (e.g. `gen-tests website-matin`). If provided, check out that branch before reading source files and generate tests against its code. If omitted, use the current branch (`git rev-parse --abbrev-ref HEAD`). The GitHub Actions workflow should target whatever branch was resolved — do not hardcode a branch name.

## Architecture context

- **Backend** (`backend/`): FastAPI on port 8000. All endpoints return deterministic mock data from `backend/app/mock_data.py` — no database needed. `httpx` and `pytest` are already in dev dependencies (`backend/pyproject.toml`).
- **Agent** (`agent/`): LangGraph stubs. `pytest` needs to be added to `agent/pyproject.toml` dev deps before tests can run.
- **Frontend** (`frontend/`): Next.js 15 + React 19 + TypeScript 5. Zero test tooling installed — Jest, RTL, and `jest-environment-jsdom` all need to be added. Key component locations: `ActionCard`, `YieldCounter`, `MOQTaxBadge`, `RiskBar`, `StatusBadge`, `Sparkline` are all exported from `src/components/atoms.tsx` (not standalone files). `ChatBox` is exported from `src/components/ChatDrawer.tsx`. API client is at `src/lib/api.ts` (fully implemented, not a stub). React hooks for backend data are in `src/lib/hooks.ts`.
- **No real database required**: the backend runs entirely in mock mode; set `DATABASE_URL=""` or leave it unset in CI — none of the current endpoints touch it.

---

## Step 1 — Survey what already exists

Before writing anything, resolve the repo root and active branch, then check what's already there to avoid overwriting:

```bash
ROOT=$(git rev-parse --show-toplevel)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
find "$ROOT/backend/tests" "$ROOT/agent/tests" "$ROOT/frontend/src/__tests__" -type f 2>/dev/null
ls "$ROOT/.github/workflows/" 2>/dev/null
```

Read `backend/app/main.py` to get the complete list of registered routers (it changes as features grow). Read each `backend/app/api/*.py` file to extract the HTTP method + path for every `@router.get/post/delete` so your tests hit real paths.

---

## Step 2 — Backend tests (pytest + httpx TestClient)

Write these files under `backend/tests/`:

### `backend/tests/__init__.py`
Empty file — makes the directory a Python package.

### `backend/tests/conftest.py`
```python
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app

@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
```

> **Why async?** FastAPI route handlers are `async def`, so using `AsyncClient` avoids implicit event-loop warnings with newer versions of pytest-asyncio. Add `pytest-asyncio` to dev deps and set `asyncio_mode = "auto"` in `pyproject.toml` under `[tool.pytest.ini_options]`.

Actually, for simplicity and zero extra dependencies, use the **synchronous** `TestClient` from Starlette instead:

```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    return TestClient(app)
```

`fastapi.testclient.TestClient` is re-exported from Starlette and is already available because `fastapi` is a dependency. No extra installs needed.

### `backend/tests/test_health.py`
```python
def test_healthz_returns_ok(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["mode"] == "mock"
```

### One test file per router

For each router discovered in `backend/app/api/`, write `backend/tests/test_api_<domain>.py`. The pattern is:

```python
def test_list_<resource>_returns_200(client):
    r = client.get("/api/<prefix>")
    assert r.status_code == 200
    assert isinstance(r.json(), list)

def test_get_<resource>_not_found(client):
    r = client.get("/api/<prefix>/nonexistent_id")
    assert r.status_code == 404
```

For endpoints that need a real ID (e.g., `GET /api/lots/{lot_id}`), pull a known ID from `mock_data` rather than hard-coding a string:

```python
from app import mock_data

def test_get_lot_by_id(client):
    lot_id = mock_data.INGREDIENT_LOTS[0]["lot_id"]
    r = client.get(f"/api/lots/{lot_id}")
    assert r.status_code == 200
    assert r.json()["lot_id"] == lot_id
```

**Routers to cover** (read `main.py` to confirm current list):
`inventory` → `/api/lots`, `suppliers` → `/api/suppliers`, `orders` → `/api/orders`, `action_cards` → `/api/action_cards`, `schedules` → `/api/schedules`, `forecasts` → `/api/forecasts`, `yield_intel` → `/api/yield`, `esg` → `/api/esg`, `pallets` → `/api/pallets`, `notifications` → `/api/notifications`, `stakeholders` → `/api/stakeholders`, `summaries` → `/api/summaries`, `events` → `/api/events`, `disruptions` → `/api/disruptions`, `negotiations` → `/api/negotiations`.

> **Do NOT** test the `chat` or `voice` routers in this pass — they use SSE/multipart streaming that requires extra test setup. Note this clearly in a comment at the top of those skipped files.

### `backend/pyproject.toml` — add pytest config

Add under `[tool.pytest.ini_options]`:
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
```

---

## Step 3 — Agent tests (pytest)

The agent tools are currently empty stubs. Generate minimal smoke tests that confirm:
1. Each tool module imports without error.
2. The `AgentState` schema in `agent/agent/state.py` can be instantiated.

### `agent/tests/__init__.py`
Empty.

### `agent/tests/test_imports.py`
```python
def test_inventory_tools_importable():
    from agent.agent.tools import inventory_tools  # noqa: F401

def test_scheduler_tools_importable():
    from agent.agent.tools import scheduler_tools  # noqa: F401

def test_procurement_tools_importable():
    from agent.agent.tools import procurement_tools  # noqa: F401

def test_yield_tools_importable():
    from agent.agent.tools import yield_tools  # noqa: F401

def test_esg_tools_importable():
    from agent.agent.tools import esg_tools  # noqa: F401
```

### `agent/pyproject.toml` — add pytest dev dependency

Add to `[dependency-groups] dev`:
```toml
[dependency-groups]
dev = ["pytest>=8"]
```

Also add pytest config:
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
```

---

## Step 4 — Frontend tests (Jest + React Testing Library)

### Install packages

Run from `frontend/`:
```bash
npm install --save-dev \
  jest \
  jest-environment-jsdom \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  babel-jest \
  @babel/core \
  @babel/preset-env \
  @babel/preset-react \
  @babel/preset-typescript \
  @types/jest
```

### `frontend/jest.config.ts`
```typescript
import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'babel-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': '<identity-obj-proxy>',
  },
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  passWithNoTests: true,
}

export default config
```

### `frontend/jest.setup.ts`
```typescript
import '@testing-library/jest-dom'
```

### `frontend/babel.config.js`
```javascript
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
}
```

### `frontend/package.json` — add test script

Add `"test": "jest"` to the `scripts` block.

### Test files under `frontend/src/__tests__/`

**`ActionCard.test.tsx`** — `ActionCard` is exported from `atoms.tsx`, not a standalone file:
```typescript
import { render } from '@testing-library/react'
import { ActionCard } from '../components/atoms'

const card = {
  kind: 'supplier_order', agent: 'ProcurementAgent', title: 'Test PO',
  summary: [{ label: 'Qty', value: '100 kg' }],
}

test('ActionCard renders without crashing', () => {
  const { container } = render(<ActionCard card={card} />)
  expect(container).toBeInTheDocument()
})
```

**`atoms.test.tsx`** — test any exported primitives (Pill, etc.) if present:
```typescript
import { render, screen } from '@testing-library/react'
// Import whatever is exported from atoms.tsx
```

Read `frontend/src/components/Shell.tsx`, `ChatBox.tsx`, and `atoms.tsx` before writing tests — generate tests only for props/rendering paths that actually exist in the current code. Don't test fictional props.

---

## Step 5 — GitHub Actions CI workflow

Create `.github/workflows/ci.yml` at the **repo root**:

```yaml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:
    branches: ["**"]

jobs:
  backend-tests:
    name: Backend (pytest)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Cache uv virtualenv
        uses: actions/cache@v4
        with:
          path: backend/.venv
          key: backend-venv-${{ hashFiles('backend/uv.lock') }}
          restore-keys: backend-venv-

      - name: Install dependencies
        run: uv sync --group dev

      - name: Run tests
        run: uv run pytest
        env:
          DATABASE_URL: ""
          ANTHROPIC_API_KEY: "test-key"

  agent-tests:
    name: Agent (pytest)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: agent
    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Cache uv virtualenv
        uses: actions/cache@v4
        with:
          path: agent/.venv
          key: agent-venv-${{ hashFiles('agent/uv.lock') }}
          restore-keys: agent-venv-

      - name: Install dependencies
        run: uv sync --group dev

      - name: Run tests
        run: uv run pytest

  frontend-tests:
    name: Frontend (Jest)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test -- --passWithNoTests --ci
```

**Key CI decisions:**
- `DATABASE_URL: ""` — the backend never queries a DB in mock mode; an empty string prevents Pydantic from trying to parse a default postgres URL.
- `ANTHROPIC_API_KEY: "test-key"` — satisfies the env var; no real calls are made in tests.
- `--passWithNoTests` — lets the workflow go green even before tests are written, and keeps it green as test coverage grows.
- `astral-sh/setup-uv@v4` — official action; installs the correct uv version without downloading the full Python toolchain twice.

---

## Step 6 — Summary report

After writing all files, print:

```
## gen-tests: files written

Backend
  backend/tests/__init__.py
  backend/tests/conftest.py
  backend/tests/test_health.py
  backend/tests/test_api_inventory.py
  backend/tests/test_api_suppliers.py
  ... (one per router)

Agent
  agent/tests/__init__.py
  agent/tests/test_imports.py

Frontend
  frontend/jest.config.ts
  frontend/jest.setup.ts
  frontend/babel.config.js
  frontend/src/__tests__/ActionCard.test.tsx
  frontend/src/__tests__/atoms.test.tsx

CI
  .github/workflows/ci.yml

## Run locally

# Backend
cd backend && uv run pytest -v

# Agent
cd agent && uv run pytest -v

# Frontend
cd frontend && npm test
```

If any file already existed and was skipped, list it under `## Skipped (already present)`.

---

## Constraints

- Read every source file before generating its test. Paths, IDs, and response shapes come from the actual code, not from assumptions.
- Never write a test that requires a running PostgreSQL or Redis instance.
- Don't test SSE streaming (`/api/chat`) or voice upload (`/api/voice`) — flag them as "future work" with a comment.
- If `backend/app/api/<router>.py` is a stub (essentially empty), generate only an import-smoke test.
- Keep tests minimal and focused — one assertion per test function is fine.
- The walking-skeleton constraint from CLAUDE.md: the end-to-end path must stay green. Tests must not break it.
