"""Yield router: variance per line/shift, anomaly diagnosis, CMMS work order."""

from datetime import timedelta

from fastapi import APIRouter, HTTPException

from app import mock_data
from app.models.yield_intel import (
    AnomalyDiagnosis,
    CandidateCause,
    WorkOrderRequest,
    WorkOrderResponse,
    YieldRun,
)

router = APIRouter(prefix="/api/yield", tags=["yield"])


@router.get("", response_model=list[YieldRun])
async def list_yield_runs() -> list[YieldRun]:
    return [YieldRun(**r) for r in mock_data.YIELD_RUNS]


@router.get("/{run_id}", response_model=YieldRun)
async def get_yield_run(run_id: str) -> YieldRun:
    row = next((r for r in mock_data.YIELD_RUNS if r["run_id"] == run_id), None)
    if not row:
        raise HTTPException(404, f"yield run {run_id} not found")
    return YieldRun(**row)


@router.get("/{run_id}/diagnose", response_model=AnomalyDiagnosis)
async def diagnose_anomaly(run_id: str) -> AnomalyDiagnosis:
    if not any(r["run_id"] == run_id for r in mock_data.YIELD_RUNS):
        raise HTTPException(404, f"yield run {run_id} not found")
    return AnomalyDiagnosis(
        run_id=run_id,
        candidate_causes=[
            CandidateCause(
                cause="Dough divider calibration drift",
                confidence=0.78,
                supporting_data=[
                    "Equipment: line_2/divider_a -- last calibrated 47 days ago, spec is 30",
                    "Same operator shift had similar variance on prior 2 runs",
                ],
            ),
            CandidateCause(
                cause="Recipe ratio drift",
                confidence=0.22,
                supporting_data=[
                    "Flour ratio: 1.09x theoretical for last 3 runs of this SKU",
                ],
            ),
        ],
        recommendation=(
            "Schedule a corrective maintenance work order for line_2/divider_a "
            "in the next downtime window."
        ),
    )


cmms_router = APIRouter(prefix="/api/cmms", tags=["cmms"])


@cmms_router.post("/work_orders", response_model=WorkOrderResponse)
async def create_work_order(req: WorkOrderRequest) -> WorkOrderResponse:
    """Mock CMMS: returns a work order id + scheduled window."""
    return WorkOrderResponse(
        work_order_id=mock_data.new_id("wo"),
        scheduled_at=(mock_data.NOW + timedelta(hours=18)).isoformat(),
    )


router.include_router(cmms_router)
