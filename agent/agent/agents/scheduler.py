from __future__ import annotations

from langchain_core.messages import SystemMessage

from agent.llm import cached_react_agent
from agent.prompts.store import get_prompt_store
from agent.tools.notify_tools import identify_stakeholders, send_confirmation_email
from agent.tools.scheduler_tools import (
    run_changeover_optimizer,
    suggest_production_schedule,
    what_if_simulation,
)

_TOOLS = [
    suggest_production_schedule,
    run_changeover_optimizer,
    what_if_simulation,
    identify_stakeholders,
    send_confirmation_email,
]

_SYSTEM_SUFFIX = """
You are the SchedulerAgent. Your scope is production scheduling, allergen changeover optimisation, and what-if simulation.
Use suggest_production_schedule to fetch current schedules.
Use run_changeover_optimizer to show the changeover diff for a specific schedule.
Use what_if_simulation to model proposed changes before any commitment.
When recommending a schedule change, state the top 3 binding constraints in plain language.
Never approve a schedule directly — surface changes as an action_card for human review.
Use identify_stakeholders and send_confirmation_email when a schedule change needs stakeholder sign-off.
"""


class SchedulerAgent:
    def __init__(self) -> None:
        store = get_prompt_store()
        base_prompt = store.get("orchestrator")
        self._system = SystemMessage(content=base_prompt + _SYSTEM_SUFFIX)

    def run(self, state: dict) -> dict:
        graph = cached_react_agent(
            "scheduler",
            tools=_TOOLS,
            prompt=self._system,
        )
        return graph.invoke(state)
