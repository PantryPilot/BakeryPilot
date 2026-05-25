"""Chat router: SSE-streamed responses from the LangGraph orchestrator (mock).

For now, returns a hardcoded streamed response that includes substitution
candidates and an action card for a supplier order draft. Replace with the
real LangGraph stream when the agent is wired up.
"""

import asyncio
import json
from datetime import timedelta
from typing import AsyncGenerator

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app import mock_data
from app.models.chat import ChatRequest

router = APIRouter(prefix="/api/chat", tags=["chat"])


_RESPONSE_CHUNKS = [
    "Blueberries at Plant 1: ",
    "0.8 kg on hand against 12 kg scheduled for the 14:00 muffin run. ",
    "Two ready substitutions: lemon poppy seed (full Line 1 capacity, in-stock) and chocolate chip (full Line 2 capacity, in-stock). ",
    "I've queued a 200 kg reorder from Maple Grain Co. for blueberries; landed cost $1,012 with $12 holding cost on the overage. Confirm to lock both decisions.",
]


@router.post("")
async def chat(req: ChatRequest):
    async def stream() -> AsyncGenerator[dict, None]:
        for chunk in _RESPONSE_CHUNKS:
            yield {"event": "message", "data": json.dumps({"content": chunk})}
            await asyncio.sleep(0.2)

        yield {
            "event": "substitutions",
            "data": json.dumps({
                "candidates": [
                    {"sku_id": "sku_lemon_poppy", "sku_name": "Lemon Poppy Seed Muffin",
                     "achievable_quantity": 5000},
                    {"sku_id": "sku_chocolate_chip", "sku_name": "Chocolate Chip Muffin",
                     "achievable_quantity": 4500},
                ],
            }),
        }

        items = [{"ingredient_id": "ing_blueberries", "quantity_kg": 200.0, "unit_price": 5.0}]
        breakdown = mock_data.compute_landed_cost(items, "sup_a")
        card = mock_data.make_action_card(
            kind="supplier_order",
            payload={
                "supplier_id": "sup_a",
                "items": items,
                "delivery_date": (mock_data.TODAY + timedelta(days=2)).isoformat(),
                "landed_cost_breakdown": breakdown,
            },
        )
        yield {"event": "action_card", "data": json.dumps({"action_card_id": card["card_id"]})}

        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(stream())
