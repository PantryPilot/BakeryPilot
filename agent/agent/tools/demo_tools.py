from __future__ import annotations

from typing import Annotated

import httpx
import opik
from langchain_core.tools import tool, ToolException

from agent.config import BACKEND_URL


@tool
@opik.track(name="generate_demo_operations")
def generate_demo_operations(
    retailer_order_count: Annotated[int, "Number of open retailer POs to create (0-20)"] = 5,
    supplier_order_count: Annotated[int, "Number of confirmed supplier POs to create (0-15)"] = 4,
    schedule_count: Annotated[int, "Number of production schedules to create (0-20)"] = 6,
    facility_id: Annotated[
        str | None,
        "Optional facility filter (e.g. plant-toronto). Omit for all plants.",
    ] = None,
) -> dict:
    """Generate random demo retailer POs, supplier POs, and production schedules.

    Grounds choices in current master data and ingredient lot levels (low-stock
    ingredients are favoured for supplier PO lines). Writes directly to the
    database — no human approval step.

    Use when the user asks to populate demo/mock data, seed the schedule page,
    or generate sample orders so they can explore the UI.
    """
    payload: dict = {
        "retailer_order_count": retailer_order_count,
        "supplier_order_count": supplier_order_count,
        "schedule_count": schedule_count,
    }
    if facility_id:
        payload["facility_id"] = facility_id

    resp = httpx.post(
        f"{BACKEND_URL}/api/demo/generate",
        json=payload,
        timeout=30,
    )
    if resp.status_code != 200:
        raise ToolException(
            f"POST /api/demo/generate returned {resp.status_code}: {resp.text}"
        )
    return resp.json()
