"""Schedules router: production schedule, diff view, what-if, MES post."""

from datetime import timedelta

from fastapi import APIRouter, HTTPException

from app import mock_data
from app.models.schedules import (
    ProductionSchedule,
    ScheduleChange,
    ScheduleDiff,
    ScheduleRun,
    WhatIfRequest,
)

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


@router.get("", response_model=list[ProductionSchedule])
async def list_schedules() -> list[ProductionSchedule]:
    return [ProductionSchedule(**s) for s in mock_data.PRODUCTION_SCHEDULES]


@router.get("/{schedule_id}", response_model=ProductionSchedule)
async def get_schedule(schedule_id: str) -> ProductionSchedule:
    row = next((s for s in mock_data.PRODUCTION_SCHEDULES if s["schedule_id"] == schedule_id), None)
    if not row:
        raise HTTPException(404, f"schedule {schedule_id} not found")
    return ProductionSchedule(**row)


@router.get("/{schedule_id}/diff", response_model=ScheduleDiff)
async def schedule_diff(schedule_id: str) -> ScheduleDiff:
    """Mock diff between current schedule and a proposed one."""
    current = next(
        (s for s in mock_data.PRODUCTION_SCHEDULES if s["schedule_id"] == schedule_id), None,
    )
    if not current:
        raise HTTPException(404, f"schedule {schedule_id} not found")
    before = [ScheduleRun(**r) for r in current["runs"]]
    after_runs = [dict(r) for r in current["runs"]]
    if after_runs:
        after_runs[0]["sku_id"] = "sku_lemon_poppy"
        after_runs[0]["lot_assignments"] = ["lot_flour_1", "lot_butter_1"]
    after = [ScheduleRun(**r) for r in after_runs]
    return ScheduleDiff(
        before=before, after=after,
        changes=[
            ScheduleChange(
                kind="move", affected_run_ids=["run_1"],
                narration=(
                    "Swapped blueberry muffin for lemon poppy seed on Line 1 -- "
                    "blueberry stock at Plant 1 below threshold; substitution preserves "
                    "Line 1 utilization."
                ),
            ),
        ],
    )


@router.post("/{schedule_id}/what_if", response_model=ScheduleDiff)
async def what_if(schedule_id: str, req: WhatIfRequest) -> ScheduleDiff:
    """Mock what-if: re-uses the diff with a different narration."""
    diff = await schedule_diff(schedule_id)
    diff.changes[0].narration = f"What-if: {req.change_description}. " + diff.changes[0].narration
    return diff


@router.post("/{schedule_id}/post", response_model=dict)
async def post_to_mes(schedule_id: str) -> dict:
    """Mock MES post -- returns an ack id."""
    return {
        "schedule_id": schedule_id,
        "mes_ack_id": mock_data.new_id("mesack"),
        "accepted_at": (mock_data.NOW + timedelta(seconds=2)).isoformat(),
    }
