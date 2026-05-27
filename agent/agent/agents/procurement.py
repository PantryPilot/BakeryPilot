from __future__ import annotations

import json
import re

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, SystemMessage
from langgraph.prebuilt import create_react_agent

from agent.config import get_model
from agent.prompts.store import get_prompt_store
from agent.tools.notify_tools import identify_stakeholders, send_confirmation_email
from agent.tools.procurement_tools import build_order_draft, draft_negotiation, get_supplier_risk, preview_landed_cost

_TOOLS = [get_supplier_risk, preview_landed_cost, build_order_draft, draft_negotiation, identify_stakeholders, send_confirmation_email]

_SYSTEM_SUFFIX = """
You are the ProcurementAgent. Your scope is supplier risk, landed cost, supplier orders, MOQ analysis, and supplier negotiation.

Tool usage:
- get_supplier_risk: call this for any question about a supplier's risk level, reliability, disruption signals, or performance metrics.
- preview_landed_cost: show cost breakdowns before drafting an order.
- build_order_draft: create an action card for human review — NEVER commit directly.
  After success, include the action_card_id in a ```action_card JSON block.
- draft_negotiation: use when the user asks to negotiate, or when data shows moq_tax / late deliveries / price drift.
  trigger_kind: moq_tax | late_window | price_drift
  supporting_data: include exact numbers from the conversation.
  Follow with identify_stakeholders(action_kind="supplier_negotiation") and send_confirmation_email.

Always cite specific numbers from tool results. Never fabricate metrics.
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
        system = SystemMessage(content=base_prompt + _SYSTEM_SUFFIX)

        llm = ChatAnthropic(model=get_model("default"), temperature=0)
        self.graph = create_react_agent(
            model=llm,
            tools=_TOOLS,
            prompt=system,
        )

    def run(self, state: dict) -> dict:
        result = self.graph.invoke(state)
        last_msg = result["messages"][-1]
        card = _extract_action_card(last_msg)
        if card:
            existing = state.get("action_cards", [])
            result["action_cards"] = existing + [card]
        return result
