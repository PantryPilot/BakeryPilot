from __future__ import annotations

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage
from langgraph.prebuilt import create_react_agent

from agent.config import get_model
from agent.prompts.store import get_prompt_store
from agent.tools.notify_tools import identify_stakeholders, send_confirmation_email
from agent.tools.summary_tools import get_weekly_summary, list_weekly_summaries, narrate_week


class SummaryAgent:
    def __init__(self) -> None:
        store = get_prompt_store()
        system_prompt = store.get("weekly_summary")
        self._graph = create_react_agent(
            model=ChatAnthropic(model=get_model("default"), temperature=0),
            tools=[get_weekly_summary, list_weekly_summaries, narrate_week, identify_stakeholders, send_confirmation_email],
            prompt=SystemMessage(content=system_prompt),
        )

    def run(self, state: dict) -> dict:
        return self._graph.invoke(state)
