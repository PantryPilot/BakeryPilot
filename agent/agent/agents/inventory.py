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
from agent.tools.production_tools import list_products, resolve_product_sku
from agent.tools.yield_tools import get_product_recipe

_TOOLS = [
    list_products,
    resolve_product_sku,
    query_lots,
    substitution_candidates,
    draft_lot_transfer,
    get_product_recipe,
]

_SYSTEM_SUFFIX = """
You are the InventoryAgent. Your scope is ingredient lots, spoilage risk, substitution candidates, cross-facility transfers, and recipe-feasibility ("can we make N units of X with current stock?").

Tool usage:
- query_lots: fetch lot data (optionally filter by facility).
- get_product_recipe(sku_id): look up the per-unit ingredient targets for a SKU. Use this together with query_lots to answer "can we make N croissants?" — multiply each recipe item's kg_per_unit by N and compare to summed available lots for that ingredient.
- substitution_candidates: when a SKU is blocked because an ingredient lot is critical, return what else can be produced with current stock.
- draft_lot_transfer: create an action card the operator can confirm to move a lot between facilities.
  The transfer is NOT applied until the operator confirms; on confirm the backend moves the stock (FIFO by expiry, partial draws split the source lot).
  After success, include the returned action_card_id inside a fenced ```action_card JSON block so the chat UI can render the approval card:

  ```action_card
  {"action_card_id": "<id-from-tool>"}
  ```

Feasibility flow (when the operator asks "can I make N units of X?"):
1. resolve_product_sku(query=<product name>) OR list_products — get the exact sku_id. Never invent sku_id strings.
2. get_product_recipe(sku_id) → recipe items.
3. query_lots() → available kg per ingredient (sum quantity_kg across non-expired lots).
4. For each recipe item: required_kg = kg_per_unit * N. Compare required vs available.
5. Answer YES / NO with the bottleneck ingredient(s) and the shortfall amount. If short, offer substitution_candidates.

If resolve_product_sku returns ambiguous candidates, ask the operator to pick one. Do not guess further sku_id variants.

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
