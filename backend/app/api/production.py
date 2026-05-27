"""Production module: lines, orders, produce action, finished goods.

Exposes manual production management for the Production page.
Inventory updates (ingredient deduction + finished-goods pallet insertion)
are performed inside a single async transaction when an order is marked
as produced.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Facility,
    FinishedGoodsPallet,
    Ingredient,
    IngredientLot,
    InventoryEvent,
    ProductionFormula,
    ProductionLine,
    ProductionOrder,
    Sku,
)
from app.db.session import get_db

router = APIRouter(prefix="/api/production", tags=["production"])

# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class RecipeItem(BaseModel):
    ingredient_id: str
    ingredient_name: str
    kg_per_unit: float
    total_kg: float  # kg_per_unit * quantity (populated for validation responses)


class ProductRow(BaseModel):
    sku_id: str
    name: str
    category: Optional[str] = None
    shelf_life_days: int
    allergen_tags: list[str]
    recipe: list[RecipeItem]


class OrderRow(BaseModel):
    order_id: str
    facility_id: str
    line_id: str
    sku_id: str
    sku_name: str
    quantity_units: int
    status: str
    planned_start_at: Optional[str] = None
    actual_start_at: Optional[str] = None
    completed_at: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    updated_at: str


class LineRow(BaseModel):
    line_id: str
    facility_id: str
    name: str
    capacity_kg_per_hour: float
    supported_allergen_tags: list[str]
    status: str
    current_order: Optional[OrderRow] = None


class ValidationResult(BaseModel):
    feasible: bool
    ingredients: list[dict]  # {ingredient_id, name, needed_kg, available_kg, shortfall_kg}


class ProduceResult(BaseModel):
    order: OrderRow
    line: LineRow
    pallet_id: str
    ingredients_consumed: list[dict]  # {ingredient_id, name, consumed_kg}


class FinishedPalletRow(BaseModel):
    pallet_id: str
    sku_id: str
    sku_name: str
    facility_id: str
    produced_at: str
    shelf_life_days: int
    days_remaining: int
    quantity: int
    status: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "planned":   {"producing", "cancelled"},
    "producing": {"paused", "produced", "cancelled"},
    "paused":    {"producing", "produced", "cancelled"},
    "produced":  set(),
    "cancelled": set(),
}

_LINE_STATUS_FOR_ORDER: dict[str, str] = {
    "planned":   "setup",
    "producing": "producing",
    "paused":    "paused",
    "produced":  "idle",
    "cancelled": "idle",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fmt(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


async def _load_sku_names(db: AsyncSession, sku_ids: set[str]) -> dict[str, str]:
    if not sku_ids:
        return {}
    rows = (await db.execute(select(Sku).where(Sku.sku_id.in_(sku_ids)))).scalars().all()
    return {s.sku_id: s.name for s in rows}


async def _order_to_row(order: ProductionOrder, sku_name: str) -> OrderRow:
    return OrderRow(
        order_id=str(order.order_id),
        facility_id=order.facility_id,
        line_id=order.line_id,
        sku_id=order.sku_id,
        sku_name=sku_name,
        quantity_units=order.quantity_units,
        status=order.status,
        planned_start_at=_fmt(order.planned_start_at),
        actual_start_at=_fmt(order.actual_start_at),
        completed_at=_fmt(order.completed_at),
        notes=order.notes,
        created_at=order.created_at.isoformat(),
        updated_at=order.updated_at.isoformat(),
    )


async def _line_to_row(line: ProductionLine, current_order: Optional[OrderRow]) -> LineRow:
    return LineRow(
        line_id=line.line_id,
        facility_id=line.facility_id,
        name=line.name,
        capacity_kg_per_hour=float(line.capacity_kg_per_hour),
        supported_allergen_tags=line.supported_allergen_tags or [],
        status=line.status,
        current_order=current_order,
    )


async def _get_recipe(db: AsyncSession, sku_id: str) -> list[ProductionFormula]:
    return (
        await db.execute(
            select(ProductionFormula).where(ProductionFormula.sku_id == sku_id)
        )
    ).scalars().all()


async def _ingredient_names(db: AsyncSession, ingredient_ids: set[str]) -> dict[str, str]:
    if not ingredient_ids:
        return {}
    rows = (
        await db.execute(
            select(Ingredient).where(Ingredient.ingredient_id.in_(ingredient_ids))
        )
    ).scalars().all()
    return {i.ingredient_id: i.name for i in rows}


async def _available_kg(db: AsyncSession, facility_id: str, ingredient_id: str) -> float:
    result = (
        await db.execute(
            select(func.sum(IngredientLot.quantity_kg)).where(
                IngredientLot.facility_id == facility_id,
                IngredientLot.ingredient_id == ingredient_id,
                IngredientLot.quantity_kg > 0,
            )
        )
    ).scalar_one()
    return float(result or 0)


# ---------------------------------------------------------------------------
# Endpoints: production lines
# ---------------------------------------------------------------------------

@router.get("/lines", response_model=list[LineRow])
async def list_production_lines(
    facility_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[LineRow]:
    q = select(ProductionLine).order_by(ProductionLine.facility_id, ProductionLine.line_id)
    if facility_id:
        q = q.where(ProductionLine.facility_id == facility_id)
    lines = (await db.execute(q)).scalars().all()

    # Collect active order IDs
    active_order_ids = [ln.current_order_id for ln in lines if ln.current_order_id]
    orders_by_id: dict[str, ProductionOrder] = {}
    if active_order_ids:
        order_rows = (
            await db.execute(
                select(ProductionOrder).where(
                    ProductionOrder.order_id.in_(active_order_ids)
                )
            )
        ).scalars().all()
        orders_by_id = {o.order_id: o for o in order_rows}

    # SKU names
    sku_ids = {o.sku_id for o in orders_by_id.values()}
    sku_names = await _load_sku_names(db, sku_ids)

    result: list[LineRow] = []
    for ln in lines:
        current_order_row = None
        if ln.current_order_id and ln.current_order_id in orders_by_id:
            order = orders_by_id[ln.current_order_id]
            current_order_row = await _order_to_row(order, sku_names.get(order.sku_id, order.sku_id))
        result.append(await _line_to_row(ln, current_order_row))
    return result


@router.get("/lines/{line_id}", response_model=LineRow)
async def get_production_line(line_id: str, db: AsyncSession = Depends(get_db)) -> LineRow:
    ln = await db.get(ProductionLine, line_id)
    if not ln:
        raise HTTPException(404, f"production line {line_id} not found")
    current_order_row = None
    if ln.current_order_id:
        order = await db.get(ProductionOrder, ln.current_order_id)
        if order:
            sku = await db.get(Sku, order.sku_id)
            current_order_row = await _order_to_row(order, sku.name if sku else order.sku_id)
    return await _line_to_row(ln, current_order_row)


# ---------------------------------------------------------------------------
# Endpoints: product catalog
# ---------------------------------------------------------------------------

@router.get("/products", response_model=list[ProductRow])
async def list_products(db: AsyncSession = Depends(get_db)) -> list[ProductRow]:
    skus = (await db.execute(select(Sku).order_by(Sku.category, Sku.name))).scalars().all()
    result: list[ProductRow] = []
    for sku in skus:
        formulas = await _get_recipe(db, sku.sku_id)
        ing_ids = {f.ingredient_id for f in formulas}
        ing_names = await _ingredient_names(db, ing_ids)
        recipe = [
            RecipeItem(
                ingredient_id=f.ingredient_id,
                ingredient_name=ing_names.get(f.ingredient_id, f.ingredient_id),
                kg_per_unit=float(f.kg_per_unit),
                total_kg=0.0,  # no quantity context at list level
            )
            for f in formulas
        ]
        result.append(
            ProductRow(
                sku_id=sku.sku_id,
                name=sku.name,
                category=sku.category,
                shelf_life_days=sku.shelf_life_days,
                allergen_tags=sku.allergen_tags or [],
                recipe=recipe,
            )
        )
    return result


@router.get("/products/{sku_id}", response_model=ProductRow)
async def get_product(sku_id: str, db: AsyncSession = Depends(get_db)) -> ProductRow:
    sku = await db.get(Sku, sku_id)
    if not sku:
        raise HTTPException(404, f"product {sku_id} not found")
    formulas = await _get_recipe(db, sku_id)
    ing_ids = {f.ingredient_id for f in formulas}
    ing_names = await _ingredient_names(db, ing_ids)
    recipe = [
        RecipeItem(
            ingredient_id=f.ingredient_id,
            ingredient_name=ing_names.get(f.ingredient_id, f.ingredient_id),
            kg_per_unit=float(f.kg_per_unit),
            total_kg=0.0,
        )
        for f in formulas
    ]
    return ProductRow(
        sku_id=sku.sku_id,
        name=sku.name,
        category=sku.category,
        shelf_life_days=sku.shelf_life_days,
        allergen_tags=sku.allergen_tags or [],
        recipe=recipe,
    )


# ---------------------------------------------------------------------------
# Endpoints: production orders
# ---------------------------------------------------------------------------

@router.get("/orders", response_model=list[OrderRow])
async def list_orders(
    facility_id: Optional[str] = Query(None),
    line_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[OrderRow]:
    q = select(ProductionOrder).order_by(ProductionOrder.created_at.desc())
    if facility_id:
        q = q.where(ProductionOrder.facility_id == facility_id)
    if line_id:
        q = q.where(ProductionOrder.line_id == line_id)
    if status:
        q = q.where(ProductionOrder.status == status)
    orders = (await db.execute(q)).scalars().all()
    sku_ids = {o.sku_id for o in orders}
    sku_names = await _load_sku_names(db, sku_ids)
    return [await _order_to_row(o, sku_names.get(o.sku_id, o.sku_id)) for o in orders]


@router.get("/orders/{order_id}", response_model=OrderRow)
async def get_order(order_id: str, db: AsyncSession = Depends(get_db)) -> OrderRow:
    order = await db.get(ProductionOrder, order_id)
    if not order:
        raise HTTPException(404, f"order {order_id} not found")
    sku = await db.get(Sku, order.sku_id)
    return await _order_to_row(order, sku.name if sku else order.sku_id)


class CreateOrderRequest(BaseModel):
    facility_id: str
    line_id: str
    sku_id: str
    quantity_units: int = Field(..., gt=0)
    planned_start_at: Optional[str] = None
    notes: Optional[str] = None


@router.post("/orders", response_model=OrderRow, status_code=201)
async def create_order(
    req: CreateOrderRequest, db: AsyncSession = Depends(get_db)
) -> OrderRow:
    # Validate foreign keys
    facility = await db.get(Facility, req.facility_id)
    if not facility:
        raise HTTPException(404, f"facility {req.facility_id} not found")
    line = await db.get(ProductionLine, req.line_id)
    if not line:
        raise HTTPException(404, f"production line {req.line_id} not found")
    if line.facility_id != req.facility_id:
        raise HTTPException(400, "line does not belong to the specified facility")
    sku = await db.get(Sku, req.sku_id)
    if not sku:
        raise HTTPException(404, f"product {req.sku_id} not found")
    if line.status not in ("idle", "maintenance"):
        raise HTTPException(
            409,
            f"line {req.line_id} is currently {line.status}; clear it before assigning a new order",
        )

    planned_dt: Optional[datetime] = None
    if req.planned_start_at:
        try:
            planned_dt = datetime.fromisoformat(req.planned_start_at.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(400, "invalid planned_start_at format; use ISO 8601")

    order = ProductionOrder(
        facility_id=req.facility_id,
        line_id=req.line_id,
        sku_id=req.sku_id,
        quantity_units=req.quantity_units,
        status="planned",
        planned_start_at=planned_dt,
        notes=req.notes,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(order)
    await db.flush()

    line.status = "setup"
    line.current_order_id = order.order_id

    await db.commit()
    await db.refresh(order)
    return await _order_to_row(order, sku.name)


class UpdateStatusRequest(BaseModel):
    status: str


@router.patch("/orders/{order_id}/status", response_model=OrderRow)
async def update_order_status(
    order_id: str, req: UpdateStatusRequest, db: AsyncSession = Depends(get_db)
) -> OrderRow:
    order = await db.get(ProductionOrder, order_id)
    if not order:
        raise HTTPException(404, f"order {order_id} not found")

    allowed = _STATUS_TRANSITIONS.get(order.status, set())
    if req.status not in allowed:
        raise HTTPException(
            422,
            f"cannot transition order from {order.status!r} to {req.status!r}; "
            f"allowed: {sorted(allowed) or 'none (terminal)'}",
        )

    if req.status in ("produced", "cancelled"):
        raise HTTPException(
            422,
            f"use the /produce or /cancel endpoints for {req.status!r} transitions",
        )

    now = _now()
    order.status = req.status
    order.updated_at = now
    if req.status == "producing" and order.actual_start_at is None:
        order.actual_start_at = now

    line = await db.get(ProductionLine, order.line_id)
    if line:
        line.status = _LINE_STATUS_FOR_ORDER[req.status]

    await db.commit()
    await db.refresh(order)
    sku = await db.get(Sku, order.sku_id)
    return await _order_to_row(order, sku.name if sku else order.sku_id)


@router.post("/orders/{order_id}/cancel", response_model=OrderRow)
async def cancel_order(order_id: str, db: AsyncSession = Depends(get_db)) -> OrderRow:
    order = await db.get(ProductionOrder, order_id)
    if not order:
        raise HTTPException(404, f"order {order_id} not found")

    if order.status in ("produced", "cancelled"):
        raise HTTPException(422, f"order is already {order.status}; cannot cancel")

    order.status = "cancelled"
    order.updated_at = _now()

    line = await db.get(ProductionLine, order.line_id)
    if line and line.current_order_id == order.order_id:
        line.status = "idle"
        line.current_order_id = None

    await db.commit()
    await db.refresh(order)
    sku = await db.get(Sku, order.sku_id)
    return await _order_to_row(order, sku.name if sku else order.sku_id)


# ---------------------------------------------------------------------------
# Ingredient availability validation
# ---------------------------------------------------------------------------

@router.get("/validate", response_model=ValidationResult)
async def validate_production(
    sku_id: str = Query(...),
    quantity_units: int = Query(..., gt=0),
    facility_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
) -> ValidationResult:
    sku = await db.get(Sku, sku_id)
    if not sku:
        raise HTTPException(404, f"product {sku_id} not found")

    formulas = await _get_recipe(db, sku_id)
    if not formulas:
        return ValidationResult(feasible=True, ingredients=[])

    ing_ids = {f.ingredient_id for f in formulas}
    ing_names = await _ingredient_names(db, ing_ids)

    feasible = True
    details: list[dict] = []
    for f in formulas:
        needed = float(f.kg_per_unit) * quantity_units
        available = await _available_kg(db, facility_id, f.ingredient_id)
        shortfall = max(0.0, needed - available)
        if shortfall > 0:
            feasible = False
        details.append(
            {
                "ingredient_id": f.ingredient_id,
                "name": ing_names.get(f.ingredient_id, f.ingredient_id),
                "needed_kg": round(needed, 3),
                "available_kg": round(available, 3),
                "shortfall_kg": round(shortfall, 3),
            }
        )
    return ValidationResult(feasible=feasible, ingredients=details)


# ---------------------------------------------------------------------------
# Mark as produced — the core inventory-update transaction
# ---------------------------------------------------------------------------

@router.post("/orders/{order_id}/produce", response_model=ProduceResult)
async def produce_order(order_id: str, db: AsyncSession = Depends(get_db)) -> ProduceResult:
    order = await db.get(ProductionOrder, order_id)
    if not order:
        raise HTTPException(404, f"order {order_id} not found")

    if order.status not in ("planned", "producing", "paused"):
        raise HTTPException(
            422,
            f"order is {order.status}; only planned/producing/paused orders can be produced",
        )

    sku = await db.get(Sku, order.sku_id)
    if not sku:
        raise HTTPException(500, "SKU not found — data integrity issue")

    formulas = await _get_recipe(db, order.sku_id)
    ing_ids = {f.ingredient_id for f in formulas}
    ing_names = await _ingredient_names(db, ing_ids)

    # ---------- 1. Check ingredient availability ----------
    shortfalls: list[str] = []
    for f in formulas:
        needed = float(f.kg_per_unit) * order.quantity_units
        available = await _available_kg(db, order.facility_id, f.ingredient_id)
        if available < needed:
            shortfalls.append(
                f"{ing_names.get(f.ingredient_id, f.ingredient_id)}: "
                f"need {needed:.1f} kg, have {available:.1f} kg"
            )
    if shortfalls:
        raise HTTPException(
            422,
            "insufficient ingredient inventory:\n" + "\n".join(shortfalls),
        )

    # ---------- 2. Deduct ingredients (FIFO by expiry_date) ----------
    now = _now()
    consumed: list[dict] = []

    for f in formulas:
        needed = float(f.kg_per_unit) * order.quantity_units
        remaining = needed

        lots = (
            await db.execute(
                select(IngredientLot)
                .where(
                    IngredientLot.facility_id == order.facility_id,
                    IngredientLot.ingredient_id == f.ingredient_id,
                    IngredientLot.quantity_kg > 0,
                )
                .order_by(IngredientLot.expiry_date.asc())
            )
        ).scalars().all()

        total_consumed = 0.0
        for lot in lots:
            if remaining <= 0:
                break
            deduct = min(float(lot.quantity_kg), remaining)
            lot.quantity_kg = float(lot.quantity_kg) - deduct
            remaining -= deduct
            total_consumed += deduct

            event = InventoryEvent(
                kind="consumption",
                lot_id=lot.lot_id,
                delta_kg=-deduct,
                source="production_order",
                source_ref=str(order.order_id),
                note=f"Produced {order.quantity_units} units of {sku.name}",
                event_at=now,
            )
            db.add(event)

        consumed.append(
            {
                "ingredient_id": f.ingredient_id,
                "name": ing_names.get(f.ingredient_id, f.ingredient_id),
                "consumed_kg": round(total_consumed, 3),
            }
        )

    # ---------- 3. Add finished goods pallet ----------
    pallet = FinishedGoodsPallet(
        sku_id=order.sku_id,
        facility_id=order.facility_id,
        produced_at=now,
        shelf_life_days=sku.shelf_life_days,
        quantity=order.quantity_units,
        status="in_warehouse",
    )
    db.add(pallet)
    await db.flush()

    # ---------- 4. Update order + line ----------
    order.status = "produced"
    order.completed_at = now
    order.updated_at = now
    if order.actual_start_at is None:
        order.actual_start_at = now

    line = await db.get(ProductionLine, order.line_id)
    if line:
        line.status = "idle"
        line.current_order_id = None

    await db.commit()
    await db.refresh(order)
    await db.refresh(pallet)

    order_row = await _order_to_row(order, sku.name)
    line_row = await _line_to_row(line, None) if line else LineRow(
        line_id=order.line_id, facility_id=order.facility_id,
        name=order.line_id, capacity_kg_per_hour=0, supported_allergen_tags=[],
        status="idle",
    )

    return ProduceResult(
        order=order_row,
        line=line_row,
        pallet_id=str(pallet.pallet_id),
        ingredients_consumed=consumed,
    )


# ---------------------------------------------------------------------------
# Finished goods inventory (alias for /api/pallets filtered by facility)
# ---------------------------------------------------------------------------

@router.get("/finished", response_model=list[FinishedPalletRow])
async def list_finished_goods(
    facility_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[FinishedPalletRow]:
    from datetime import date as date_type

    q = select(FinishedGoodsPallet).order_by(FinishedGoodsPallet.produced_at.desc())
    if facility_id:
        q = q.where(FinishedGoodsPallet.facility_id == facility_id)
    pallets = (await db.execute(q)).scalars().all()

    sku_ids = {p.sku_id for p in pallets}
    sku_names = await _load_sku_names(db, sku_ids)

    result: list[FinishedPalletRow] = []
    today = date_type.today()
    for p in pallets:
        produced_date = p.produced_at.date() if hasattr(p.produced_at, "date") else p.produced_at
        expiry = date_type.fromordinal(produced_date.toordinal() + p.shelf_life_days)
        days_remaining = max(0, (expiry - today).days)
        result.append(
            FinishedPalletRow(
                pallet_id=str(p.pallet_id),
                sku_id=p.sku_id,
                sku_name=sku_names.get(p.sku_id, p.sku_id),
                facility_id=p.facility_id,
                produced_at=p.produced_at.isoformat(),
                shelf_life_days=p.shelf_life_days,
                days_remaining=days_remaining,
                quantity=p.quantity,
                status=p.status,
            )
        )
    return result
