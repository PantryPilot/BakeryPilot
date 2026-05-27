import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import (
    ActionCard as ActionCardORM,
    Ingredient,
    IngredientLot,
    InventoryEvent,
    RetailerOrder as RetailerOrderORM,
    Supplier,
    SupplierOrder,
    SupplierOrderItem,
    WarehouseCost,
)
from app.db.session import get_db
from app.models.orders import (
    LandedCostBreakdown,
    OrderLineItem,
    RetailerOrder,
    RetailerOrderRequest,
    SupplierOrder as SupplierOrderModel,
    SupplierOrderDraftRequest,
    SupplierOrderDraftResponse,
)
from app.services.landed_cost import compute_landed_cost

router = APIRouter(prefix="/api", tags=["orders"])


@router.post("/orders/draft", response_model=SupplierOrderDraftResponse)
async def draft_supplier_order(
    req: SupplierOrderDraftRequest, db: AsyncSession = Depends(get_db)
) -> SupplierOrderDraftResponse:
    supplier = await db.get(Supplier, req.supplier_id)
    if not supplier:
        raise HTTPException(404, f"supplier {req.supplier_id} not found")

    facility_id = req.facility_id or "plant-toronto"

    wc = (
        await db.execute(
            select(WarehouseCost).where(
                WarehouseCost.facility_id == facility_id,
                WarehouseCost.storage_type == "dry",
            )
        )
    ).scalar_one_or_none()
    holding_rate = float(wc.cost_per_kg_per_day) if wc else 0.0025

    total_qty = sum(i.quantity_kg for i in req.items)
    avg_price = (
        sum(i.unit_price * i.quantity_kg for i in req.items) / total_qty if total_qty else 0
    )
    breakdown = compute_landed_cost(
        unit_price=avg_price,
        quantity_kg=total_qty,
        holding_cost_per_kg_per_day=holding_rate,
        expected_days_held=14.0,
        moq_kg=float(supplier.moq_kg or 0),
    )

    card = ActionCardORM(
        kind="supplier_order",
        payload={
            "supplier_id": req.supplier_id,
            "items": [i.model_dump() for i in req.items],
            "delivery_date": req.delivery_date,
            "facility_id": facility_id,
            "landed_cost_breakdown": breakdown,
            "title": f"PO for {supplier.name} — {total_qty} kg",
            "agent": "ProcurementAgent",
        },
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)

    return SupplierOrderDraftResponse(
        action_card_id=str(card.card_id),
        landed_cost_breakdown=LandedCostBreakdown(**breakdown),
    )


@router.get("/orders", response_model=list[SupplierOrderModel])
async def list_orders(db: AsyncSession = Depends(get_db)) -> list[SupplierOrderModel]:
    orders = (
        await db.execute(
            select(SupplierOrder).options(selectinload(SupplierOrder.items))
            .order_by(SupplierOrder.created_at.desc())
        )
    ).scalars().all()
    return [
        SupplierOrderModel(
            order_id=str(o.order_id),
            supplier_id=o.supplier_id,
            items=[
                OrderLineItem(
                    ingredient_id=i.ingredient_id,
                    quantity_kg=float(i.quantity_kg),
                    unit_price=float(i.unit_price),
                )
                for i in o.items
            ],
            delivery_date=o.delivery_date.isoformat() if o.delivery_date else "",
            status=o.status,
            confirmed_at=o.confirmed_at.isoformat() if o.confirmed_at else None,
            action_card_id=str(o.action_card_id) if o.action_card_id else None,
        )
        for o in orders
    ]


@router.post("/orders/{order_id}/receive", response_model=SupplierOrderModel)
async def receive_supplier_order(
    order_id: str, db: AsyncSession = Depends(get_db)
) -> SupplierOrderModel:
    """Mark a confirmed supplier order as received and materialise it as
    ingredient lots (with append-only inventory_events:receipt)."""
    order = (
        await db.execute(
            select(SupplierOrder)
            .options(selectinload(SupplierOrder.items))
            .where(SupplierOrder.order_id == order_id)
        )
    ).scalars().first()
    if not order:
        raise HTTPException(404, f"supplier order {order_id} not found")
    if order.status == "sent":
        raise HTTPException(409, "order already received (status=sent)")
    if order.status not in ("confirmed", "pending_confirm", "draft"):
        raise HTTPException(409, f"cannot receive order in status {order.status!r}")

    today = date.today()
    received_at = datetime.now(timezone.utc)
    for item in order.items:
        ingredient = await db.get(Ingredient, item.ingredient_id)
        if not ingredient:
            raise HTTPException(404, f"ingredient {item.ingredient_id} missing")
        shelf_life = max(int(ingredient.shelf_life_days_default or 30), 1)
        expiry = today + timedelta(days=shelf_life)
        lot = IngredientLot(
            facility_id=order.facility_id,
            ingredient_id=item.ingredient_id,
            supplier_id=order.supplier_id,
            quantity_kg=float(item.quantity_kg),
            received_date=today,
            expiry_date=expiry,
            storage_zone=ingredient.default_storage_zone,
            unit_cost=float(item.unit_price),
            lot_code=f"PO-{str(order.order_id)[:8]}-{item.ingredient_id[-6:]}",
        )
        db.add(lot)
        await db.flush()
        db.add(InventoryEvent(
            kind="receipt",
            lot_id=lot.lot_id,
            delta_kg=float(item.quantity_kg),
            source="supplier_order_receive",
            source_ref=str(order.order_id),
            note=f"Received from {order.supplier_id}",
            event_at=received_at,
        ))

    order.status = "sent"
    order.confirmed_at = order.confirmed_at or received_at
    await db.commit()
    await db.refresh(order, ["items"])

    return SupplierOrderModel(
        order_id=str(order.order_id),
        supplier_id=order.supplier_id,
        items=[
            OrderLineItem(
                ingredient_id=i.ingredient_id,
                quantity_kg=float(i.quantity_kg),
                unit_price=float(i.unit_price),
            )
            for i in order.items
        ],
        delivery_date=order.delivery_date.isoformat() if order.delivery_date else "",
        status=order.status,
        confirmed_at=order.confirmed_at.isoformat() if order.confirmed_at else None,
        action_card_id=str(order.action_card_id) if order.action_card_id else None,
    )


@router.get("/retailer_orders", response_model=list[RetailerOrder])
async def list_retailer_orders(db: AsyncSession = Depends(get_db)) -> list[RetailerOrder]:
    orders = (
        await db.execute(
            select(RetailerOrderORM).order_by(RetailerOrderORM.received_at.desc())
        )
    ).scalars().all()
    return [
        RetailerOrder(
            order_id=str(o.retailer_order_id),
            retailer_id=o.retailer_id,
            sku_id=o.sku_id,
            quantity=o.quantity_units,
            requested_delivery_date=o.requested_delivery_date.isoformat(),
            received_at=o.received_at.isoformat(),
            status=o.status,
        )
        for o in orders
    ]


@router.post("/retailer_orders", response_model=dict)
async def create_retailer_order(
    req: RetailerOrderRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    order = RetailerOrderORM(
        retailer_id=req.retailer_id,
        sku_id=req.sku_id,
        quantity_units=req.quantity,
        requested_delivery_date=req.requested_delivery_date,
        received_at=datetime.now(timezone.utc),
    )
    db.add(order)
    await db.flush()

    card = ActionCardORM(
        kind="schedule_change",
        payload={
            "trigger_order_id": str(order.retailer_order_id),
            "narration": (
                f"New {req.retailer_id} PO for {req.quantity:,} units of {req.sku_id} "
                f"by {req.requested_delivery_date}. Proposing schedule re-tile."
            ),
            "title": f"Schedule change for {req.sku_id}",
            "agent": "SchedulerAgent",
        },
    )
    db.add(card)
    await db.commit()

    return {"order_id": str(order.retailer_order_id), "action_card_id": str(card.card_id)}
