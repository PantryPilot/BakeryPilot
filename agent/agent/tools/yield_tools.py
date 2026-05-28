from __future__ import annotations

import re
from typing import Annotated

import httpx
import opik
from langchain_core.tools import tool, ToolException

from agent.config import BACKEND_URL

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _require_valid_run_id(run_id: str) -> None:
    """Reject obviously-bad run_ids so the LLM gets immediate feedback to call
    list_recent_yield_runs instead of hallucinating a UUID."""
    if not isinstance(run_id, str) or not run_id.strip():
        raise ToolException(
            "run_id is required and must be a real UUID returned by list_recent_yield_runs."
        )
    cleaned = run_id.strip().lower()
    if cleaned in {"null", "none", "undefined", "nan"}:
        raise ToolException(
            f"'{run_id}' is not a run_id. Call list_recent_yield_runs first and pick a real run_id from the response."
        )
    if not _UUID_RE.match(cleaned):
        raise ToolException(
            f"'{run_id}' is not a valid UUID. Call list_recent_yield_runs first and pass a run_id from the response (looks like 'e8534ba1-e49c-487c-bb15-96a86bfbd188')."
        )


@tool
@opik.track(name="list_recent_yield_runs")
def list_recent_yield_runs(
    facility_id: Annotated[
        str | None,
        "Optional facility id (e.g. plant-toronto) to filter by — leave null for all plants",
    ] = None,
    line_id: Annotated[
        str | None,
        "Optional line id (e.g. line-1) to filter by — leave null for all lines",
    ] = None,
    limit: Annotated[int, "Maximum number of runs to return"] = 20,
) -> list[dict]:
    """List recent production runs with yield variance summary.

    Returns each run's run_id, line_id, facility_id, sku_id, status, total_dollar_leak
    and the ingredient-level variance items. Use this FIRST to discover run_ids;
    then pass a specific run_id to get_yield_variance for the full detail or to
    diagnose_anomaly for root-cause analysis.
    """
    resp = httpx.get(f"{BACKEND_URL}/api/yield", timeout=10)
    if resp.status_code != 200:
        raise ToolException(f"GET /api/yield returned {resp.status_code}: {resp.text}")
    runs = resp.json()
    if facility_id:
        runs = [r for r in runs if r.get("facility_id") == facility_id]
    if line_id:
        runs = [r for r in runs if r.get("line_id") == line_id]
    return runs[: max(1, int(limit))]


@tool
@opik.track(name="get_yield_variance")
def get_yield_variance(
    run_id: Annotated[
        str,
        "Production run UUID. Get this from list_recent_yield_runs — do not invent it.",
    ],
) -> dict:
    """Return the full yield variance breakdown for a specific run.

    Fields: run_id, sku_id, line_id, facility_id, started_at, ended_at,
    actual_vs_theoretical (ingredient-level), total_dollar_leak, status,
    equipment_notes.
    """
    _require_valid_run_id(run_id)
    resp = httpx.get(f"{BACKEND_URL}/api/yield/{run_id}", timeout=10)
    if resp.status_code == 404:
        raise ToolException(f"yield run {run_id} not found; call list_recent_yield_runs first")
    if resp.status_code != 200:
        raise ToolException(f"GET /api/yield/{run_id} returned {resp.status_code}: {resp.text}")
    return resp.json()


@tool
@opik.track(name="get_product_recipe")
def get_product_recipe(
    sku_id: Annotated[str, "SKU id from a yield run (e.g. sku-stonefire-original-naan-2pk)"],
) -> dict:
    """Return the theoretical recipe (per-SKU ingredient targets) so the agent
    can interpret variance: 'actual vs recipe' rather than 'actual vs nothing'.

    Use this AFTER get_yield_variance when explaining why a run is high-variance.
    """
    resp = httpx.get(f"{BACKEND_URL}/api/production/products/{sku_id}", timeout=10)
    if resp.status_code == 404:
        raise ToolException(f"product {sku_id} not found")
    if resp.status_code != 200:
        raise ToolException(
            f"GET /api/production/products/{sku_id} returned {resp.status_code}: {resp.text}"
        )
    return resp.json()


@tool
@opik.track(name="diagnose_anomaly")
def diagnose_anomaly(
    run_id: Annotated[
        str, "Production run UUID. Get this from list_recent_yield_runs — do not invent it."
    ],
) -> dict:
    """Cross-reference equipment calibration, operator shift, and recipe history
    to diagnose a yield anomaly. Returns candidate_causes (with confidence and
    supporting_data) and a recommended action.
    """
    _require_valid_run_id(run_id)
    resp = httpx.get(f"{BACKEND_URL}/api/yield/{run_id}/diagnose", timeout=15)
    if resp.status_code == 404:
        raise ToolException(f"yield run {run_id} not found; call list_recent_yield_runs first")
    if resp.status_code != 200:
        raise ToolException(
            f"GET /api/yield/{run_id}/diagnose returned {resp.status_code}: {resp.text}"
        )
    return resp.json()


@tool
@opik.track(name="create_cmms_work_order")
def create_cmms_work_order(
    equipment_id: Annotated[str, "Equipment id (typically the line_id from the yield run)"],
    suggested_window: Annotated[str, "ISO datetime for the suggested maintenance window"],
    reason: Annotated[str, "One-sentence reason for the work order"],
) -> dict:
    """Create a CMMS maintenance work order action card for human review.
    Returns action_card_id (surface in a ```action_card JSON fenced block)."""
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
