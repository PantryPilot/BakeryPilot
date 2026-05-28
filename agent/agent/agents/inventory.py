from __future__ import annotations

import json
import re

from langchain_core.messages import AIMessage, SystemMessage

from agent.llm import cached_react_agent
from agent.prompts.store import get_prompt_store
from agent.tools.inventory_tools import (
    draft_lot_transfer,
    query_lots,
    substitution_candidates,
)

_TOOLS = [query_lots, substitution_candidates, draft_lot_transfer]

_SYSTEM_SUFFIX = """
You are the InventoryAgent. Your scope is ingredient lots, spoilage risk, substitution candidates, and cross-facility transfers.

Tool usage:
- query_lots: fetch lot data (optionally filter by facility).
- substitution_candidates: when a SKU is blocked because an ingredient lot is critical, return what else can be produced with current stock.
- draft_lot_transfer: create an action card the operator can confirm to move a lot between facilities.
  The transfer is NOT applied until the operator confirms; on confirm the backend moves the stock (FIFO by expiry, partial draws split the source lot).
  After success, include the returned action_card_id inside a fenced ```action_card JSON block so the chat UI can render the approval card:

  ```action_card
  {"action_card_id": "<id-from-tool>"}
  ```

If no lots exist for a facility, return an empty list with a brief explanation — do not raise an error.
Never place orders — that belongs to the ProcurementAgent.
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


class InventoryAgent:
    def __init__(self) -> None:
        store = get_prompt_store()
        base_prompt = store.get("orchestrator")
        self._system = SystemMessage(content=base_prompt + _SYSTEM_SUFFIX)

    def run(self, state: dict) -> dict:
        graph = cached_react_agent(
            "inventory",
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
