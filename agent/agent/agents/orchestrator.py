from __future__ import annotations

import opik
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from agent.config import get_model
from agent.prompts.store import get_prompt_store
from agent.state import AgentState

_VALID_INTENTS = {"inventory", "procurement", "scheduler", "yield", "esg", "general"}


@opik.track(name="classify_intent")
def classify_intent(state: AgentState) -> AgentState:
    store = get_prompt_store()
    classifier_prompt = store.get("intent_classifier")

    last_user_msg = next(
        (m for m in reversed(state["messages"]) if isinstance(m, HumanMessage)),
        None,
    )
    if last_user_msg is None:
        return {**state, "intent": "general"}

    llm = ChatAnthropic(model=get_model("default"), temperature=0)
    response = llm.invoke(
        [
            SystemMessage(content=classifier_prompt),
            HumanMessage(content=str(last_user_msg.content)),
        ]
    )

    raw = str(response.content).strip().lower().split()[0] if response.content else ""
    intent = raw if raw in _VALID_INTENTS else "general"
    return {**state, "intent": intent}
