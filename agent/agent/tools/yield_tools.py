from __future__ import annotations

from typing import Annotated

import httpx
import opik
from langchain_core.tools import tool, ToolException

from agent.config import BACKEND_URL


@tool
@opik.track(name="get_yield_variance")
def get_yield_variance(
    run_id: Annotated[str | None, "Production run ID (optional; omit for all recent runs)"] = None,
) -> dict | list:
    """Return yield variance data showing actual vs planned ingredient consumption."""
    if run_id:
        resp = httpx.get(f"{BACKEND_URL}/api/yield/{run_id}", timeout=10)
        if resp.status_code != 200:
            raise ToolException(f"GET /api/yield/{run_id} returned {resp.status_code}: {resp.text}")
    else:
        resp = httpx.get(f"{BACKEND_URL}/api/yield", timeout=10)
        if resp.status_code != 200:
            raise ToolException(f"GET /api/yield returned {resp.status_code}: {resp.text}")
    return resp.json()


@tool
@opik.track(name="diagnose_anomaly")
def diagnose_anomaly(
    run_id: Annotated[str, "Production run ID to diagnose"],
) -> dict:
    """Cross-reference equipment calibration, operator shift, and recipe history to diagnose a yield anomaly."""
    resp = httpx.get(f"{BACKEND_URL}/api/yield/{run_id}/diagnose", timeout=15)
    if resp.status_code != 200:
        raise ToolException(
            f"GET /api/yield/{run_id}/diagnose returned {resp.status_code}: {resp.text}"
        )
    return resp.json()


@tool
@opik.track(name="create_cmms_work_order")
def create_cmms_work_order(
    equipment_id: Annotated[str, "Equipment ID requiring maintenance"],
    suggested_window: Annotated[str, "ISO datetime for suggested maintenance window"],
    reason: Annotated[str, "One-sentence reason for the work order"],
) -> dict:
    """Create a CMMS maintenance work order for human review. Returns work_order_id and scheduled_at."""
    resp = httpx.post(
        f"{BACKEND_URL}/api/cmms/work_orders",
        json={
            "equipment_id": equipment_id,
            "suggested_window": suggested_window,
            "reason": reason,
        },
        timeout=10,
    )
    if resp.status_code != 200:
        raise ToolException(
            f"POST /api/cmms/work_orders returned {resp.status_code}: {resp.text}"
        )
    return resp.json()
