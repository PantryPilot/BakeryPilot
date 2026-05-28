from __future__ import annotations

import uuid
from typing import Annotated

import httpx
import opik
from langchain_core.tools import tool, ToolException

from agent.config import BACKEND_URL


def _schedule_id_for_api(schedule_id: str) -> str:
    """Map agent-facing schedule_id to a backend path param.

    Real rows use UUID primary keys from GET /api/schedules. LLMs sometimes
    invent human-readable slugs (e.g. schedule-toronto-2025-wk28); those resolve
    via the backend ``current`` alias instead of 404.
    """
    if schedule_id in ("current", "latest"):
        return schedule_id
    try:
        uuid.UUID(schedule_id)
        return schedule_id
    except ValueError:
        return "current"


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
    rows = resp.json()
    if not rows:
        raise ToolException(
            "No production schedules in the database. Seed demo data first "
            "(on the VM: cd backend && uv run scripts/seed_demo.py, or locally: make schema.seed)."
        )
    return rows


@tool
@opik.track(name="run_changeover_optimizer")
def run_changeover_optimizer(
    schedule_id: Annotated[
        str,
        "Schedule UUID from suggest_production_schedule, or the literal alias 'current' for the active suggested/approved run",
    ] = "current",
) -> dict:
    """Return the optimized changeover diff for human review before any schedule change is confirmed."""
    resolved_id = _schedule_id_for_api(schedule_id)
    resp = httpx.get(f"{BACKEND_URL}/api/schedules/{resolved_id}/diff", timeout=15)
    if resp.status_code != 200:
        raise ToolException(
            f"GET /api/schedules/{resolved_id}/diff returned {resp.status_code}: {resp.text}"
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
        f"{BACKEND_URL}/api/schedules/{_schedule_id_for_api(schedule_id)}/what_if",
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
