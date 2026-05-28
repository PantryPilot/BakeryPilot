"""Random demo data generation grounded in seeded reference data."""

from __future__ import annotations

import random
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Facility,
    Ingredient,
    IngredientLot,
    ProductionLine,
    ProductionSchedule,
    Retailer,
    RetailerOrder,
    Sku,
    Supplier,
    SupplierOrder,
    SupplierOrderItem,
)
from app.services.schedule_fulfillment import mark_po_scheduled, resolve_default_line


@dataclass
class DemoGenerateResult:
    retailer_orders: list[dict] = field(default_factory=list)
    supplier_orders: list[dict] = field(default_factory=list)
    schedules: list[dict] = field(default_factory=list)

    @property
    def totals(self) -> dict[str, int]:
        return {
            "retailer_orders": len(self.retailer_orders),
            "supplier_orders": len(self.supplier_orders),
            "schedules": len(self.schedules),
        }


async def _load_facilities(db: AsyncSession, facility_id: str | None) -> list[str]:
    q = select(Facility.facility_id)
    if facility_id:
        q = q.where(Facility.facility_id == facility_id)
    rows = (await db.execute(q)).scalars().all()
    if facility_id and not rows:
        raise HTTPException(404, f"facility {facility_id!r} not found")
    return list(rows)


async def _load_retailers(db: AsyncSession) -> list[str]:
    return list((await db.execute(select(Retailer.retailer_id))).scalars().all())


async def _load_skus(db: AsyncSession) -> list[str]:
    return list((await db.execute(select(Sku.sku_id))).scalars().all())


async def _load_suppliers(db: AsyncSession) -> list[str]:
    return list((await db.execute(select(Supplier.supplier_id))).scalars().all())


async def _load_ingredients(db: AsyncSession) -> list[str]:
    return list((await db.execute(select(Ingredient.ingredient_id))).scalars().all())


async def _load_lines_by_facility(db: AsyncSession, facility_ids: list[str]) -> dict[str, list[str]]:
    if not facility_ids:
        return {}
    lines = (
        await db.execute(
            select(ProductionLine.facility_id, ProductionLine.line_id).where(
                ProductionLine.facility_id.in_(facility_ids)
            )
        )
    ).all()
    by_facility: dict[str, list[str]] = {fid: [] for fid in facility_ids}
    for fac, line_id in lines:
        by_facility.setdefault(fac, []).append(line_id)
    return by_facility


async def _load_lot_totals(
    db: AsyncSession, facility_ids: list[str]
) -> dict[tuple[str, str], float]:
    q = (
        select(
            IngredientLot.facility_id,
            IngredientLot.ingredient_id,
            func.sum(IngredientLot.quantity_kg),
        )
        .where(IngredientLot.quantity_kg > 0)
        .group_by(IngredientLot.facility_id, IngredientLot.ingredient_id)
    )
    if facility_ids:
        q = q.where(IngredientLot.facility_id.in_(facility_ids))
    rows = (await db.execute(q)).all()
    return {(fac, ing): float(qty or 0) for fac, ing, qty in rows}


def _weighted_ingredients(
    rng: random.Random,
    ingredients: list[str],
    lot_totals: dict[tuple[str, str], float],
    facility_id: str,
    count: int,
) -> list[tuple[str, float, float]]:
    """Pick ingredients biased toward low on-hand qty; return (id, qty_kg, unit_price)."""
    if not ingredients:
        return []

    weights: list[float] = []
    for ing in ingredients:
        on_hand = lot_totals.get((facility_id, ing), 0.0)
        weights.append(1.0 / (on_hand + 50.0))

    picked: list[tuple[str, float, float]] = []
    pool = ingredients.copy()
    pool_weights = weights.copy()
    for _ in range(min(count, len(pool))):
        if not pool:
            break
        choice = rng.choices(pool, weights=pool_weights, k=1)[0]
        idx = pool.index(choice)
        pool.pop(idx)
        pool_weights.pop(idx)
        qty = round(rng.uniform(300, 1200), 1)
        price = round(rng.uniform(0.65, 8.5), 2)
        picked.append((choice, qty, price))
    return picked


async def _open_pos_without_schedule(
    db: AsyncSession, po_ids: list[uuid.UUID]
) -> list[RetailerOrder]:
    if not po_ids:
        return []
    scheduled_po_ids = set(
        (
            await db.execute(
                select(ProductionSchedule.retailer_order_id).where(
                    ProductionSchedule.retailer_order_id.in_(po_ids),
                    ProductionSchedule.status.in_(("suggested", "approved")),
                )
            )
        ).scalars().all()
    )
    open_pos: list[RetailerOrder] = []
    for po_id in po_ids:
        if po_id in scheduled_po_ids:
            continue
        po = await db.get(RetailerOrder, po_id)
        if po and po.status == "open":
            open_pos.append(po)
    return open_pos


async def generate_demo_operations(
    db: AsyncSession,
    *,
    retailer_order_count: int = 5,
    supplier_order_count: int = 4,
    schedule_count: int = 6,
    facility_id: str | None = None,
    seed: int | None = None,
) -> DemoGenerateResult:
    rng = random.Random(seed)
    now = datetime.now(timezone.utc)
    today = date.today()
    result = DemoGenerateResult()

    facilities = await _load_facilities(db, facility_id)
    retailers = await _load_retailers(db)
    skus = await _load_skus(db)
    suppliers = await _load_suppliers(db)
    ingredients = await _load_ingredients(db)
    lines_by_facility = await _load_lines_by_facility(db, facilities)
    lot_totals = await _load_lot_totals(db, facilities)

    if retailer_order_count > 0 and (not retailers or not skus):
        raise HTTPException(422, "Cannot create retailer orders without retailers and skus.")
    if supplier_order_count > 0 and (not suppliers or not ingredients or not facilities):
        raise HTTPException(
            422,
            "Cannot create supplier orders without suppliers, ingredients, and facilities.",
        )
    if schedule_count > 0 and (not skus or not facilities):
        raise HTTPException(
            422,
            "Cannot create schedules without skus and facilities. Run `make schema.seed` first.",
        )

    created_po_ids: list[uuid.UUID] = []

    for _ in range(retailer_order_count):
        retailer_id = rng.choice(retailers)
        sku_id = rng.choice(skus)
        quantity = rng.randint(800, 4000)
        delivery = today + timedelta(days=rng.randint(3, 14))
        order = RetailerOrder(
            retailer_id=retailer_id,
            sku_id=sku_id,
            quantity_units=quantity,
            requested_delivery_date=delivery,
            received_at=now,
            status="open",
        )
        db.add(order)
        await db.flush()
        created_po_ids.append(order.retailer_order_id)
        result.retailer_orders.append(
            {
                "order_id": str(order.retailer_order_id),
                "retailer_id": retailer_id,
                "sku_id": sku_id,
                "quantity": quantity,
                "requested_delivery_date": delivery.isoformat(),
                "status": "open",
            }
        )

    for i in range(supplier_order_count):
        if not facilities:
            break
        fac = rng.choice(facilities)
        supplier_id = rng.choice(suppliers)
        item_count = rng.randint(1, min(3, len(ingredients)))
        items = _weighted_ingredients(rng, ingredients, lot_totals, fac, item_count)
        if not items:
            continue
        delivery = today + timedelta(days=rng.randint(5, 10))
        order = SupplierOrder(
            supplier_id=supplier_id,
            facility_id=fac,
            status="confirmed",
            confirmed_at=now,
            delivery_date=delivery,
            external_po_number=f"PO-DEMO-{now.strftime('%Y%m%d')}-{i + 1:03d}",
        )
        db.add(order)
        await db.flush()
        line_items = []
        for ing_id, qty, price in items:
            db.add(
                SupplierOrderItem(
                    order_id=order.order_id,
                    ingredient_id=ing_id,
                    quantity_kg=qty,
                    unit_price=price,
                )
            )
            line_items.append(
                {"ingredient_id": ing_id, "quantity_kg": qty, "unit_price": price}
            )
        result.supplier_orders.append(
            {
                "order_id": str(order.order_id),
                "supplier_id": supplier_id,
                "facility_id": fac,
                "status": "confirmed",
                "delivery_date": delivery.isoformat(),
                "items": line_items,
            }
        )

    eligible_pos = await _open_pos_without_schedule(db, created_po_ids)
    rng.shuffle(eligible_pos)
    po_iter = iter(eligible_pos)

    for i in range(schedule_count):
        if not facilities:
            break
        fac = rng.choice(facilities)
        lines = lines_by_facility.get(fac) or []
        if not lines:
            line = await resolve_default_line(db, fac)
            line_id = line.line_id
        else:
            line_id = rng.choice(lines)

        po: RetailerOrder | None = next(po_iter, None)
        if po:
            sku_id = po.sku_id
            qty = rng.randint(max(1, po.quantity_units // 2), po.quantity_units)
            retailer_order_id = po.retailer_order_id
        else:
            sku_id = rng.choice(skus)
            qty = rng.randint(700, 2400)
            retailer_order_id = None

        if i % 3 == 2:
            status = "suggested"
            start_at = now + timedelta(days=1, hours=rng.randint(0, 8))
        else:
            status = "approved"
            start_at = now + timedelta(hours=rng.randint(1, 36))

        duration_hours = rng.randint(2, 6)
        end_at = start_at + timedelta(hours=duration_hours)
        waste = round(rng.uniform(0, 25), 1) if status == "suggested" else 0.0

        row = ProductionSchedule(
            facility_id=fac,
            line_id=line_id,
            sku_id=sku_id,
            start_at=start_at,
            end_at=end_at,
            quantity_units=qty,
            status=status,
            waste_avoided_kg=waste,
            retailer_order_id=retailer_order_id,
            version=1,
            created_at=now,
        )
        db.add(row)
        if po:
            mark_po_scheduled(po)
        await db.flush()
        result.schedules.append(
            {
                "schedule_id": str(row.schedule_id),
                "facility_id": fac,
                "line_id": line_id,
                "sku_id": sku_id,
                "status": status,
                "quantity_units": qty,
                "start_at": start_at.isoformat(),
                "end_at": end_at.isoformat(),
                "retailer_order_id": str(retailer_order_id) if retailer_order_id else None,
            }
        )

    await db.commit()
    return result
