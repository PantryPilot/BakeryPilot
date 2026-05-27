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
Never apply a schedule directly — every change must route through draft_schedule_change + human confirmation.
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
