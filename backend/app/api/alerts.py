"""Alerts router: proactive SSE push channel for high-priority operations signals.

Emits alerts derived from live mock data without polling:
  - expiring_lot   : ingredient lot expiring in <= 3 days
  - supplier_risk  : supplier disruption signal with severity >= 0.6
  - yield_spike    : production run with variance > 10%
"""

import asyncio
import json
from datetime import date
from typing import AsyncGenerator

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app import mock_data

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


def _build_alerts() -> list[dict]:
    alerts: list[dict] = []
    today = date.fromisoformat(mock_data.TODAY.isoformat())

    for lot in mock_data.INGREDIENT_LOTS:
        expiry = date.fromisoformat(lot["expiry_date"])
        days_left = (expiry - today).days
        if days_left <= 3:
            severity = "critical" if days_left <= 1 else "warning"
            alerts.append({
                "kind": "expiring_lot",
                "severity": severity,
                "title": f"{lot['ingredient_name']} expiring in {max(days_left, 0)}d",
                "body": f"Lot {lot['lot_id']} at {lot['facility_id']} — {lot['quantity_kg']} kg",
                "action": f"What should I do with lot {lot['lot_id']}?",
                "ref_id": lot["lot_id"],
            })

    for sig in mock_data.DISRUPTION_SIGNALS:
        if sig["severity"] >= 0.6:
            supplier_name = next(
                (s["name"] for s in mock_data.SUPPLIERS if s["supplier_id"] == sig["supplier_id"]),
                sig["supplier_id"],
            )
            alerts.append({
                "kind": "supplier_risk",
                "severity": "warning" if sig["severity"] < 0.8 else "critical",
                "title": f"Supplier risk: {supplier_name}",
                "body": sig.get("message", "Disruption signal detected"),
                "action": f"What is the risk level for supplier {supplier_name}?",
                "ref_id": sig["supplier_id"],
            })

    for run in mock_data.YIELD_RUNS:
        ingredients = run.get("actual_vs_theoretical", [])
        max_variance = max((abs(i.get("variance_pct", 0.0)) * 100 for i in ingredients), default=0.0)
        if max_variance > 10.0:
            alerts.append({
                "kind": "yield_spike",
                "severity": "critical" if max_variance > 20.0 else "warning",
                "title": f"Yield spike on {run.get('line_id', 'unknown')}",
                "body": f"Run {run['run_id']}: up to {max_variance:.1f}% variance vs plan",
                "action": f"Why is the yield variance high for run {run['run_id']}?",
                "ref_id": run["run_id"],
            })

    return alerts


@router.get("")
async def alert_stream():
    """SSE stream that emits current alerts once, then a heartbeat every 30 s."""

    async def stream() -> AsyncGenerator[dict, None]:
        alerts = _build_alerts()
        for alert in alerts:
            yield {"event": "alert", "data": json.dumps(alert)}
            await asyncio.sleep(0.05)

        yield {"event": "snapshot_done", "data": "{}"}

        while True:
            await asyncio.sleep(30)
            yield {"event": "heartbeat", "data": "{}"}

    return EventSourceResponse(stream())


@router.get("/snapshot", response_model=list[dict])
async def alert_snapshot() -> list[dict]:
    """REST fallback: returns the same alert list as the SSE stream."""
    return _build_alerts()
