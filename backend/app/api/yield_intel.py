import re
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ActionCard as ActionCardORM, ProductionRun
from app.db.session import get_db
from app.models.yield_intel import (
    AnomalyDiagnosis,
    CandidateCause,
    WorkOrderRequest,
    WorkOrderResponse,
    YieldRun,
    YieldTelemetryPoint,
    YieldVarianceItem,
)
from app.services.yield_intel import compute_variance

router = APIRouter(prefix="/api/yield", tags=["yield"])

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_INVALID_RUN_TOKENS = {"", "null", "none", "undefined", "nan"}


async def _resolve_run(run_id: str, db: AsyncSession) -> ProductionRun | None:
    """Resolve a run_id that may be either a UUID or a line-name alias.

    Guards against bad inputs (e.g. literal 'null' coming in from the agent /
    UI) so a malformed UUID never reaches asyncpg's UUID encoder — that
    raises mid-transaction and aborts every subsequent query in the same
    session with InFailedSQLTransactionError.
    """
    if run_id is None:
        return None
    cleaned = run_id.strip()
    if cleaned.lower() in _INVALID_RUN_TOKENS:
        return None
    if _UUID_RE.match(cleaned):
        run = await db.get(ProductionRun, cleaned)
        if run:
            return run
    # Fallback: treat the value as a line id alias (e.g. "line 2" → "line-2").
    normalised = cleaned.lower().replace(" ", "-")
    if normalised and not normalised.startswith("line-"):
        normalised = normalised.replace("line", "line-", 1)
    if not normalised:
        return None
    q = (
        select(ProductionRun)
        .where(ProductionRun.line_id == normalised)
        .order_by(ProductionRun.started_at.desc())
    )
    return (await db.execute(q)).scalars().first()


def _run_to_model(run: ProductionRun) -> YieldRun:
    consumption: dict = run.actual_ingredient_consumption or {}
    items = [
        YieldVarianceItem(
            ingredient_id=k,
            theoretical_kg=float(v.get("theoretical_kg", 0)),
            actual_kg=float(v.get("actual_kg", 0)),
            variance_pct=float(v.get("variance_pct", 0)),
            dollar_leak=float(v.get("dollar_leak", 0)),
        )
        for k, v in consumption.items()
        if isinstance(v, dict)
    ]
    total_leak = sum(i.dollar_leak for i in items)
    return YieldRun(
        run_id=str(run.run_id),
        line_id=run.line_id,
        facility_id=run.facility_id,
        sku_id=run.sku_id,
        operator_id=run.operator_id,
        started_at=run.started_at.isoformat(),
        ended_at=run.ended_at.isoformat() if run.ended_at else None,
        actual_vs_theoretical=items,
        total_dollar_leak=round(total_leak, 2),
        status=run.status,
        equipment_notes=run.equipment_notes,
    )


@router.get("", response_model=list[YieldRun])
async def list_yield_runs(db: AsyncSession = Depends(get_db)) -> list[YieldRun]:
    runs = (
        await db.execute(
            select(ProductionRun).order_by(ProductionRun.started_at.desc()).limit(50)
        )
    ).scalars().all()
    return [_run_to_model(r) for r in runs]


@router.get("/telemetry", response_model=list[YieldTelemetryPoint])
async def yield_telemetry(
    line_id: str | None = Query(None),
    facility_id: str | None = Query(None),
    days: int = Query(14, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
) -> list[YieldTelemetryPoint]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    q = select(ProductionRun).where(
        ProductionRun.started_at >= since,
        ProductionRun.actual_kg.isnot(None),
        ProductionRun.planned_kg.isnot(None),
    )
    if line_id:
        q = q.where(ProductionRun.line_id == line_id)
    if facility_id:
        q = q.where(ProductionRun.facility_id == facility_id)
    q = q.order_by(ProductionRun.started_at)

    runs = (await db.execute(q)).scalars().all()
    points = []
    for r in runs:
        actual = float(r.actual_kg) if r.actual_kg else 0
        planned = float(r.planned_kg) if r.planned_kg else 1
        actual_pct = round((actual / planned) * 100, 1) if planned > 0 else 0
        points.append(
            YieldTelemetryPoint(
                date=r.started_at.date().isoformat(),
                line_id=r.line_id,
                facility_id=r.facility_id,
                actual_pct=actual_pct,
                target_pct=100.0,
            )
        )
    return points


@router.get("/{run_id}", response_model=YieldRun)
async def get_yield_run(run_id: str, db: AsyncSession = Depends(get_db)) -> YieldRun:
    run = await _resolve_run(run_id, db)
    if not run:
        raise HTTPException(404, f"yield run {run_id} not found")
    return _run_to_model(run)


@router.get("/{run_id}/diagnose", response_model=AnomalyDiagnosis)
async def diagnose_anomaly(run_id: str, db: AsyncSession = Depends(get_db)) -> AnomalyDiagnosis:
    run = await _resolve_run(run_id, db)
    if not run:
        raise HTTPException(404, f"yield run {run_id} not found")

    consumption: dict = run.actual_ingredient_consumption or {}
    worst_ingredient = ""
    worst_pct = 0.0
    for k, v in consumption.items():
        if isinstance(v, dict) and abs(float(v.get("variance_pct", 0))) > abs(worst_pct):
            worst_pct = float(v.get("variance_pct", 0))
            worst_ingredient = k

    if not worst_ingredient:
        return AnomalyDiagnosis(
            run_id=str(run.run_id),
            candidate_causes=[
                CandidateCause(
                    cause="Insufficient variance data",
                    confidence=0.5,
                    supporting_data=["No ingredient consumption data recorded for this run"],
                )
            ],
            recommendation="Review run logs manually and check equipment calibration records.",
        )

    causes = [
        CandidateCause(
            cause=f"Equipment calibration drift affecting {worst_ingredient}",
            confidence=min(0.95, abs(worst_pct) / 30),
            supporting_data=[
                f"{worst_ingredient}: {worst_pct:+.1f}% variance vs theoretical",
                run.equipment_notes or "No equipment notes recorded",
                f"Run on {run.line_id} at {run.facility_id}",
            ],
        )
    ]
    if abs(worst_pct) < 5:
        recommendation = "No action required — variance within normal operating range."
    elif abs(worst_pct) < 10:
        recommendation = f"Schedule preventive check on {run.line_id} during next downtime window."
    else:
        recommendation = f"Expedite maintenance on {run.line_id}; {abs(worst_pct):.0f}% variance exceeds alert threshold."

    return AnomalyDiagnosis(
        run_id=str(run.run_id),
        candidate_causes=causes,
        recommendation=recommendation,
    )


cmms_router = APIRouter(prefix="/api/cmms", tags=["cmms"])


@cmms_router.post("/work_orders", response_model=WorkOrderResponse)
async def create_work_order(
    req: WorkOrderRequest,
    db: AsyncSession = Depends(get_db),
) -> WorkOrderResponse:
    card = ActionCardORM(
        kind="work_order",
        payload={
            "equipment_id": req.equipment_id,
            "suggested_window": req.suggested_window,
            "reason": req.reason,
            "title": f"Work order — {req.equipment_id}",
            "agent": "YieldAgent",
        },
    )
    db.add(card)
    await db.commit()
    return WorkOrderResponse(
        work_order_id=f"wo-{str(card.card_id)[:8]}",
        scheduled_at=(datetime.now(timezone.utc) + timedelta(hours=18)).isoformat(),
    )


router.include_router(cmms_router)
