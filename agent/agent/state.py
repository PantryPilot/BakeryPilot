from __future__ import annotations

from typing import Annotated
from langgraph.graph.message import add_messages
from langgraph.graph import MessagesState


class AgentState(MessagesState):
    intent: str | None = None
    tool_results: Annotated[list[dict], lambda a, b: a + b] = []
    action_cards: Annotated[list[dict], lambda a, b: a + b] = []
    facility_id: str | None = None
    langsmith_run_id: str | None = None
