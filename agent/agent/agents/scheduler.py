from __future__ import annotations

import json
import re

from langchain_core.messages import AIMessage, SystemMessage

from agent.llm import cached_react_agent
from agent.prompts.store import get_prompt_store
from agent.tools.notify_tools import identify_stakeholders, send_confirmation_email
from agent.tools.scheduler_tools import (
    draft_new_production_order,
    draft_outbound_shipment,
    draft_schedule_change,
    list_open_retailer_orders,
    list_warehouse_stock,
    run_changeover_optimizer,
    suggest_outbound_shipments,
    suggest_production_schedule,
    what_if_simulation,
)

_TOOLS = [
    suggest_production_schedule,
    suggest_outbound_shipments,
    list_warehouse_stock,
    list_open_retailer_orders,
    run_changeover_optimizer,
    what_if_simulation,
    draft_schedule_change,
    draft_new_production_order,
    draft_outbound_shipment,
    identify_stakeholders,
    send_confirmation_email,
]

_SYSTEM_SUFFIX = """
You are the SchedulerAgent. You manage TWO separate schedule domains — always determine which one the user means:

## 1. Production scheduling (manufacturing on lines)
- **When:** bake/produce on a line, allergen changeovers, line capacity, shift timing, SKU swaps on equipment, new runs on idle lines.
- **Tools:** suggest_production_schedule → run_changeover_optimizer → draft_schedule_change (for SWAPS) or draft_new_production_order (for ADD-NEW).
- **Never** use outbound tools for production questions.

## 2. Outbound scheduling (warehouse → retailer)
- **When:** ship finished goods from plant warehouse, dock windows, retailer PO fulfillment from stock, FEFO allocation.
- **Tools:** suggest_outbound_shipments → list_warehouse_stock → list_open_retailer_orders → draft_outbound_shipment.
- **Never** use run_changeover_optimizer or draft_schedule_change for outbound.

## Disambiguation (required)
If the user says "schedule", "optimise", or "plan" without specifying production vs outbound:
1. Ask ONE clarifying question: "Do you want to optimise **production runs on the line** or **outbound shipments from warehouse stock to retailers**?"
2. Or infer from keywords:
   - production / line / changeover / bake / allergen / new run → production
   - outbound / warehouse / ship / retailer delivery / dock / finished goods / pallet → outbound

## Production workflow — SWAP SKU on active line
For "optimise the schedule" / "swap X for Y on line Z":
1. suggest_production_schedule — read current schedules. Each schedule_id is a UUID string from the API.
2. run_changeover_optimizer — pass schedule_id "current" OR the exact UUID from step 1. Never invent human-readable IDs.
3. draft_schedule_change — MUST be called last with schedule_id (UUID or omit to match by facility/line/SKU), line_id,
   substitute_sku_id, requested_by_sku_id, requested_units, start_at/end_at from the proposed after run, and rationale.
   Creates a schedule_change action card (NOT applied until confirm).

## Production workflow — ADD-NEW run on idle line
For "start a new run of X on line Z" / "add 500 units of sourdough to line-hamilton-1":
1. suggest_production_schedule — confirm the target line is currently idle/maintenance.
2. draft_new_production_order(facility_id, line_id, sku_id, quantity_units, planned_start_at?, notes?).
   The target line MUST be idle — if it isn't, use draft_schedule_change to swap instead.

## Outbound workflow
1. suggest_outbound_shipments — current dock schedule.
2. list_warehouse_stock(facility_id) — verify available_units.
3. list_open_retailer_orders(sku_id) — pick matching open PO.
4. draft_outbound_shipment — creates outbound_shipment action card (pallets reserved on confirm only).

Always write a clear 2–4 sentence explanation BEFORE the ```action_card fence.
Include the action_card_id from the draft tool:

```action_card
{"action_card_id": "<id-from-tool>"}
```

Never apply changes directly — every write goes through action card + human confirmation.
State top constraints in plain language (allergen/capacity/timing for production; FEFO stock + PO qty + delivery date for outbound).
Use identify_stakeholders and send_confirmation_email when a schedule change needs stakeholder sign-off.
"""

_ACTION_CARD_RE = re.compile(r"```action_card\s*(\{.*?\})\s*```", re.DOTALL)


def _extract_action_card(message: AIMessage) -> dict | None:
    if not isinstance(message.content, str):
        return None
    match = _ACTION_CARD_RE.search(message.content)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            return None
    return None


class SchedulerAgent:
    def __init__(self) -> None:
        store = get_prompt_store()
        base_prompt = store.get("orchestrator")
        self._system = SystemMessage(content=base_prompt + _SYSTEM_SUFFIX)

    def run(self, state: dict) -> dict:
        graph = cached_react_agent(
            "scheduler",
            tools=_TOOLS,
            prompt=self._system,
        )
        result = graph.invoke(state)
        last_msg = result["messages"][-1] if result.get("messages") else None
        if isinstance(last_msg, AIMessage):
            card = _extract_action_card(last_msg)
            if card:
                existing = state.get("action_cards", [])
                result["action_cards"] = existing + [card]
        return result
