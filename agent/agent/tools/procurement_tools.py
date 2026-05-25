from __future__ import annotations

from typing import Annotated

import httpx
import opik
from langchain_core.tools import tool, ToolException

from agent.config import BACKEND_URL


class _OrderItem:
    def __init__(self, ingredient_id: str, quantity_kg: float, unit_price: float):
        self.ingredient_id = ingredient_id
        self.quantity_kg = quantity_kg
        self.unit_price = unit_price


def _post_draft(supplier_id: str, items: list[dict], delivery_date: str) -> dict:
    for item in items:
        if "unit_price" not in item:
            item["unit_price"] = 1.0

    resp = httpx.post(
        f"{BACKEND_URL}/api/orders/draft",
        json={"supplier_id": supplier_id, "items": items, "delivery_date": delivery_date},
        timeout=10,
    )
    if resp.status_code != 200:
        raise ToolException(f"POST /api/orders/draft returned {resp.status_code}: {resp.text}")
    return resp.json()


@tool
@opik.track(name="preview_landed_cost")
def preview_landed_cost(
    supplier_id: Annotated[str, "Supplier ID"],
    items: Annotated[list[dict], "List of {ingredient_id, quantity_kg, unit_price}"],
    delivery_date: Annotated[str, "ISO date YYYY-MM-DD for cost projection"],
) -> dict:
    """Preview the landed cost breakdown for a potential order without committing it.

    Creates a draft action card (stays pending, never auto-confirmed).
    Returns landed_cost_breakdown only — the action_card_id is intentionally discarded.
    """
    data = _post_draft(supplier_id, items, delivery_date)
    return data["landed_cost_breakdown"]


@tool
@opik.track(name="build_order_draft")
def build_order_draft(
    supplier_id: Annotated[str, "Supplier ID"],
    items: Annotated[list[dict], "List of {ingredient_id, quantity_kg, unit_price}"],
    delivery_date: Annotated[str, "ISO date YYYY-MM-DD"],
) -> dict:
    """Draft a supplier order for human review. Returns action_card_id and landed_cost_breakdown.

    The order is NOT placed until the user confirms the action card.
    """
    data = _post_draft(supplier_id, items, delivery_date)
    return {
        "action_card_id": data["action_card_id"],
        "landed_cost_breakdown": data["landed_cost_breakdown"],
    }
