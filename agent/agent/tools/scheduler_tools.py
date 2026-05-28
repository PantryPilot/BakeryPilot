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
@opik.track(name="draft_new_production_order")
def draft_new_production_order(
    facility_id: Annotated[str, "Facility id, e.g. plant-toronto / plant-mississauga / plant-hamilton / plant-montreal"],
    line_id: Annotated[str, "Target line id, e.g. line-hamilton-1. Must belong to facility_id and be idle."],
    sku_id: Annotated[str, "SKU id to produce, e.g. sku-ace-sourdough-bistro"],
    quantity_units: Annotated[int, "Number of units to produce"],
    planned_start_at: Annotated[
        str | None,
        "Optional ISO 8601 datetime for the planned start (e.g. 2026-05-29T08:00:00Z). Null means schedule now.",
    ] = None,
    notes: Annotated[str | None, "Optional one-line context the operator will see"] = None,
) -> dict:
    """Draft an action card to add a NEW production order on a specific line.

    The order is NOT created until the operator confirms the card. The line
    must currently be idle (or in maintenance) — if it isn't, the draft
    endpoint returns 409 and you should call suggest_production_schedule
    first to find an open line.

    After success, include the returned action_card_id inside an
    ```action_card JSON fenced block so the chat UI renders the approval.
    """
    body: dict = {
        "facility_id": facility_id,
        "line_id": line_id,
        "sku_id": sku_id,
        "quantity_units": int(quantity_units),
    }
    if planned_start_at:
        body["planned_start_at"] = planned_start_at
    if notes:
        body["notes"] = notes
    resp = httpx.post(
        f"{BACKEND_URL}/api/production/orders/draft_new",
        json=body,
        timeout=15,
    )
    if resp.status_code != 200:
        raise ToolException(
            f"POST /api/production/orders/draft_new returned {resp.status_code}: {resp.text}"
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
    schedule_id: Annotated[str | None, "Schedule row being replaced (from suggest_production_schedule or diff)"] = None,
    line_id: Annotated[str | None, "Production line ID, e.g. line-toronto-1"] = None,
    start_at: Annotated[str | None, "ISO start time for the new run (optional)"] = None,
    end_at: Annotated[str | None, "ISO end time for the new run (optional)"] = None,
) -> dict:
    """Draft a schedule_change action card for human review.

    The line swap is NOT applied until the operator confirms the card. On
    confirmation the backend supersedes the matching production_schedules row
    (status complete) and inserts an approved replacement, and updates
    production_orders on the line. After success, surface the returned
    action_card_id inside an ```action_card JSON fenced block.
    """
    body: dict = {
        "facility_id": facility_id,
        "substitute_sku_id": substitute_sku_id,
        "requested_by_sku_id": requested_by_sku_id,
        "requested_units": requested_units,
        "rationale": rationale,
    }
    if schedule_id:
        body["schedule_id"] = schedule_id
    if line_id:
        body["line_id"] = line_id
    if start_at:
        body["start_at"] = start_at
    if end_at:
        body["end_at"] = end_at
    resp = httpx.post(
        f"{BACKEND_URL}/api/schedules/draft_change",
        json=body,
        timeout=15,
    )
    if resp.status_code != 200:
        raise ToolException(
            f"POST /api/schedules/draft_change returned {resp.status_code}: {resp.text}"
        )
    return resp.json()
