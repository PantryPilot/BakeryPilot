from __future__ import annotations

from langchain_core.messages import SystemMessage

from agent.llm import cached_react_agent
from agent.prompts.store import get_prompt_store
from agent.tools.notify_tools import identify_stakeholders, send_confirmation_email
from agent.tools.summary_tools import get_weekly_summary, list_weekly_summaries, narrate_week


class SummaryAgent:
    def __init__(self) -> None:
        store = get_prompt_store()
        self._system = SystemMessage(content=store.get("weekly_summary"))
        self._tools = [
            get_weekly_summary,
            list_weekly_summaries,
            narrate_week,
            identify_stakeholders,
            send_confirmation_email,
        ]

    def run(self, state: dict) -> dict:
        graph = cached_react_agent(
            "summary",
            tools=self._tools,
            prompt=self._system,
            purpose="summary",
        )
        return graph.invoke(state)
