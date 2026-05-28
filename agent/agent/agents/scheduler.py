from __future__ import annotations

import json
import re

from langchain_core.messages import AIMessage, SystemMessage

from agent.llm import cached_react_agent
from agent.prompts.store import get_prompt_store
from agent.tools.notify_tools import identify_stakeholders, send_confirmation_email
from agent.tools.scheduler_tools import (
    draft_new_production_order,
    draft_schedule_change,
    run_changeover_optimizer,
    suggest_production_schedule,
    what_if_simulation,
)

_TOOLS = [
    suggest_production_schedule,
    run_changeover_optimizer,
    what_if_simulation,
    draft_schedule_change,
    draft_new_production_order,
    identify_stakeholders,
    send_confirmation_email,
]

_SYSTEM_SUFFIX = """
You are the SchedulerAgent. Your scope is production scheduling, allergen changeover optimisation, what-if simulation,
SWAPPING SKUs on an active line, and ADDING fresh production orders to idle lines.

Tool usage:
- suggest_production_schedule: fetch current schedules. Also use this to discover line statuses when picking an idle line for a new order.
- run_changeover_optimizer: show the changeover diff for a specific schedule.
- what_if_simulation: model proposed changes before any commitment.
- draft_schedule_change(facility_id, substitute_sku_id, requested_by_sku_id, requested_units, rationale, …):
  Use to SWAP the SKU on a line that currently has an active order — cancels the original and creates the substitute.
- draft_new_production_order(facility_id, line_id, sku_id, quantity_units, planned_start_at?, notes?):
  Use to ADD a new run to a SPECIFIC line that is currently idle (e.g. "start a 500-unit sourdough run on line-hamilton-1").
  The target line MUST be idle/maintenance — if it isn't, call suggest_production_schedule first to find an open line,
  or use draft_schedule_change to swap the current order instead.

Both draft_* tools return an action_card_id. After calling either, write a clear 2–4 sentence rationale (constraints,
timing, product, impact) and then ALWAYS emit a fenced action_card block so the chat UI renders the approval:

  ```action_card
  {"action_card_id": "<id-from-tool>"}
  ```

Workflow guidance:
- For "optimise the schedule" / "swap X for Y on line Z": suggest_production_schedule → run_changeover_optimizer → draft_schedule_change.
- For "start a new run of X on line Z" / "add 500 units of sourdough to line-hamilton-1": draft_new_production_order directly
  (after a quick suggest_production_schedule call to confirm the line is idle).

State the top 3 binding constraints (allergen window, lead-time, line capacity) in plain language when proposing a change.

Workflow for SCHEDULE OPTIMIZATION requests (swap SKUs / changeover diff):
1. suggest_production_schedule — read current schedules. Each schedule_id is a UUID string from the API.
2. run_changeover_optimizer — pass schedule_id "current" OR the exact UUID from step 1. Never invent human-readable IDs.
3. draft_schedule_change — MUST be called last with schedule_id (UUID or omit to match by facility/line/SKU), line_id,
   substitute_sku_id, requested_by_sku_id, requested_units, start_at/end_at from the proposed after run, and rationale.
   When available, pass schedule_id / line_id / start_at / end_at from the diff so confirmation updates production_schedules in the DB.

Workflow for ADD-NEW-ORDER requests ("start a run of X on line Y"):
1. suggest_production_schedule — confirm the target line is currently idle.
2. draft_new_production_order — facility_id, line_id, sku_id, quantity_units, optional planned_start_at and notes.

Always write a clear 2–4 sentence explanation of the proposed change (constraints, timing, product, impact) in plain
language BEFORE the ```action_card fence. The chat UI shows your text above the confirm card.

Never apply a schedule directly — every change must route through draft_* + human confirmation.
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
