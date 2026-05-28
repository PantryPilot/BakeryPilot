from __future__ import annotations

import opik
from langchain_core.messages import HumanMessage, SystemMessage

from agent.llm import make_chat_llm
from agent.prompts.store import get_prompt_store
from agent.state import AgentState

_VALID_INTENTS = {"inventory", "procurement", "scheduler", "yield", "esg", "weekly_plan", "weekly_summary", "demo", "general"}

_DEMO_PHRASES = (
    "demo order",
    "demo schedule",
    "mock data",
    "mock order",
    "sample order",
    "populate mock",
    "populate demo",
    "populate the schedule",
    "generate demo",
    "generate mock",
    "seed the schedule",
    "seed demo",
    "random order",
    "random schedule",
)


def _match_demo_intent(text: str) -> bool:
    t = text.lower()
    if any(phrase in t for phrase in _DEMO_PHRASES):
        return True
    has_generate = "generate" in t or "create" in t or "populate" in t
    has_target = "order" in t or "schedule" in t
    has_demo = "demo" in t or "mock" in t or "sample" in t
    return has_generate and has_target and has_demo


@opik.track(name="classify_intent")
def classify_intent(state: AgentState) -> AgentState:
    last_user_msg = next(
        (m for m in reversed(state["messages"]) if isinstance(m, HumanMessage)),
        None,
    )
    if last_user_msg is None:
        return {**state, "intent": "general"}

    user_text = str(last_user_msg.content)
    if _match_demo_intent(user_text):
        return {**state, "intent": "demo"}

    store = get_prompt_store()
    classifier_prompt = store.get("intent_classifier")

    llm = make_chat_llm(temperature=0)
    response = llm.invoke(
        [
            SystemMessage(content=classifier_prompt),
            HumanMessage(content=str(last_user_msg.content)),
        ]
    )

    raw = str(response.content).strip().lower().split()[0] if response.content else ""
    intent = raw if raw in _VALID_INTENTS else "general"
    return {**state, "intent": intent}
