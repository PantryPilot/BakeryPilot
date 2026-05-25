from __future__ import annotations

import os
import uuid
from typing import AsyncIterator

import opik
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.store.memory import InMemoryStore

from agent.agents.inventory import InventoryAgent
from agent.agents.orchestrator import classify_intent
from agent.agents.procurement import ProcurementAgent
from agent.config import LANGCHAIN_API_KEY, LANGCHAIN_PROJECT, LANGCHAIN_TRACING_V2, get_model
from agent.prompts.store import get_prompt_store
from agent.state import AgentState

os.environ.setdefault("LANGCHAIN_TRACING_V2", LANGCHAIN_TRACING_V2)
os.environ.setdefault("LANGCHAIN_PROJECT", LANGCHAIN_PROJECT)
os.environ.setdefault("LANGCHAIN_API_KEY", LANGCHAIN_API_KEY)

_store = InMemoryStore()
_checkpointer = MemorySaver()

_inventory_agent = InventoryAgent()
_procurement_agent = ProcurementAgent()


def _route_intent(state: AgentState) -> str:
    intent = state.get("intent", "general")
    if intent == "inventory":
        return "inventory_agent"
    if intent == "procurement":
        return "procurement_agent"
    return "respond"


@opik.track(name="inventory_agent_node")
def _inventory_node(state: AgentState) -> AgentState:
    facility_id = _get_facility_from_memory(state) or state.get("facility_id")
    if facility_id:
        state = {**state, "facility_id": facility_id}
    result = _inventory_agent.graph.invoke(state)
    _save_facility_to_memory(state, result)
    return result


@opik.track(name="procurement_agent_node")
def _procurement_node(state: AgentState) -> AgentState:
    return _procurement_agent.run(state)


@opik.track(name="respond_node")
def _respond_node(state: AgentState) -> AgentState:
    messages = state["messages"]
    last = messages[-1] if messages else None

    if isinstance(last, AIMessage):
        return state

    store = get_prompt_store()
    system_prompt = store.get("orchestrator")
    llm = ChatAnthropic(model=get_model("default"), temperature=0)
    response = llm.invoke([SystemMessage(content=system_prompt)] + list(messages))
    return {"messages": [response]}


def _get_facility_from_memory(state: AgentState) -> str | None:
    thread_id = _get_thread_id(state)
    items = _store.search(("facility", thread_id))
    if items:
        return items[0].value.get("facility_id")
    return None


def _save_facility_to_memory(state: AgentState, result: dict) -> None:
    facility_id = result.get("facility_id") or state.get("facility_id")
    if not facility_id:
        return
    thread_id = _get_thread_id(state)
    _store.put(("facility", thread_id), "current", {"facility_id": facility_id})


def _get_thread_id(state: AgentState) -> str:
    config = state.get("configurable", {}) if isinstance(state, dict) else {}
    return config.get("thread_id", "default")


def create_graph():
    builder = StateGraph(AgentState)

    builder.add_node("classify_intent", classify_intent)
    builder.add_node("inventory_agent", _inventory_node)
    builder.add_node("procurement_agent", _procurement_node)
    builder.add_node("respond", _respond_node)

    builder.add_edge(START, "classify_intent")
    builder.add_conditional_edges(
        "classify_intent",
        _route_intent,
        {
            "inventory_agent": "inventory_agent",
            "procurement_agent": "procurement_agent",
            "respond": "respond",
        },
    )
    builder.add_edge("inventory_agent", "respond")
    builder.add_edge("procurement_agent", "respond")
    builder.add_edge("respond", END)

    return builder.compile(checkpointer=_checkpointer, store=_store)


_graph = create_graph()


def stream(message: str, thread_id: str | None = None, facility_id: str | None = None):
    thread_id = thread_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    initial: AgentState = {
        "messages": [HumanMessage(content=message)],
        "facility_id": facility_id,
    }
    for chunk in _graph.stream(initial, config=config, stream_mode="values"):
        yield chunk


if __name__ == "__main__":
    print("BakeryPilot agent smoke test")
    test_messages = [
        ("what can we bake if blueberries are short?", "inventory"),
        ("what is the landed cost for 800 kg from Supplier B?", "procurement"),
    ]
    for msg, expected_intent in test_messages:
        thread = str(uuid.uuid4())
        final = None
        for chunk in stream(msg, thread_id=thread):
            final = chunk
        intent = final.get("intent", "?") if final else "?"
        status = "PASS" if intent == expected_intent else f"FAIL (got {intent})"
        print(f"  [{status}] '{msg[:50]}' -> intent={intent}")
