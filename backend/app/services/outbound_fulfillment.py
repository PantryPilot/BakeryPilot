"""Validate and apply warehouse → retailer outbound shipment rules."""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import FinishedGoodsPallet, OutboundShipment, RetailerOrder, Sku
from app.services.schedule_apply import parse_iso_dt
from app.services.schedule_fulfillment import (
    assert_qty_within_po,
    assert_sku_matches_po,
    load_retailer_order,
    mark_po_scheduled,
    validate_open_retailer_order,
)


async def available_warehouse_units(
    db: AsyncSession, *, facility_id: str, sku_id: str
) -> int:
    total = (
        await db.execute(
            select(func.coalesce(func.sum(FinishedGoodsPallet.quantity), 0)).where(
                FinishedGoodsPallet.facility_id == facility_id,
                FinishedGoodsPallet.sku_id == sku_id,
                FinishedGoodsPallet.status == "in_warehouse",
                FinishedGoodsPallet.committed_order_id.is_(None),
            )
        )
    ).scalar_one()
    return int(total or 0)


async def assert_stock_available(
    db: AsyncSession, *, facility_id: str, sku_id: str, quantity_units: int
) -> None:
    available = await available_warehouse_units(db, facility_id=facility_id, sku_id=sku_id)
    if quantity_units > available:
        raise HTTPException(
            422,
            f"quantity {quantity_units} exceeds warehouse stock ({available} units available at {facility_id!r})",
        )


async def assert_po_not_already_shipped(
    db: AsyncSession,
    retailer_order_id: uuid.UUID,
    *,
    exclude_shipment_id: uuid.UUID | None = None,
) -> None:
    q = select(OutboundShipment).where(
        OutboundShipment.retailer_order_id == retailer_order_id,
        OutboundShipment.status.in_(("scheduled", "in_transit")),
    )
    if exclude_shipment_id is not None:
        q = q.where(OutboundShipment.shipment_id != exclude_shipment_id)
    existing = (await db.execute(q.limit(1))).scalars().first()
    if existing:
        raise HTTPException(409, "retailer order already has an active outbound shipment")


async def validate_outbound_shipment(
    db: AsyncSession,
    *,
    facility_id: str,
    retailer_order_id: str,
    sku_id: str,
    quantity_units: int,
    exclude_shipment_id: uuid.UUID | None = None,
) -> RetailerOrder:
    po = await load_retailer_order(db, retailer_order_id)
    validate_open_retailer_order(po)
    assert_sku_matches_po(po, sku_id)
    assert_qty_within_po(po, quantity_units)
    await assert_po_not_already_shipped(
        db, po.retailer_order_id, exclude_shipment_id=exclude_shipment_id
    )
    await assert_stock_available(
        db, facility_id=facility_id, sku_id=sku_id, quantity_units=quantity_units
    )
    return po


async def commit_pallets_fefo(
    db: AsyncSession,
    *,
    facility_id: str,
    sku_id: str,
    quantity_units: int,
    retailer_order_id: uuid.UUID,
) -> None:
    """Reserve in_warehouse pallets (FEFO) for this retailer PO."""
    pallets = (
        await db.execute(
            select(FinishedGoodsPallet)
            .where(
                FinishedGoodsPallet.facility_id == facility_id,
                FinishedGoodsPallet.sku_id == sku_id,
                FinishedGoodsPallet.status == "in_warehouse",
                FinishedGoodsPallet.committed_order_id.is_(None),
            )
            .order_by(FinishedGoodsPallet.produced_at.asc())
        )
    ).scalars().all()
    reserved = 0
    for pallet in pallets:
        if reserved >= quantity_units:
            break
        pallet.committed_order_id = retailer_order_id
        reserved += pallet.quantity
    if reserved < quantity_units:
        raise HTTPException(409, "could not reserve enough pallets — stock changed during booking")


async def release_pallets_for_order(
    db: AsyncSession, retailer_order_id: uuid.UUID
) -> None:
    pallets = (
        await db.execute(
            select(FinishedGoodsPallet).where(
                FinishedGoodsPallet.committed_order_id == retailer_order_id,
                FinishedGoodsPallet.status == "in_warehouse",
            )
        )
    ).scalars().all()
    for pallet in pallets:
        pallet.committed_order_id = None


async def revert_po_if_unlinked(db: AsyncSession, retailer_order_id: uuid.UUID) -> None:
    po = await db.get(RetailerOrder, retailer_order_id)
    if not po or po.status != "scheduled":
        return
    active = (
        await db.execute(
            select(func.count())
            .select_from(OutboundShipment)
            .where(
                OutboundShipment.retailer_order_id == retailer_order_id,
                OutboundShipment.status.in_(("scheduled", "in_transit")),
            )
        )
    ).scalar_one()
    if int(active or 0) == 0:
        po.status = "open"


async def warehouse_stock_by_facility(
    db: AsyncSession, facility_id: str | None = None
) -> list[dict]:
    q = (
        select(
            FinishedGoodsPallet.facility_id,
            FinishedGoodsPallet.sku_id,
            func.coalesce(func.sum(FinishedGoodsPallet.quantity), 0).label("units"),
            func.count().label("pallets"),
        )
        .where(
            FinishedGoodsPallet.status == "in_warehouse",
            FinishedGoodsPallet.committed_order_id.is_(None),
        )
        .group_by(FinishedGoodsPallet.facility_id, FinishedGoodsPallet.sku_id)
    )
    if facility_id:
        q = q.where(FinishedGoodsPallet.facility_id == facility_id)
    rows = (await db.execute(q)).all()

    sku_ids = {r.sku_id for r in rows}
    sku_names: dict[str, str] = {}
    if sku_ids:
        skus = (await db.execute(select(Sku).where(Sku.sku_id.in_(sku_ids)))).scalars().all()
        sku_names = {s.sku_id: s.name for s in skus}

    return [
        {
            "facility_id": r.facility_id,
            "sku_id": r.sku_id,
            "sku_name": sku_names.get(r.sku_id, r.sku_id),
            "available_units": int(r.units),
            "pallet_count": int(r.pallets),
        }
        for r in rows
        if int(r.units) > 0
    ]


def parse_shipment_times(start_at: str, end_at: str) -> tuple:
    try:
        start = parse_iso_dt(start_at)
        end = parse_iso_dt(end_at)
    except ValueError as exc:
        raise HTTPException(422, f"invalid datetime: {exc}") from exc
    if end <= start:
        raise HTTPException(422, "end_at must be after start_at")
    return start, end


async def apply_outbound_shipment(
    db: AsyncSession,
    *,
    facility_id: str,
    retailer_order_id: str,
    sku_id: str,
    quantity_units: int,
    start_at: str,
    end_at: str,
    status: str = "scheduled",
) -> "OutboundShipment":
    """Validate stock + PO, reserve pallets, insert outbound_shipments row."""
    from app.db.models import OutboundShipment as ShipmentORM

    if quantity_units <= 0:
        raise HTTPException(422, "quantity_units must be positive")
    if status not in ("scheduled", "in_transit"):
        raise HTTPException(422, "status must be scheduled or in_transit")
    start, end = parse_shipment_times(start_at, end_at)

    po = await validate_outbound_shipment(
        db,
        facility_id=facility_id,
        retailer_order_id=retailer_order_id,
        sku_id=sku_id,
        quantity_units=quantity_units,
    )

    await commit_pallets_fefo(
        db,
        facility_id=facility_id,
        sku_id=sku_id,
        quantity_units=quantity_units,
        retailer_order_id=po.retailer_order_id,
    )

    row = ShipmentORM(
        facility_id=facility_id,
        retailer_order_id=po.retailer_order_id,
        sku_id=sku_id,
        quantity_units=quantity_units,
        start_at=start,
        end_at=end,
        status=status,
    )
    db.add(row)
    mark_po_scheduled(po)
    await db.flush()
    return row
