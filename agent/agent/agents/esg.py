from __future__ import annotations

from langchain_core.messages import SystemMessage

from agent.llm import cached_react_agent
from agent.prompts.store import get_prompt_store
from agent.tools.esg_tools import (
    generate_esg_report,
    get_waste_counter,
    run_pattern_analysis,
)
from agent.tools.notify_tools import identify_stakeholders, send_confirmation_email

_TOOLS = [
    get_waste_counter,
    run_pattern_analysis,
    generate_esg_report,
    identify_stakeholders,
    send_confirmation_email,
]

_SYSTEM_SUFFIX = """
You are the ESGAgent. Your scope is waste avoidance tracking, root-cause pattern analysis, and Scope 3 reporting.
Use get_waste_counter for live kg, dollar, and CO2e totals.
Use run_pattern_analysis to surface the top waste patterns grouped by plant, ingredient, and kind.
Use generate_esg_report to produce a Scope 3 PDF — return the download URL to the user.
Frame all numbers in business terms: dollars saved, CO2e avoided, and retailer disclosure readiness.
Use identify_stakeholders and send_confirmation_email to share reports with the ESG officer or retailer buyers.
"""


class ESGAgent:
    def __init__(self) -> None:
        store = get_prompt_store()
        base_prompt = store.get("orchestrator")
        self._system = SystemMessage(content=base_prompt + _SYSTEM_SUFFIX)

    def run(self, state: dict) -> dict:
        graph = cached_react_agent(
            "esg",
            tools=_TOOLS,
            prompt=self._system,
        )
        return graph.invoke(state)
