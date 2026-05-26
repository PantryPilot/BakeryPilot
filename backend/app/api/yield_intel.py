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
    YieldTelemetryPoint,
)

router = APIRouter(prefix="/api/yield", tags=["yield"])


@router.get("", response_model=list[YieldRun])
async def list_yield_runs() -> list[YieldRun]:
    return [YieldRun(**r) for r in mock_data.YIELD_RUNS]


@router.get("/telemetry", response_model=list[YieldTelemetryPoint])
async def yield_telemetry(
    line_id: str | None = None,
    facility_id: str | None = None,
    days: int = 14,
) -> list[YieldTelemetryPoint]:
    rows = mock_data.YIELD_TELEMETRY
    if line_id:
        rows = [r for r in rows if r["line_id"] == line_id]
    if facility_id:
        rows = [r for r in rows if r["facility_id"] == facility_id]
    return [YieldTelemetryPoint(**r) for r in rows[:days * 4]]


@router.get("/{run_id}", response_model=YieldRun)
async def get_yield_run(run_id: str) -> YieldRun:
    row = next((r for r in mock_data.YIELD_RUNS if r["run_id"] == run_id), None)
    if not row:
        raise HTTPException(404, f"yield run {run_id} not found")
    return YieldRun(**row)


_DIAGNOSES: dict[str, dict] = {
    "yrun_line2_001": {
        "candidate_causes": [
            CandidateCause(
                cause="Dough divider calibration drift",
                confidence=0.78,
                supporting_data=[
                    "divider_a last calibrated 47 days ago — spec is 30 days",
                    "Same operator (op_martinez) reported similar variance on yrun_line2_002 yesterday",
                    "Flour over-dispense pattern consistent with worn portioning gate",
                ],
            ),
            CandidateCause(
                cause="Recipe ratio drift",
                confidence=0.22,
                supporting_data=[
                    "Flour actual/theoretical ratio 1.09x across last 3 blueberry muffin runs",
                ],
            ),
        ],
        "recommendation": "Schedule corrective maintenance for line_2/divider_a within next downtime window.",
    },
    "yrun_line2_002": {
        "candidate_causes": [
            CandidateCause(
                cause="Dough divider calibration drift (recurring)",
                confidence=0.85,
                supporting_data=[
                    "divider_a drift confirmed across two consecutive shifts",
                    "7.3% flour variance — below yesterday's 9% but same root cause pattern",
                ],
            ),
        ],
        "recommendation": "Expedite divider_a calibration — two consecutive affected shifts.",
    },
    "yrun_line3_001": {
        "candidate_causes": [
            CandidateCause(
                cause="Sesame hopper sensor mis-dispense",
                confidence=0.91,
                supporting_data=[
                    "2 mis-dispense events logged by hopper sensor during this run",
                    "Hopper last cleaned 12 days ago — spec is 7 days",
                    "23.3% sesame variance — highest of any ingredient across all recent runs",
                ],
            ),
        ],
        "recommendation": "Raise CMMS work order for line_3/sesame_hopper cleaning and sensor recalibration.",
    },
    "yrun_line1_001": {
        "candidate_causes": [
            CandidateCause(
                cause="Minor butter weighing variance — within tolerance",
                confidence=0.95,
                supporting_data=[
                    "2.1% butter variance — below 5% alert threshold",
                    "No equipment anomalies recorded for this shift",
                ],
            ),
        ],
        "recommendation": "No action required — variance within normal operating range.",
    },
}

_DEFAULT_DIAGNOSIS = {
    "candidate_causes": [
        CandidateCause(
            cause="Insufficient data for root cause analysis",
            confidence=0.5,
            supporting_data=["No equipment notes or historical pattern available for this run"],
        ),
    ],
    "recommendation": "Review run logs manually and check equipment calibration records.",
}


@router.get("/{run_id}/diagnose", response_model=AnomalyDiagnosis)
async def diagnose_anomaly(run_id: str) -> AnomalyDiagnosis:
    if not any(r["run_id"] == run_id for r in mock_data.YIELD_RUNS):
        raise HTTPException(404, f"yield run {run_id} not found")
    d = _DIAGNOSES.get(run_id, _DEFAULT_DIAGNOSIS)
    return AnomalyDiagnosis(
        run_id=run_id,
        candidate_causes=d["candidate_causes"],
        recommendation=d["recommendation"],
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
