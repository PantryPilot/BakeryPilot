import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import ActionCard as ActionCardORM
from app.db.models import OutboundShipment as ShipmentORM
from app.db.models import RetailerOrder
from app.db.session import get_db
from app.models.outbound import (
    CreateOutboundShipmentRequest,
    DraftOutboundShipmentRequest,
    OutboundShipment,
    UpdateOutboundShipmentRequest,
    WarehouseStockRow,
)
from app.services.outbound_fulfillment import (
    apply_outbound_shipment,
    parse_shipment_times,
    release_pallets_for_order,
    revert_po_if_unlinked,
    validate_outbound_shipment,
    warehouse_stock_by_facility,
)
from app.services.schedule_apply import parse_iso_dt, utc_iso

router = APIRouter(prefix="/api/outbound_shipments", tags=["outbound"])


def _to_model(row: ShipmentORM) -> OutboundShipment:
    ro = row.retailer_order
    retailer_name = ro.retailer.name if ro and ro.retailer else None
    facility_name = row.facility.name if row.facility else None
    sku_name = row.sku.name if row.sku else None
    return OutboundShipment(
        shipment_id=str(row.shipment_id),
        facility_id=row.facility_id,
        facility_name=facility_name,
        retailer_order_id=str(row.retailer_order_id),
        retailer_id=ro.retailer_id if ro else "",
        retailer_name=retailer_name,
        sku_id=row.sku_id,
        sku_name=sku_name,
        quantity_units=row.quantity_units,
        start_at=utc_iso(row.start_at),
        end_at=utc_iso(row.end_at),
        status=row.status,
        requested_delivery_date=(
            ro.requested_delivery_date.isoformat() if ro and ro.requested_delivery_date else None
        ),
    )


def _load_options():
    return (
        selectinload(ShipmentORM.facility),
        selectinload(ShipmentORM.sku),
        selectinload(ShipmentORM.retailer_order).selectinload(RetailerOrder.retailer),
    )


@router.get("/warehouse_stock", response_model=list[WarehouseStockRow])
async def list_warehouse_stock(
    facility_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[WarehouseStockRow]:
    rows = await warehouse_stock_by_facility(db, facility_id)
    return [
        WarehouseStockRow(
            sku_id=r["sku_id"],
            sku_name=r["sku_name"],
            available_units=r["available_units"],
            pallet_count=r["pallet_count"],
        )
        for r in rows
    ]


@router.get("", response_model=list[OutboundShipment])
async def list_shipments(db: AsyncSession = Depends(get_db)) -> list[OutboundShipment]:
    rows = (
        await db.execute(
            select(ShipmentORM)
            .options(*_load_options())
            .order_by(ShipmentORM.start_at.desc())
        )
    ).scalars().all()
    return [_to_model(r) for r in rows]


@router.post("", response_model=OutboundShipment, status_code=201)
async def create_shipment(
    req: CreateOutboundShipmentRequest, db: AsyncSession = Depends(get_db)
) -> OutboundShipment:
    row = await apply_outbound_shipment(
        db,
        facility_id=req.facility_id,
        retailer_order_id=req.retailer_order_id,
        sku_id=req.sku_id,
        quantity_units=req.quantity_units,
        start_at=req.start_at,
        end_at=req.end_at,
        status=req.status,
    )
    await db.commit()
    await db.refresh(row, ["facility", "sku", "retailer_order"])
    if row.retailer_order:
        await db.refresh(row.retailer_order, ["retailer"])
    return _to_model(row)


@router.post("/draft", response_model=dict)
async def draft_outbound_shipment(
    req: DraftOutboundShipmentRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    """Create a pending action_card for warehouse → retailer shipment (agent HITL path)."""
    await validate_outbound_shipment(
        db,
        facility_id=req.facility_id,
        retailer_order_id=req.retailer_order_id,
        sku_id=req.sku_id,
        quantity_units=req.quantity_units,
    )
    parse_shipment_times(req.start_at, req.end_at)
    title = f"Outbound · {req.sku_id} → retailer PO"
    payload = {
        "facility_id": req.facility_id,
        "retailer_order_id": req.retailer_order_id,
        "sku_id": req.sku_id,
        "start_at": req.start_at,
        "end_at": req.end_at,
        "quantity_units": req.quantity_units,
        "rationale": req.rationale or "",
        "title": title,
        "agent": "SchedulerAgent",
        "schedule_domain": "outbound",
    }
    card = ActionCardORM(kind="outbound_shipment", payload=payload)
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return {
        "action_card_id": str(card.card_id),
        "kind": "outbound_shipment",
        "title": title,
    }


@router.patch("/{shipment_id}", response_model=OutboundShipment)
async def update_shipment(
    shipment_id: str,
    req: UpdateOutboundShipmentRequest,
    db: AsyncSession = Depends(get_db),
) -> OutboundShipment:
    if req.start_at is None and req.end_at is None:
        raise HTTPException(422, "at least one field must be provided")
    try:
        sid = uuid.UUID(shipment_id)
    except ValueError as exc:
        raise HTTPException(404, f"shipment {shipment_id} not found") from exc

    row = (
        await db.execute(
            select(ShipmentORM).options(*_load_options()).where(ShipmentORM.shipment_id == sid)
        )
    ).scalars().first()
    if not row:
        raise HTTPException(404, f"shipment {shipment_id} not found")

    start_at = row.start_at
    end_at = row.end_at
    if req.start_at is not None:
        try:
            start_at = parse_iso_dt(req.start_at)
        except ValueError as exc:
            raise HTTPException(422, f"invalid start_at: {exc}") from exc
    if req.end_at is not None:
        try:
            end_at = parse_iso_dt(req.end_at)
        except ValueError as exc:
            raise HTTPException(422, f"invalid end_at: {exc}") from exc
    if end_at <= start_at:
        raise HTTPException(422, "end_at must be after start_at")
    row.start_at = start_at
    row.end_at = end_at
    await db.commit()
    await db.refresh(row, ["facility", "sku", "retailer_order"])
    if row.retailer_order:
        await db.refresh(row.retailer_order, ["retailer"])
    return _to_model(row)


@router.delete("/{shipment_id}", status_code=204)
async def delete_shipment(
    shipment_id: str, db: AsyncSession = Depends(get_db)
) -> Response:
    try:
        sid = uuid.UUID(shipment_id)
    except ValueError as exc:
        raise HTTPException(404, f"shipment {shipment_id} not found") from exc
    row = await db.get(ShipmentORM, sid)
    if not row:
        raise HTTPException(404, f"shipment {shipment_id} not found")
    retailer_order_id = row.retailer_order_id
    await release_pallets_for_order(db, retailer_order_id)
    await db.delete(row)
    await db.flush()
    await revert_po_if_unlinked(db, retailer_order_id)
    await db.commit()
    return Response(status_code=204)
