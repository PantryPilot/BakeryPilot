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
    """Return current **production line** schedules (manufacturing runs — NOT warehouse outbound).

    Use for allergen changeovers, line capacity, and bake-time optimisation.
    For warehouse → retailer shipments use suggest_outbound_shipments instead.
    """
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
    retailer_order_id: Annotated[str | None, "Open retailer PO this run fulfills"] = None,
) -> dict:
    """Draft a schedule_change action card for human review.

    The change is NOT applied until the operator confirms the card. On
    confirmation the backend updates the matching production_schedules row
    in place (same schedule_id) when schedule_id is provided, and updates
    production_orders on the line for SKU swaps. After success, surface the
    returned action_card_id inside an ```action_card JSON fenced block.
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
    if retailer_order_id:
        body["retailer_order_id"] = retailer_order_id
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


@tool
@opik.track(name="suggest_outbound_shipments")
def suggest_outbound_shipments(
    facility_id: Annotated[str | None, "Plant warehouse facility ID, e.g. plant-toronto (optional)"] = None,
) -> list[dict]:
    """Return scheduled warehouse → retailer outbound shipments (finished goods leaving the plant).

    Use for dock windows, FEFO stock allocation, and retailer PO fulfillment from warehouse inventory.
    NOT for production line scheduling — use suggest_production_schedule for that.
    """
    resp = httpx.get(f"{BACKEND_URL}/api/outbound_shipments", timeout=15)
    if resp.status_code != 200:
        raise ToolException(f"GET /api/outbound_shipments returned {resp.status_code}: {resp.text}")
    rows = resp.json()
    if facility_id:
        rows = [r for r in rows if r.get("facility_id") == facility_id]
    return rows


@tool
@opik.track(name="list_warehouse_stock")
def list_warehouse_stock(
    facility_id: Annotated[str, "Plant warehouse facility ID, e.g. plant-toronto"],
) -> list[dict]:
    """List finished goods SKUs currently in warehouse at a plant (uncommitted pallets, FEFO-eligible).

    Required before proposing outbound shipments — quantity must not exceed available_units.
    """
    resp = httpx.get(
        f"{BACKEND_URL}/api/outbound_shipments/warehouse_stock",
        params={"facility_id": facility_id},
        timeout=15,
    )
    if resp.status_code != 200:
        raise ToolException(
            f"GET /api/outbound_shipments/warehouse_stock returned {resp.status_code}: {resp.text}"
        )
    return resp.json()


@tool
@opik.track(name="list_open_retailer_orders")
def list_open_retailer_orders(
    sku_id: Annotated[str | None, "Filter to POs for this SKU (optional)"] = None,
) -> list[dict]:
    """List open retailer POs that outbound shipments can fulfill."""
    resp = httpx.get(
        f"{BACKEND_URL}/api/retailer_orders",
        params={"status": "open"},
        timeout=15,
    )
    if resp.status_code != 200:
        raise ToolException(f"GET /api/retailer_orders returned {resp.status_code}: {resp.text}")
    rows = resp.json()
    if sku_id:
        rows = [r for r in rows if r.get("sku_id") == sku_id]
    return rows


@tool
@opik.track(name="draft_outbound_shipment")
def draft_outbound_shipment(
    facility_id: Annotated[str, "Warehouse plant ID, e.g. plant-toronto"],
    retailer_order_id: Annotated[str, "Open retailer PO UUID to fulfill"],
    sku_id: Annotated[str, "SKU being shipped — must match PO and be in stock at facility"],
    quantity_units: Annotated[int, "Units to ship — ≤ PO qty and ≤ warehouse available_units"],
    start_at: Annotated[str, "ISO ship window start"],
    end_at: Annotated[str, "ISO ship window end"],
    rationale: Annotated[str, "One-line explanation (FEFO, delivery date, stock coverage)"],
) -> dict:
    """Draft an outbound_shipment action card for human review.

    Reserves finished-goods pallets (FEFO) only after the operator confirms the card.
    Surface the returned action_card_id in a ```action_card JSON fenced block.
    """
    resp = httpx.post(
        f"{BACKEND_URL}/api/outbound_shipments/draft",
        json={
            "facility_id": facility_id,
            "retailer_order_id": retailer_order_id,
            "sku_id": sku_id,
            "quantity_units": quantity_units,
            "start_at": start_at,
            "end_at": end_at,
            "rationale": rationale,
        },
        timeout=15,
    )
    if resp.status_code != 200:
        raise ToolException(
            f"POST /api/outbound_shipments/draft returned {resp.status_code}: {resp.text}"
        )
    return resp.json()
