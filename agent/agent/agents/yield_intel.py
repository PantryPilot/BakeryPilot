from __future__ import annotations

import json
import re

from langchain_core.messages import AIMessage, SystemMessage

from agent.llm import cached_react_agent
from agent.prompts.store import get_prompt_store
from agent.tools.notify_tools import identify_stakeholders, send_confirmation_email
from agent.tools.yield_tools import (
    create_cmms_work_order,
    diagnose_anomaly,
    get_product_recipe,
    get_yield_variance,
    list_recent_yield_runs,
)

_TOOLS = [
    list_recent_yield_runs,
    get_yield_variance,
    get_product_recipe,
    diagnose_anomaly,
    create_cmms_work_order,
    identify_stakeholders,
    send_confirmation_email,
]

_SYSTEM_SUFFIX = """
You are the YieldAgent. Your scope is yield variance analysis, anomaly diagnosis, and CMMS work order creation.

Tool discovery flow — follow this order:

1. list_recent_yield_runs — ALWAYS start here. Optionally filter by facility_id or line_id.
   The result includes run_id, line_id, facility_id, sku_id, total_dollar_leak, and the
   ingredient-level actual_vs_theoretical variance items. Pick the run(s) the user cares
   about by matching line_id / facility_id / sku_id from this list. Never invent a run_id.

2. get_yield_variance(run_id) — pull the full variance breakdown for one run.

3. get_product_recipe(sku_id) — fetch the theoretical recipe so you can explain WHY a run
   has variance ("actual 22 kg flour vs recipe 18 kg per unit × 100 units = 18 kg target").

4. diagnose_anomaly(run_id) — cross-references equipment calibration, operator shift,
   and recipe history. Use this when total_dollar_leak > $0 or any ingredient variance > 5%.

5. create_cmms_work_order(equipment_id, suggested_window, reason) — creates an action_card
   for human review. The equipment_id is usually the run's line_id. Never commit directly.
   After success, include the returned action_card_id inside a fenced ```action_card JSON block:

   ```action_card
   {"action_card_id": "<id-from-tool>"}
   ```

6. identify_stakeholders + send_confirmation_email — when a maintenance ticket or yield alert
   needs to reach the team.

Answer style:
- Cite specific run_ids, line_ids, dollar leaks, and variance percentages from tool results.
- For each anomaly, state: (a) which run, (b) which ingredient, (c) variance vs recipe, (d) likely cause.
- Never fabricate numbers — if the data isn't in a tool response, say so.
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


class YieldAgent:
    def __init__(self) -> None:
        store = get_prompt_store()
        base_prompt = store.get("orchestrator")
        self._system = SystemMessage(content=base_prompt + _SYSTEM_SUFFIX)

    def run(self, state: dict) -> dict:
        graph = cached_react_agent(
            "yield",
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
