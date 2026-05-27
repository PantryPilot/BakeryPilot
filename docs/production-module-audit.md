# Production Module Audit

**Date:** 2026-05-27  
**Status:** Pre-implementation audit

---

## 1. Current Frontend Files Inspected

| File | Relevance |
|------|-----------|
| `frontend/src/components/Shell.tsx` | NAV array — must add Production item |
| `frontend/src/components/Icon.tsx` | Available icons — will add "factory" icon |
| `frontend/src/lib/api.ts` | HTTP client — will add production fetch functions |
| `frontend/src/lib/context.tsx` | AppContext — facility state, theme, user |
| `frontend/src/lib/data.ts` | Static types — may add ProductionLine, Order types |
| `frontend/src/lib/hooks.ts` | SWR-style hooks — may add useProductionLines etc. |
| `frontend/src/app/materials/page.tsx` | Inventory page — will add Finished Products tab |
| `frontend/src/app/schedule/page.tsx` | Schedule page — reference for production UX patterns |

---

## 2. Current Backend Files Inspected

| File | Relevance |
|------|-----------|
| `backend/app/main.py` | Router registration — must add production router |
| `backend/app/db/models.py` | SQLAlchemy ORM — must add ProductionOrder, update ProductionLine |
| `backend/app/db/session.py` | Async session factory |
| `backend/app/api/facilities.py` | Pattern reference for async router |
| `backend/app/api/inventory.py` | Pattern reference for lot deduction |
| `backend/app/api/pallets.py` | Already handles finished_goods_pallets reads |
| `backend/app/config.py` | Settings / feature flags |

---

## 3. Current Database / Schema State

### Existing tables useful for Production module

| Table | Status | Notes |
|-------|--------|-------|
| `facilities` | Exists | 4 FGF plants seeded |
| `production_lines` | Exists | 9 lines across 4 plants, **no status column** |
| `skus` | Exists | 12 real FGF SKUs seeded |
| `production_formulas` | Exists | Full BOM for all 12 SKUs |
| `ingredient_lots` | Exists | 150+ lots, source-of-truth for ingredient inventory |
| `inventory_events` | Exists | Append-only audit log for lot deltas |
| `finished_goods_pallets` | Exists | Finished product inventory (pallet-level) |
| `production_runs` | Exists | MES telemetry runs, not ideal for manual orders |
| `ingredients` | Exists | 90+ bakery ingredients seeded |

### Missing for Production module

| Gap | Solution |
|-----|---------|
| `production_lines.status` | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (idle/setup/producing/paused/maintenance) |
| `production_lines.current_order_id` | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |
| `production_orders` table | New table (planned/producing/paused/produced/cancelled) |
| `finished_goods_pallets` seed data | Add seed inserts |
| Production order seed data | Add sample orders in multiple statuses |

---

## 4. Production Module Requirements

### Production Lines per Facility
- 9 lines already seeded across 4 plants
- Need `status` (idle/setup/producing/paused/maintenance) and `current_order_id` columns added

### Product Catalog
- 12 FGF SKUs already exist in `skus` table
- Full BOM in `production_formulas` (kg_per_unit per ingredient)
- No additional SKU seed needed for demo

### Production Orders (new table)
- Fields: order_id, facility_id, line_id, sku_id, quantity_units, status, planned_start_at, actual_start_at, completed_at, notes, created_at, updated_at

### Mark as Produced (atomic operation)
1. Load order → validate status (must be producing or planned)
2. Load recipe from `production_formulas`
3. Calculate total kg needed per ingredient = `kg_per_unit * quantity_units`
4. Check ingredient lots at facility have enough total quantity
5. Deduct from lots FIFO by expiry_date (nearest-expiry first)
6. Insert `inventory_events` for each deduction (kind=consumption)
7. Insert `finished_goods_pallets` row
8. Update order status to `produced`, set `completed_at`
9. Update production line status to `idle`, clear `current_order_id`
10. All steps within a single async database transaction

---

## 5. Missing APIs

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/production/lines` | GET | List lines, filter by facility_id |
| `/api/production/lines/{line_id}` | GET | Line detail with current order |
| `/api/production/products` | GET | List SKUs with recipe |
| `/api/production/products/{sku_id}` | GET | SKU detail + full recipe |
| `/api/production/orders` | GET | List orders, filter by facility/line/status |
| `/api/production/orders` | POST | Create order and assign to line |
| `/api/production/orders/{order_id}/status` | PATCH | Update status (start/pause/resume) |
| `/api/production/orders/{order_id}/produce` | POST | Mark as produced (inventory update) |
| `/api/production/orders/{order_id}/cancel` | POST | Cancel order |
| `/api/production/validate` | GET | Check ingredient availability for a batch |
| `/api/production/finished` | GET | Alias for pallets filtered by facility |

---

## 6. Missing Database Models / Tables

| Item | Action |
|------|--------|
| `production_orders` table | CREATE TABLE with FK to production_lines, skus, facilities |
| `ProductionOrder` SQLAlchemy model | Add to `backend/app/db/models.py` |
| `ProductionLine.status` column | ALTER TABLE (additive) |
| `ProductionLine.current_order_id` column | ALTER TABLE (additive) |
| Update `ProductionLine` SQLAlchemy model | Add status and current_order_id fields |

---

## 7. Required Seed Data

### production_orders (sample demo data)
- 1–2 orders in `produced` status (historical)
- 1 order in `producing` status (in-flight)
- 1 order in `planned` status (queued)
- Spread across Toronto and Mississauga facilities

### finished_goods_pallets
- Several pallets for common SKUs (ACE Baguette, Wonder White, Country Harvest)
- Various quantities, shelf lives, facilities

---

## 8. Inventory Integration Plan

### Ingredient Deduction (on produce)
- Query `ingredient_lots` at the facility ordered by `expiry_date ASC` (FIFO)
- Deduct quantity from each lot, stop when needed quantity satisfied
- Insert `inventory_events` rows with `kind=consumption`, `source=production_order`, `source_ref=order_id`
- Insufficient inventory → HTTP 422 with clear error

### Finished Product Addition (on produce)
- Insert one `finished_goods_pallets` row per produce action
- `produced_at=now()`, `quantity=quantity_units`, `shelf_life_days` from `skus.shelf_life_days`
- `status=in_warehouse`

### Frontend Inventory Tab
- Existing `materials/page.tsx` gains two tabs: **Ingredients** (existing UI) and **Finished Products**
- Finished Products tab calls `GET /api/pallets?facility_id=xxx`
- Refreshes after successful produce action

---

## 9. Status Transition Plan

### Production Order Statuses
```
planned → producing → paused → producing (resume)
planned → cancelled
producing → produced   (triggers inventory update)
producing → paused
producing → cancelled
paused → produced
paused → cancelled
produced = TERMINAL
cancelled = TERMINAL
```

### Production Line Statuses
```
idle → setup (when order assigned)
setup → producing (when order starts)
producing → paused
paused → producing
producing/paused → idle (when produced or cancelled)
idle → maintenance (manual)
maintenance → idle (manual)
```

---

## 10. Frontend Page / Component Plan

### New: `/production` page
- **FacilitySelector context** — uses `facility` from AppContext
- **ProductionLinesGrid** — card per line showing status + current order
- **AssignProductModal** — select SKU, enter quantity, see recipe, validate inventory, submit
- **StatusActionsBar** — buttons per line (Start, Pause, Resume, Mark Produced, Cancel)
- **ProduceConfirmModal** — shows ingredient deductions + pallet addition, confirm before calling backend
- **Toasts** — success/error feedback

### Updated: `/materials` page
- Add tab strip: **Ingredients** | **Finished Products**
- **Ingredients tab** = existing inventory UI (no regression)
- **Finished Products tab** = new pallet table with SKU, facility, quantity, produced_at, shelf_life, status

---

## 11. Risks and Assumptions

| Risk | Mitigation |
|------|-----------|
| Production line already occupied when assigning | Backend validates line status = idle before creating order |
| Insufficient ingredient inventory | Backend returns HTTP 422 with per-ingredient shortfall detail |
| Concurrent produce calls on same order | PostgreSQL row-level locking within transaction |
| `production_lines.status` column constraint on existing rows | DEFAULT 'idle' applies to all existing rows cleanly |
| SKUs have no batch_size concept | Using `quantity_units` as the count of product units; recipe scales linearly |
| Frontend facility context uses short codes (p1–p4) but backend uses full IDs | Mapping handled in api.ts (existing FACILITY_MAP) |
| `finished_goods_pallets.quantity` is INT, not NUMERIC | Acceptable for unit counts; already in schema |
| No Alembic migration system | Schema changes go in schema.sql as additive ALTER/CREATE; requires `make schema.migrate` re-run |

---

## 12. CI/CD Impact

- `infra/supabase/schema.sql` changes → CD pipeline warns "manual migration required" on push to main
- `make schema.migrate` must be run on staging/production databases after deploy
- No new environment variables required
- No new Docker images required; only backend and frontend code changes

---

## 13. Team Notification Checklist (post-implementation)

| Role | Reason |
|------|--------|
| Database owner / CI-CD owner | New `production_orders` table + 2 ALTER columns require `make schema.migrate` on staging/prod |
| Backend team | New `/api/production` router added to `main.py` |
| Frontend team | New `/production` page, `Shell.tsx` NAV change, `materials/page.tsx` tab change |
| No-one else | Agent and ESG layers are unchanged; no new env vars; no new external dependencies |
