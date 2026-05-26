from __future__ import annotations

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from agent.config import get_model
from agent.tools.esg_tools import get_waste_counter, run_pattern_analysis
from agent.tools.inventory_tools import query_lots, substitution_candidates
from agent.tools.procurement_tools import build_order_draft, preview_landed_cost
from agent.tools.scheduler_tools import run_changeover_optimizer, suggest_production_schedule, what_if_simulation
from agent.tools.yield_tools import create_cmms_work_order, diagnose_anomaly, get_yield_variance

_PLAN_PROMPT = """You are BakeryPilot running a full weekly operations plan.

Call tools in this exact sequence and synthesise results into one structured report:

1. query_lots — find all lots with spoilage_risk_score >= 1.0 or expiring within 7 days
2. suggest_production_schedule — get the current schedule
3. get_yield_variance — get variance for recent runs (no run_id = all recent)
4. get_waste_counter — get ESG totals

Then write a weekly plan report with these sections:

## Inventory Alerts
List critical/expiring lots. For each: lot_id, ingredient, days remaining, quantity_kg, recommended action (use now / transfer / order replacement).

## Schedule Recommendations
Based on expiring lots, identify which SKUs should be prioritised. Flag any changeover conflicts.

## Yield Issues
List runs with high variance. For each anomaly, state the likely cause in one sentence.

## ESG Snapshot
Report kg_avoided, dollars_saved, co2e avoided this period.

## Action Items
Numbered list of the 3-5 highest priority actions for the week, each as a concrete instruction.

Keep the report under 600 words. Be specific — use lot IDs, run IDs, dollar amounts."""


class WeeklyPlanAgent:
    def __init__(self) -> None:
        self._llm = ChatAnthropic(model=get_model("default"), temperature=0)
        self._tools = [
            query_lots,
            suggest_production_schedule,
            get_yield_variance,
            get_waste_counter,
            run_pattern_analysis,
            diagnose_anomaly,
            run_changeover_optimizer,
            what_if_simulation,
            preview_landed_cost,
            build_order_draft,
            substitution_candidates,
            create_cmms_work_order,
        ]

    def run(self, state: dict) -> dict:
        from langgraph.prebuilt import create_react_agent
        graph = create_react_agent(
            model=self._llm,
            tools=self._tools,
            prompt=SystemMessage(content=_PLAN_PROMPT),
        )
        result = graph.invoke(state)
        return result
