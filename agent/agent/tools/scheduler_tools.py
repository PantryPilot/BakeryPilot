from __future__ import annotations

from typing import Annotated

import httpx
import opik
from langchain_core.tools import tool, ToolException

from agent.config import BACKEND_URL


@tool
@opik.track(name="suggest_production_schedule")
def suggest_production_schedule(
    facility_id: Annotated[str | None, "Facility ID to filter schedules (optional)"] = None,
) -> list[dict]:
    """Return current production schedules, optionally filtered by facility."""
    params: dict = {}
    if facility_id:
        params["facility_id"] = facility_id
    resp = httpx.get(f"{BACKEND_URL}/api/schedules", params=params, timeout=15)
    if resp.status_code != 200:
        raise ToolException(f"GET /api/schedules returned {resp.status_code}: {resp.text}")
    return resp.json()


@tool
@opik.track(name="run_changeover_optimizer")
def run_changeover_optimizer(
    schedule_id: Annotated[str, "Schedule ID to compute allergen changeover diff for"],
) -> dict:
    """Return the optimized changeover diff between the current approved schedule and a suggested one."""
    resp = httpx.get(f"{BACKEND_URL}/api/schedules/{schedule_id}/diff", timeout=15)
    if resp.status_code != 200:
        raise ToolException(
            f"GET /api/schedules/{schedule_id}/diff returned {resp.status_code}: {resp.text}"
        )
    return resp.json()


@tool
@opik.track(name="what_if_simulation")
def what_if_simulation(
    schedule_id: Annotated[str, "Schedule ID to simulate against"],
    changes: Annotated[list[dict], "List of {run_id, field, new_value} changes to simulate"],
) -> dict:
    """Simulate proposed schedule changes and return the resulting diff without committing."""
    resp = httpx.post(
        f"{BACKEND_URL}/api/schedules/{schedule_id}/what_if",
        json={"changes": changes},
        timeout=15,
    )
    if resp.status_code != 200:
        raise ToolException(
            f"POST /api/schedules/{schedule_id}/what_if returned {resp.status_code}: {resp.text}"
        )
    return resp.json()
