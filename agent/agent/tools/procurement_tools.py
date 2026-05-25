from __future__ import annotations

from typing import Annotated

import httpx
import opik
from langchain_core.tools import tool, ToolException
from pydantic import BaseModel

from agent.config import BACKEND_URL


class OrderItem(BaseModel):
    ingredient_id: str
    quantity_kg: float


@opik.track(name="compute_landed_cost")
@tool
def compute_landed_cost(
    supplier_id: Annotated[str, "Supplier UUID"],
    items: Annotated[list[dict], "List of {ingredient_id, quantity_kg}"],
) -> dict:
    """Compute total landed cost for an order: unit price + MOQ overage + holding cost."""
    resp = httpx.post(
        f"{BACKEND_URL}/api/orders/landed_cost",
        json={"supplier_id": supplier_id, "items": items},
        timeout=10,
    )
    if resp.status_code != 200:
        raise ToolException(f"POST /api/orders/landed_cost returned {resp.status_code}: {resp.text}")
    return resp.json()


@opik.track(name="build_order_draft")
@tool
def build_order_draft(
    supplier_id: Annotated[str, "Supplier UUID"],
    items: Annotated[list[dict], "List of {ingredient_id, quantity_kg}"],
    delivery_date: Annotated[str, "ISO date string YYYY-MM-DD"],
) -> dict:
    """Draft a supplier order and create an action card pending human confirmation. Returns action_card_id and landed_cost_breakdown."""
    resp = httpx.post(
        f"{BACKEND_URL}/api/orders/draft",
        json={"supplier_id": supplier_id, "items": items, "delivery_date": delivery_date},
        timeout=10,
    )
    if resp.status_code != 200:
        raise ToolException(f"POST /api/orders/draft returned {resp.status_code}: {resp.text}")
    data = resp.json()
    return {
        "action_card_id": data["action_card_id"],
        "landed_cost_breakdown": data["landed_cost_breakdown"],
    }
