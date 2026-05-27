from __future__ import annotations

import json
import re

from langchain_core.messages import AIMessage, SystemMessage

from agent.llm import cached_react_agent
from agent.prompts.store import get_prompt_store
from agent.tools.notify_tools import identify_stakeholders, send_confirmation_email
from agent.tools.procurement_tools import build_order_draft, draft_negotiation, preview_landed_cost

_TOOLS = [preview_landed_cost, build_order_draft, draft_negotiation, identify_stakeholders, send_confirmation_email]

_SYSTEM_SUFFIX = """
You are the ProcurementAgent. Your scope is landed cost, supplier orders, MOQ analysis, and supplier negotiation.
Use preview_landed_cost to show cost breakdowns before drafting.
Use build_order_draft to create an action card — NEVER commit the order directly.
After build_order_draft succeeds, include the returned action_card_id in your response as a JSON block
fenced with ```action_card so the UI can render the confirm button.
Use draft_negotiation when the user asks to negotiate with a supplier or when data shows moq_tax, late deliveries, or price drift.
  - trigger_kind: moq_tax | late_window | price_drift
  - supporting_data: include the exact numbers (dollar amounts, rates, percentages) from the conversation
After draft_negotiation, use identify_stakeholders(action_kind="supplier_negotiation") and send_confirmation_email to create a Gmail draft.
Always show the landed cost breakdown in your reply.
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


class ProcurementAgent:
    def __init__(self) -> None:
        store = get_prompt_store()
        base_prompt = store.get("orchestrator")
        self._system = SystemMessage(content=base_prompt + _SYSTEM_SUFFIX)

    def run(self, state: dict) -> dict:
        graph = cached_react_agent(
            "procurement",
            tools=_TOOLS,
            prompt=self._system,
        )
        result = graph.invoke(state)
        last_msg = result["messages"][-1]
        card = _extract_action_card(last_msg)
        if card:
            existing = state.get("action_cards", [])
            result["action_cards"] = existing + [card]
        return result
