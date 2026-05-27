# BakeryPilot — Remaining Functional Work Audit

**Date:** 2026-05-26  
**Scope:** All frontend UI interactions that were demo-only (no backend state change) before this pass, and their current status after completion.

---

## Summary

| Area | Before | After |
|---|---|---|
| Materials / Inventory | Buttons opened UI only | Write-off, Transfer, Substitute all hit backend |
| Scorecard / Suppliers | Buttons were inert | Place PO, negotiation Send/Discard wired to backend |
| Scorecard / Performance | Export CSV did nothing | Client-side CSV download wired |
| FlowSight FactoryView | Hardcoded line data | Uses `useActiveRuns` + `useYieldTelemetry` live data |
| Schedule | Gantt live, diff/what-if demo | Deferred (intentional, see below) |
| Settings | Already fully wired | No changes |
| Chat / Agent | Already fully wired | No changes |

---

## Phase 1: Backend APIs added

### `POST /api/lots/{lot_id}/write_off`
- **File:** `backend/app/api/inventory.py`
- Validates lot exists and quantity > 0
- Inserts `spoilage` row into append-only `inventory_events` via raw SQL
- Creates `WasteEvent` ORM record for ESG counter
- Reduces `lot.quantity_kg` in place

### `POST /api/lots/{lot_id}/transfer`
- **File:** `backend/app/api/inventory.py`
- Validates lot + destination facility exist, destination ≠ current
- Inserts `transfer` row into `inventory_events`
- Updates `lot.facility_id` to destination

### `POST /api/lots/{lot_id}/substitute`
- **File:** `backend/app/api/inventory.py`
- Creates an `ActionCard` of `kind="transfer"` with substitution payload
- Returns `{ action_card_id }` for human-in-the-loop approval

### `GET /api/ingredients`
- **File:** `backend/app/api/inventory.py` (via `ingredients_router`)
- Returns all ingredients ordered by name (used by PO form dropdown)

### `POST /api/negotiations/{draft_id}/discard`
- **File:** `backend/app/api/negotiations.py`
- Sets `draft.status = "discarded"`, raises 409 if already sent

> `POST /api/orders/draft` and `POST /api/negotiations/{id}/mark_sent` were already implemented.

---

## Phase 2: Frontend API client additions (`frontend/src/lib/api.ts`)

- `fetchIngredients()` → `GET /api/ingredients`
- `writeOffLot(lotId, req)` → `POST /api/lots/{id}/write_off` → returns adapted `Lot`
- `transferLot(lotId, req)` → `POST /api/lots/{id}/transfer` → returns adapted `Lot`
- `applySubstitution(lotId, req)` → `POST /api/lots/{id}/substitute` → returns `{ action_card_id }`
- `createOrderDraft(req)` → `POST /api/orders/draft` → returns `OrderDraftResponse` with landed cost
- `fetchNegotiations(supplierId?, status?)` → `GET /api/negotiations` with optional filters
- `markNegotiationSent(draftId)` → `POST /api/negotiations/{id}/mark_sent`
- `discardNegotiationDraft(draftId)` → `POST /api/negotiations/{id}/discard`

---

## Phase 3: Frontend hook additions (`frontend/src/lib/hooks.ts`)

- `useIngredients()` — fetches ingredient list for PO form
- `useNegotiationsBySupplier(supplierId)` — fetches pending drafts per supplier, includes `refetch()`

---

## Phase 4: Materials page (`frontend/src/app/materials/page.tsx`)

**Write-off modal** (`WriteOffModal`):
- Opens via "Write off" button on lot rows and mobile cards
- Requires a reason field; calls `writeOffLot()`
- On success: updates `lotOverrides` Map for optimistic UI, shows green toast

**Transfer modal** (`TransferModal`):
- Opens via "Transfer" button on lot rows and mobile cards
- Facility dropdown excludes current facility
- Calls `transferLot()`, updates `lotOverrides`, shows green toast

**Substitute "Use" button** (in `LotSlideIn`):
- Per-row loading spinner while `applySubstitution()` is in flight
- On success: shows toast with action card ID prefix
- On failure: shows error toast

---

## Phase 5: Scorecard page (`frontend/src/app/scorecard/page.tsx`)

**Place PO modal** (`PlacePOModal`):
- Opens via "Place PO" button in supplier table rows
- Ingredient dropdown uses `useIngredients()` (live from backend)
- Fields: ingredient, quantity_kg, unit_price, delivery_date
- On success: shows landed cost breakdown (unit price, base cost, holding cost, MOQ penalty, total)
- Creates an `ActionCard` of `kind="supplier_order"` via `POST /api/orders/draft`

**View draft button**:
- "View draft" in table row now opens `SupplierSlideIn` for that supplier
- The slide-in shows the live pending negotiation drafts

**SupplierSlideIn negotiation section**:
- Replaced hardcoded draft body with `useNegotiationsBySupplier(supplier.id)` live data
- **Send** button: calls `markNegotiationSent(draft_id)`, refetches, shows parent toast
- **Discard** button: calls `discardNegotiationDraft(draft_id)`, refetches, shows parent toast
- **Edit** button: kept inert (requires `PATCH /api/negotiations/{id}` endpoint not yet built)
- Per-button loading spinners; both buttons disabled while either is in flight

**Export CSV** (Performance tab):
- Triggers client-side CSV download of all `wasteEvents` currently in state
- Columns: event_id, ts, lot_id, ingredient_name, quantity_kg, value_usd, reason, avoided, facility_id
- Button disabled when there are no waste events

---

## Phase 6: FlowSight FactoryView (`frontend/src/components/FlowSightCanvas.tsx`)

**Active production lines**:
- `useActiveRuns(facilityId)` fetched; runs mapped by `line_number`
- When backend returns data: shows live `sku_name` + `planned_kg` with "live" label
- Falls back to hardcoded demo snapshot when no active runs in backend

**Yield per line**:
- `useYieldTelemetry()` fetched; latest point per line derived (filtered by `facility_id`)
- When backend returns data: uses live `actual_pct` / `target_pct`
- `lostDollars` estimated as `(target - actual) * 100` when live data present
- Falls back to hardcoded values when no telemetry for that line

---

## Intentionally deferred items

| Item | Reason |
|---|---|
| Schedule diff / WhatIf panels | UI-only planning tools; OR-Tools integration is out of scope for hackathon |
| Negotiation draft "Edit" button | Requires `PATCH /api/negotiations/{id}` endpoint not built; marked inert |
| Pallet/genealogy tracing in LotSlideIn | Requires `production_runs + finished_goods_pallets` join; left as placeholder |
| FlowSight map plant positions | Hardcoded geometry; dynamic layout is a separate canvas infrastructure task |
| Dashboard "Loop" cards | Backend endpoint exists; UI rendering already wired |

---

## Test / lint status (post-changes)

- **Backend:** `uv run pytest` — 57 passed, 0 failures
- **Frontend TypeScript:** `npx tsc --noEmit` — 0 errors in app code (pre-existing test-type-config issues in `__tests__/` unchanged)
- **Frontend ESLint:** `npm run lint` — 0 warnings, 0 errors
