from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import (
    ActionCard as ActionCardORM,
    ProductionSchedule as ScheduleORM,
    RetailerOrder,
)
from app.db.session import get_db
from app.models.schedules import (
    CreateScheduleRequest,
    ProductionSchedule,
    ScheduleDiff,
    ScheduleRun,
    UpdateScheduleRequest,
    WhatIfRequest,
)
from app.services.schedule_apply import parse_iso_dt, resolve_schedule, utc_iso
from app.services.schedule_fulfillment import (
    mark_po_scheduled,
    revert_po_if_unlinked,
    validate_schedule_fulfillment,
)
from app.services.schedule_propose import (
    build_schedule_change_payload,
    build_schedule_diff,
    format_schedule_window,
    propose_current_schedule_change,
    resolve_schedule_for_draft,
)

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


def _utc_iso(dt: datetime) -> str:
    """Return ISO string with explicit UTC offset so JS Date.getUTCHours() works reliably."""
    return utc_iso(dt)


async def _resolve_schedule(db: AsyncSession, schedule_id: str) -> ScheduleORM | None:
    return await resolve_schedule(db, schedule_id)


def _schedule_not_found_detail(schedule_id: str) -> str:
    hint = ""
    if schedule_id not in ("current", "latest"):
        try:
            uuid.UUID(schedule_id)
        except ValueError:
            hint = " Use schedule_id 'current' or a UUID from GET /api/schedules."
    return f"schedule {schedule_id} not found.{hint}"


def _retailer_fields(s: ScheduleORM) -> dict:
    ro = s.retailer_order
    retailer_name = ro.retailer.name if ro and ro.retailer else None
    return {
        "retailer_order_id": str(s.retailer_order_id) if s.retailer_order_id else None,
        "retailer_id": ro.retailer_id if ro else None,
        "retailer_name": retailer_name,
        "requested_delivery_date": (
            ro.requested_delivery_date.isoformat() if ro and ro.requested_delivery_date else None
        ),
    }


def _to_model(s: ScheduleORM) -> ProductionSchedule:
    retailer = _retailer_fields(s)
    run = ScheduleRun(
        run_id=str(s.schedule_id),
        sku_id=s.sku_id,
        start_at=_utc_iso(s.start_at),
        end_at=_utc_iso(s.end_at),
        quantity=s.quantity_units,
        lot_assignments=[],
        **retailer,
    )
    return ProductionSchedule(
        schedule_id=str(s.schedule_id),
        version=s.version,
        facility_id=s.facility_id,
        line_id=s.line_id,
        runs=[run],
        waste_avoided_kg=float(s.waste_avoided_kg),
        status=s.status,
        **retailer,
    )


def _schedule_load_options():
    return selectinload(ScheduleORM.retailer_order).selectinload(RetailerOrder.retailer)


@router.get("", response_model=list[ProductionSchedule])
async def list_schedules(db: AsyncSession = Depends(get_db)) -> list[ProductionSchedule]:
    schedules = (
        await db.execute(
            select(ScheduleORM)
            .options(_schedule_load_options())
            .where(ScheduleORM.status.in_(("suggested", "approved")))
            .order_by(ScheduleORM.start_at.desc())
        )
    ).scalars().all()
    return [_to_model(s) for s in schedules]


@router.post("", response_model=ProductionSchedule, status_code=201)
async def create_schedule(
    req: CreateScheduleRequest, db: AsyncSession = Depends(get_db)
) -> ProductionSchedule:
    """Insert a production_schedules row (line + SKU + time window).

    ``retailer_order_id`` is optional — when provided, PO fulfillment rules apply.
    """
    if req.status not in ("suggested", "approved", "complete"):
        raise HTTPException(422, "status must be suggested, approved, or complete")
    if req.quantity_units <= 0:
        raise HTTPException(422, "quantity_units must be positive")
    try:
        start_at = parse_iso_dt(req.start_at)
        end_at = parse_iso_dt(req.end_at)
    except ValueError as exc:
        raise HTTPException(422, f"invalid datetime: {exc}") from exc
    if end_at <= start_at:
        raise HTTPException(422, "end_at must be after start_at")

    po = None
    retailer_order_id: uuid.UUID | None = None
    if req.retailer_order_id:
        po = await validate_schedule_fulfillment(
            db,
            retailer_order_id=req.retailer_order_id,
            sku_id=req.sku_id,
            quantity_units=req.quantity_units,
        )
        retailer_order_id = po.retailer_order_id

    row = ScheduleORM(
        facility_id=req.facility_id,
        line_id=req.line_id,
        sku_id=req.sku_id,
        start_at=start_at,
        end_at=end_at,
        quantity_units=req.quantity_units,
        status=req.status,
        waste_avoided_kg=req.waste_avoided_kg,
        retailer_order_id=retailer_order_id,
        version=1,
    )
    db.add(row)
    if po:
        mark_po_scheduled(po)
    await db.commit()
    await db.refresh(row, ["retailer_order"])
    if row.retailer_order:
        await db.refresh(row.retailer_order, ["retailer"])
    return _to_model(row)


@router.patch("/{schedule_id}", response_model=ProductionSchedule)
async def update_schedule(
    schedule_id: str,
    req: UpdateScheduleRequest,
    db: AsyncSession = Depends(get_db),
) -> ProductionSchedule:
    """Update schedule timing or line placement (manual planner drag-and-drop)."""
    if not any(
        v is not None
        for v in (req.start_at, req.end_at, req.line_id, req.facility_id)
    ):
        raise HTTPException(422, "at least one field must be provided")

    try:
        sid = uuid.UUID(schedule_id)
    except ValueError:
        raise HTTPException(404, _schedule_not_found_detail(schedule_id))
    row = (
        await db.execute(
            select(ScheduleORM)
            .options(_schedule_load_options())
            .where(ScheduleORM.schedule_id == sid)
        )
    ).scalars().first()
    if not row:
        raise HTTPException(404, _schedule_not_found_detail(schedule_id))

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

    if req.facility_id is not None:
        row.facility_id = req.facility_id
    if req.line_id is not None:
        row.line_id = req.line_id
    row.start_at = start_at
    row.end_at = end_at
    row.version += 1

    await db.commit()
    await db.refresh(row, ["retailer_order"])
    if row.retailer_order:
        await db.refresh(row.retailer_order, ["retailer"])
    return _to_model(row)


@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(
    schedule_id: str, db: AsyncSession = Depends(get_db)
) -> Response:
    """Remove a production_schedules row (manual planner delete)."""
    try:
        sid = uuid.UUID(schedule_id)
    except ValueError:
        raise HTTPException(404, _schedule_not_found_detail(schedule_id))
    row = await db.get(ScheduleORM, sid)
    if not row:
        raise HTTPException(404, _schedule_not_found_detail(schedule_id))
    retailer_order_id = row.retailer_order_id
    await db.execute(
        text("UPDATE production_runs SET schedule_id = NULL WHERE schedule_id = :sid"),
        {"sid": sid},
    )
    await db.delete(row)
    await db.flush()
    if retailer_order_id:
        await revert_po_if_unlinked(db, retailer_order_id)
    await db.commit()
    return Response(status_code=204)


@router.get("/{schedule_id}", response_model=ProductionSchedule)
async def get_schedule(
    schedule_id: str, db: AsyncSession = Depends(get_db)
) -> ProductionSchedule:
    s = await _resolve_schedule(db, schedule_id)
    if not s:
        raise HTTPException(404, _schedule_not_found_detail(schedule_id))
    if s.retailer_order_id:
        await db.refresh(s, ["retailer_order"])
        if s.retailer_order:
            await db.refresh(s.retailer_order, ["retailer"])
    return _to_model(s)


@router.get("/current/diff", response_model=ScheduleDiff)
async def current_schedule_diff(db: AsyncSession = Depends(get_db)) -> ScheduleDiff:
    return await schedule_diff("current", db)


@router.get("/{schedule_id}/diff", response_model=ScheduleDiff)
async def schedule_diff(
    schedule_id: str, db: AsyncSession = Depends(get_db)
) -> ScheduleDiff:
    s = await _resolve_schedule(db, schedule_id)
    if not s:
        raise HTTPException(404, _schedule_not_found_detail(schedule_id))
    return build_schedule_diff(s)


@router.post("/{schedule_id}/what_if", response_model=ScheduleDiff)
async def what_if(
    schedule_id: str, req: WhatIfRequest, db: AsyncSession = Depends(get_db)
) -> ScheduleDiff:
    diff = await schedule_diff(schedule_id, db)
    diff.changes[0].narration = f"What-if: {req.change_description}. " + diff.changes[0].narration
    return diff


@router.post("/{schedule_id}/post", response_model=dict)
async def post_to_mes(
    schedule_id: str, db: AsyncSession = Depends(get_db)
) -> dict:
    s = await _resolve_schedule(db, schedule_id)
    if not s:
        raise HTTPException(404, f"schedule {schedule_id} not found")
    s.status = "approved"
    await db.commit()
    resolved_id = str(s.schedule_id)
    return {
        "schedule_id": resolved_id,
        "mes_ack_id": f"mes-{resolved_id[:8]}",
        "accepted_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/current/propose", response_model=dict)
async def propose_current(db: AsyncSession = Depends(get_db)) -> dict:
    """Build diff from current schedule and create a pending schedule_change card."""
    card = await propose_current_schedule_change(db)
    if not card:
        raise HTTPException(404, "no current schedule to propose changes for")
    s = await _resolve_schedule(db, "current")
    diff = build_schedule_diff(s) if s else None
    return {
        "action_card_id": str(card.card_id),
        "kind": card.kind,
        "title": card.payload.get("title"),
        "diff": diff.model_dump() if diff else None,
    }


class ScheduleChangeDraftRequest(BaseModel):
    facility_id: str
    substitute_sku_id: str
    requested_by_sku_id: str
    requested_units: int
    rationale: str | None = None
    schedule_id: str | None = None
    line_id: str | None = None
    start_at: str | None = None
    end_at: str | None = None
    waste_avoided_kg: float | None = None
    retailer_order_id: str | None = None


@router.post("/draft_change", response_model=dict)
async def draft_schedule_change(
    req: ScheduleChangeDraftRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    """Create a pending action_card the operator can confirm to swap one SKU
    for another on the production line. On confirm, the backend supersedes the
    matching ``production_schedules`` row and creates an approved replacement,
    and updates ``production_orders`` on the line."""
    s = await resolve_schedule_for_draft(
        db,
        schedule_id=req.schedule_id,
        facility_id=req.facility_id,
        line_id=req.line_id,
        requested_by_sku_id=req.requested_by_sku_id,
    )

    if s:
        before = ScheduleRun(
            run_id=str(s.schedule_id),
            sku_id=s.sku_id,
            start_at=utc_iso(s.start_at),
            end_at=utc_iso(s.end_at),
            quantity=s.quantity_units,
            lot_assignments=[],
        )
        after = ScheduleRun(
            run_id=str(s.schedule_id),
            sku_id=req.substitute_sku_id,
            start_at=req.start_at or utc_iso(s.start_at),
            end_at=req.end_at or utc_iso(s.end_at),
            quantity=req.requested_units,
            lot_assignments=[],
        )
        payload = await build_schedule_change_payload(
            db,
            s,
            before,
            after,
            agent="SchedulerAgent",
            rationale=req.rationale or None,
        )
    else:
        payload = {
            "facility_id": req.facility_id,
            "substitute_sku_id": req.substitute_sku_id,
            "requested_by_sku_id": req.requested_by_sku_id,
            "requested_units": req.requested_units,
            "rationale": req.rationale or "",
            "title": f"Swap {req.requested_by_sku_id} → {req.substitute_sku_id}",
            "agent": "SchedulerAgent",
        }
        if req.schedule_id:
            payload["schedule_id"] = req.schedule_id
        if req.line_id:
            payload["line_id"] = req.line_id
        if req.start_at:
            payload["start_at"] = req.start_at
            payload["after_window"] = format_schedule_window(req.start_at, req.end_at or req.start_at)
        if req.end_at:
            payload["end_at"] = req.end_at
        if req.waste_avoided_kg is not None:
            payload["waste_avoided_kg"] = req.waste_avoided_kg
    if req.retailer_order_id:
        payload["retailer_order_id"] = req.retailer_order_id

    card = ActionCardORM(
        kind="schedule_change",
        payload=payload,
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return {
        "action_card_id": str(card.card_id),
        "kind": "schedule_change",
        "title": card.payload["title"],
    }
