from __future__ import annotations

import json
import re

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, SystemMessage
from langgraph.prebuilt import create_react_agent

from agent.config import get_model
from agent.prompts.store import get_prompt_store
from agent.tools.procurement_tools import build_order_draft, preview_landed_cost

_TOOLS = [preview_landed_cost, build_order_draft]

_SYSTEM_SUFFIX = """
You are the ProcurementAgent. Your scope is landed cost, supplier orders, and MOQ analysis.
Use compute_landed_cost to show cost breakdowns before drafting.
Use build_order_draft to create an action card — NEVER commit the order directly.
After build_order_draft succeeds, include the returned action_card_id in your response as a JSON block
fenced with ```action_card so the UI can render the confirm button.
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
