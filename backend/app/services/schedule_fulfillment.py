"""Validate and apply retailer PO ↔ production schedule fulfillment links."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ProductionLine, ProductionSchedule, RetailerOrder
from app.services.schedule_apply import parse_iso_dt


async def load_retailer_order(db: AsyncSession, retailer_order_id: str) -> RetailerOrder:
    try:
        oid = uuid.UUID(retailer_order_id)
    except ValueError as exc:
        raise HTTPException(422, "invalid retailer_order_id") from exc
    po = await db.get(RetailerOrder, oid)
    if not po:
        raise HTTPException(404, f"retailer order {retailer_order_id} not found")
    return po


def validate_open_retailer_order(po: RetailerOrder) -> None:
    if po.status != "open":
        raise HTTPException(409, f"retailer order is {po.status!r}, must be open")


def assert_sku_matches_po(po: RetailerOrder, sku_id: str) -> None:
    if po.sku_id != sku_id:
        raise HTTPException(
            422,
            f"schedule sku {sku_id!r} must match PO sku {po.sku_id!r}",
        )


def assert_qty_within_po(po: RetailerOrder, quantity_units: int) -> None:
    if quantity_units > po.quantity_units:
        raise HTTPException(
            422,
            f"quantity {quantity_units} exceeds PO quantity {po.quantity_units}",
        )


async def assert_po_not_already_scheduled(
    db: AsyncSession,
    retailer_order_id: uuid.UUID,
    *,
    exclude_schedule_id: uuid.UUID | None = None,
) -> None:
    q = select(ProductionSchedule).where(
        ProductionSchedule.retailer_order_id == retailer_order_id,
        ProductionSchedule.status.in_(("suggested", "approved")),
    )
    if exclude_schedule_id is not None:
        q = q.where(ProductionSchedule.schedule_id != exclude_schedule_id)
    existing = (await db.execute(q.limit(1))).scalars().first()
    if existing:
        raise HTTPException(409, "retailer order already linked to an active schedule")


def mark_po_scheduled(po: RetailerOrder) -> None:
    po.status = "scheduled"


async def revert_po_if_unlinked(db: AsyncSession, retailer_order_id: uuid.UUID) -> None:
    po = await db.get(RetailerOrder, retailer_order_id)
    if not po or po.status != "scheduled":
        return
    active = (
        await db.execute(
            select(func.count())
            .select_from(ProductionSchedule)
            .where(
                ProductionSchedule.retailer_order_id == retailer_order_id,
                ProductionSchedule.status.in_(("suggested", "approved")),
            )
        )
    ).scalar_one()
    if int(active or 0) == 0:
        po.status = "open"


async def validate_schedule_fulfillment(
    db: AsyncSession,
    *,
    retailer_order_id: str,
    sku_id: str,
    quantity_units: int,
    exclude_schedule_id: uuid.UUID | None = None,
) -> RetailerOrder:
    po = await load_retailer_order(db, retailer_order_id)
    validate_open_retailer_order(po)
    assert_sku_matches_po(po, sku_id)
    assert_qty_within_po(po, quantity_units)
    await assert_po_not_already_scheduled(
        db, po.retailer_order_id, exclude_schedule_id=exclude_schedule_id
    )
    return po


async def resolve_default_line(
    db: AsyncSession, facility_id: str
) -> ProductionLine:
    line = (
        await db.execute(
            select(ProductionLine)
            .where(
                ProductionLine.facility_id == facility_id,
                ProductionLine.status == "idle",
            )
            .limit(1)
        )
    ).scalars().first()
    if line is None:
        line = (
            await db.execute(
                select(ProductionLine)
                .where(ProductionLine.facility_id == facility_id).limit(1)
            )
        ).scalars().first()
    if line is None:
        raise HTTPException(422, f"no production line at facility {facility_id!r}")
    return line


async def create_schedule_from_retailer_po(
    db: AsyncSession,
    *,
    card_id: str,
    trigger_order_id: str,
    payload: dict,
    now: datetime | None = None,
) -> ProductionSchedule:
    """Create an approved schedule row fulfilling a retailer PO (action-card path)."""
    now = now or datetime.now(timezone.utc)
    po = await load_retailer_order(db, trigger_order_id)
    validate_open_retailer_order(po)
    await assert_po_not_already_scheduled(db, po.retailer_order_id)

    facility_id = str(payload.get("facility_id") or "plant-toronto")
    line = await resolve_default_line(db, facility_id)

    start_at = now + timedelta(hours=2)
    end_at = start_at + timedelta(hours=4)
    if payload.get("start_at"):
        start_at = parse_iso_dt(str(payload["start_at"]))
    if payload.get("end_at"):
        end_at = parse_iso_dt(str(payload["end_at"]))
    elif end_at <= start_at:
        end_at = start_at + timedelta(hours=4)

    row = ProductionSchedule(
        facility_id=facility_id,
        line_id=line.line_id,
        sku_id=po.sku_id,
        start_at=start_at,
        end_at=end_at,
        quantity_units=po.quantity_units,
        status="approved",
        waste_avoided_kg=float(payload.get("waste_avoided_kg") or 0),
        retailer_order_id=po.retailer_order_id,
        action_card_id=uuid.UUID(card_id),
        version=1,
        created_at=now,
    )
    db.add(row)
    mark_po_scheduled(po)
    await db.flush()
    return row
