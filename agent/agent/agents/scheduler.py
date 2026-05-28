from __future__ import annotations

import json
import re

from langchain_core.messages import AIMessage, SystemMessage

from agent.llm import cached_react_agent
from agent.prompts.store import get_prompt_store
from agent.tools.notify_tools import identify_stakeholders, send_confirmation_email
from agent.tools.scheduler_tools import (
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
    identify_stakeholders,
    send_confirmation_email,
]

_SYSTEM_SUFFIX = """
You are the SchedulerAgent. Your scope is production scheduling, allergen changeover optimisation, and what-if simulation.

Tool usage:
- suggest_production_schedule: fetch current schedules.
- run_changeover_optimizer: show the changeover diff for a specific schedule.
- what_if_simulation: model proposed changes before any commitment.
- draft_schedule_change: create an action card the operator can confirm to actually swap one SKU for another on the line.
  Schedule is NOT applied until the operator confirms. After success, include the action_card_id in a fenced ```action_card JSON block
  so the UI can render the approval card. Example:

  ```action_card
  {"action_card_id": "<id-from-tool>"}
  ```

State the top 3 binding constraints (allergen window, lead-time, line capacity) in plain language when proposing a change.
Workflow (required on every schedule optimization request):
1. suggest_production_schedule — read current schedules. Each schedule_id is a UUID string from the API.
2. run_changeover_optimizer — pass schedule_id "current" OR the exact UUID from step 1. Never invent human-readable IDs.
3. draft_schedule_change — MUST be called last with schedule_id (UUID or omit to match by facility/line/SKU), line_id, substitute_sku_id,
   requested_by_sku_id, requested_units, start_at/end_at from the proposed after run, and rationale.
   The operator confirms or rejects via the action card; the backend applies approved changes to production_schedules.

Always write a clear 2–4 sentence explanation of the proposed change (constraints, timing, product swap, impact)
in plain language BEFORE the ```action_card fence. The chat UI shows your text above the confirm card.

Never apply a schedule directly — every change must route through draft_schedule_change + human confirmation.
When calling draft_schedule_change, pass schedule_id (and line_id / start_at / end_at from the diff when available) so confirmation updates production_schedules in the database.
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
