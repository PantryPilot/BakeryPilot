from __future__ import annotations

from langchain_core.messages import SystemMessage

from agent.llm import cached_react_agent
from agent.prompts.store import get_prompt_store
from agent.tools.notify_tools import identify_stakeholders, send_confirmation_email
from agent.tools.yield_tools import (
    create_cmms_work_order,
    diagnose_anomaly,
    get_yield_variance,
)

_TOOLS = [
    get_yield_variance,
    diagnose_anomaly,
    create_cmms_work_order,
    identify_stakeholders,
    send_confirmation_email,
]

_SYSTEM_SUFFIX = """
You are the YieldAgent. Your scope is yield variance analysis, anomaly diagnosis, and CMMS work order creation.

Tool usage rules:
1. ALWAYS call get_yield_variance (no run_id) first to discover available runs and their run_ids.
   Never guess or invent a run_id from a line name — only use run_ids returned by get_yield_variance.
2. When the user mentions a line (e.g. "line 2"), find the matching run_id in the get_yield_variance response
   by matching the "line_id" field, then pass that run_id to diagnose_anomaly.
3. Use diagnose_anomaly when variance exceeds 5% on any ingredient — it cross-references equipment
   calibration, operator shift, and recipe history.
4. Use create_cmms_work_order to surface maintenance as an action_card; never commit directly.
5. For each candidate cause, give a one-sentence explanation and cite the supporting data row.
6. Use identify_stakeholders and send_confirmation_email when maintenance or yield alerts need to reach the team.
"""


class YieldAgent:
    def __init__(self) -> None:
        store = get_prompt_store()
        base_prompt = store.get("orchestrator")
        self._system = SystemMessage(content=base_prompt + _SYSTEM_SUFFIX)

    def run(self, state: dict) -> dict:
        graph = cached_react_agent(
            "yield",
            tools=_TOOLS,
            prompt=self._system,
        )
        return graph.invoke(state)
