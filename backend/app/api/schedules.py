from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ProductionSchedule as ScheduleORM
from app.db.session import get_db
from app.models.schedules import (
    ProductionSchedule,
    ScheduleChange,
    ScheduleDiff,
    ScheduleRun,
    WhatIfRequest,
)

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


def _utc_iso(dt: datetime) -> str:
    """Return ISO string with explicit UTC offset so JS Date.getUTCHours() works reliably."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _to_model(s: ScheduleORM) -> ProductionSchedule:
    run = ScheduleRun(
        run_id=str(s.schedule_id),
        sku_id=s.sku_id,
        start_at=_utc_iso(s.start_at),
        end_at=_utc_iso(s.end_at),
        quantity=s.quantity_units,
        lot_assignments=[],
    )
    return ProductionSchedule(
        schedule_id=str(s.schedule_id),
        version=s.version,
        facility_id=s.facility_id,
        line_id=s.line_id,
        runs=[run],
        waste_avoided_kg=float(s.waste_avoided_kg),
        status=s.status,
    )


@router.get("", response_model=list[ProductionSchedule])
async def list_schedules(db: AsyncSession = Depends(get_db)) -> list[ProductionSchedule]:
    schedules = (
        await db.execute(select(ScheduleORM).order_by(ScheduleORM.start_at.desc()))
    ).scalars().all()
    return [_to_model(s) for s in schedules]


@router.get("/{schedule_id}", response_model=ProductionSchedule)
async def get_schedule(
    schedule_id: str, db: AsyncSession = Depends(get_db)
) -> ProductionSchedule:
    s = await db.get(ScheduleORM, schedule_id)
    if not s:
        raise HTTPException(404, f"schedule {schedule_id} not found")
    return _to_model(s)


@router.get("/{schedule_id}/diff", response_model=ScheduleDiff)
async def schedule_diff(
    schedule_id: str, db: AsyncSession = Depends(get_db)
) -> ScheduleDiff:
    s = await db.get(ScheduleORM, schedule_id)
    if not s:
        raise HTTPException(404, f"schedule {schedule_id} not found")
    before_run = ScheduleRun(
        run_id=str(s.schedule_id),
        sku_id=s.sku_id,
        start_at=_utc_iso(s.start_at),
        end_at=_utc_iso(s.end_at),
        quantity=s.quantity_units,
        lot_assignments=[],
    )
    after_run = ScheduleRun(
        run_id=str(s.schedule_id),
        sku_id="sku-ace-sourdough-bistro",
        start_at=_utc_iso(s.start_at + timedelta(hours=1)),
        end_at=_utc_iso(s.end_at + timedelta(hours=1)),
        quantity=s.quantity_units,
        lot_assignments=[],
    )
    return ScheduleDiff(
        before=[before_run],
        after=[after_run],
        changes=[
            ScheduleChange(
                kind="move",
                affected_run_ids=[str(s.schedule_id)],
                narration=(
                    f"Swapped {s.sku_id} for lemon poppy seed — "
                    "blueberry stock below threshold; substitution preserves line utilization."
                ),
            )
        ],
    )


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
    s = await db.get(ScheduleORM, schedule_id)
    if not s:
        raise HTTPException(404, f"schedule {schedule_id} not found")
    s.status = "approved"
    await db.commit()
    return {
        "schedule_id": schedule_id,
        "mes_ack_id": f"mes-{schedule_id[:8]}",
        "accepted_at": datetime.now(timezone.utc).isoformat(),
    }
