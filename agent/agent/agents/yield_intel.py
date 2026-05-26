from __future__ import annotations

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import SystemMessage
from langgraph.prebuilt import create_react_agent

from agent.config import get_model
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
Use get_yield_variance to retrieve actual vs planned ingredient consumption per run.
Use diagnose_anomaly when variance is above threshold — it cross-references equipment calibration, operator shift, and recipe history.
Use create_cmms_work_order to surface maintenance as an action_card; never commit directly.
For each candidate cause, give a one-sentence explanation and cite the supporting data row.
Use identify_stakeholders and send_confirmation_email when maintenance or yield alerts need to reach the relevant team.
"""


class YieldAgent:
    def __init__(self) -> None:
        store = get_prompt_store()
        base_prompt = store.get("orchestrator")
        system = SystemMessage(content=base_prompt + _SYSTEM_SUFFIX)
        llm = ChatAnthropic(model=get_model("default"), temperature=0)
        self.graph = create_react_agent(model=llm, tools=_TOOLS, prompt=system)

    def run(self, state: dict) -> dict:
        return self.graph.invoke(state)
