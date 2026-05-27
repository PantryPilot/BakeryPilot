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
    """Return the optimized changeover diff for human review before any schedule change is confirmed."""
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


@tool
@opik.track(name="draft_schedule_change")
def draft_schedule_change(
    facility_id: Annotated[str, "Facility ID, e.g. plant-toronto"],
    substitute_sku_id: Annotated[str, "Substitute SKU to switch the line to"],
    requested_by_sku_id: Annotated[str, "Current SKU being replaced"],
    requested_units: Annotated[int, "Units of the substitute SKU to produce"],
    rationale: Annotated[str, "One-line explanation of why this change is being proposed"],
) -> dict:
    """Draft a schedule_change action card for human review.

    The line swap is NOT applied until the operator confirms the card. On
    confirmation the backend cancels the currently-active order for
    requested_by_sku_id at facility_id and creates a planned order for
    substitute_sku_id. After success, surface the returned action_card_id
    inside an ```action_card JSON fenced block.
    """
    resp = httpx.post(
        f"{BACKEND_URL}/api/schedules/draft_change",
        json={
            "facility_id": facility_id,
            "substitute_sku_id": substitute_sku_id,
            "requested_by_sku_id": requested_by_sku_id,
            "requested_units": requested_units,
            "rationale": rationale,
        },
        timeout=15,
    )
    if resp.status_code != 200:
        raise ToolException(
            f"POST /api/schedules/draft_change returned {resp.status_code}: {resp.text}"
        )
    return resp.json()
