import asyncio
import json
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.db.models import DisruptionSignal, IngredientLot, ProductionRun
from app.db.session import get_db

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


async def _build_alerts(db: AsyncSession) -> list[dict]:
    alerts: list[dict] = []
    today = date.today()
    cutoff = today + timedelta(days=3)

    expiring = (
        await db.execute(
            select(IngredientLot)
            .where(IngredientLot.expiry_date <= cutoff, IngredientLot.quantity_kg > 0)
            .limit(20)
        )
    ).scalars().all()
    for lot in expiring:
        days_left = (lot.expiry_date - today).days
        severity = "critical" if days_left <= 1 else "warning"
        alerts.append({
            "kind": "expiring_lot",
            "severity": severity,
            "title": f"{lot.ingredient_id} expiring in {max(days_left, 0)}d",
            "body": f"Lot {str(lot.lot_id)[:8]} at {lot.facility_id} — {float(lot.quantity_kg)} kg",
            "action": f"What should I do with lot {lot.lot_id}?",
            "ref_id": str(lot.lot_id),
        })

    risky = (
        await db.execute(
            select(DisruptionSignal)
            .where(DisruptionSignal.severity >= 0.6)
            .order_by(DisruptionSignal.observed_at.desc())
            .limit(10)
        )
    ).scalars().all()
    for sig in risky:
        sev = "critical" if float(sig.severity) >= 0.8 else "warning"
        alerts.append({
            "kind": "supplier_risk",
            "severity": sev,
            "title": f"Supplier risk: {sig.supplier_id or 'unknown'}",
            "body": sig.message,
            "action": f"What is the risk level for supplier {sig.supplier_id}?",
            "ref_id": sig.supplier_id or str(sig.signal_id),
        })

    high_variance = (
        await db.execute(
            select(ProductionRun)
            .where(
                ProductionRun.actual_ingredient_consumption.isnot(None),
                ProductionRun.status != "cancelled",
            )
            .order_by(ProductionRun.started_at.desc())
            .limit(10)
        )
    ).scalars().all()
    for run in high_variance:
        consumption: dict = run.actual_ingredient_consumption or {}
        max_var = max(
            (abs(float(v.get("variance_pct", 0))) for v in consumption.values() if isinstance(v, dict)),
            default=0.0,
        )
        if max_var > 10.0:
            alerts.append({
                "kind": "yield_spike",
                "severity": "critical" if max_var > 20.0 else "warning",
                "title": f"Yield spike on {run.line_id}",
                "body": f"Run {str(run.run_id)[:8]}: up to {max_var:.1f}% variance vs plan",
                "action": f"Why is the yield variance high for run {run.run_id}?",
                "ref_id": str(run.run_id),
            })

    return alerts


@router.get("")
async def alert_stream(db: AsyncSession = Depends(get_db)):
    async def stream():
        alerts = await _build_alerts(db)
        for alert in alerts:
            yield {"event": "alert", "data": json.dumps(alert)}
            await asyncio.sleep(0.05)
        yield {"event": "snapshot_done", "data": "{}"}
        while True:
            await asyncio.sleep(30)
            yield {"event": "heartbeat", "data": "{}"}

    return EventSourceResponse(stream())


@router.get("/snapshot", response_model=list[dict])
async def alert_snapshot(db: AsyncSession = Depends(get_db)) -> list[dict]:
    return await _build_alerts(db)
