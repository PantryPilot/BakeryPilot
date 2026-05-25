from __future__ import annotations

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage
from langgraph.prebuilt import create_react_agent

from agent.config import get_model
from agent.prompts.store import get_prompt_store
from agent.tools.inventory_tools import query_lots, substitution_candidates

_TOOLS = [query_lots, substitution_candidates]

_SYSTEM_SUFFIX = """
You are the InventoryAgent. Your scope is ingredient lots, spoilage risk, and substitution candidates.
Use query_lots to fetch lot data and substitution_candidates when a SKU is blocked.
If no lots exist for a facility, return an empty list with a brief explanation — do not raise an error.
Never place orders — that belongs to the ProcurementAgent.
"""


class InventoryAgent:
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
