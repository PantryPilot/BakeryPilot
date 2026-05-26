from __future__ import annotations

import json
from typing import Annotated

import httpx
import opik
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool, ToolException

from agent.config import BACKEND_URL, get_model
from agent.prompts.store import get_prompt_store


@tool
@opik.track(name="get_weekly_summary")
def get_weekly_summary(
    week_start: Annotated[str | None, "ISO date YYYY-MM-DD for the Monday of the week (None = last week)"] = None,
) -> dict:
    """Fetch or generate the weekly operations summary for a given week.

    If a summary already exists for the week it is returned from cache.
    Otherwise a new one is generated from current mock data.
    Returns {summary_id, week_start, week_end, stats, narration_md, gmail_draft_url}.
    """
    params: dict = {}
    if week_start:
        params["week_start"] = week_start

    resp = httpx.post(
        f"{BACKEND_URL}/api/jobs/weekly_summary/run",
        params=params,
        timeout=15,
    )
    if resp.status_code != 200:
        raise ToolException(f"POST /api/jobs/weekly_summary/run returned {resp.status_code}: {resp.text}")
    return resp.json()


@tool
@opik.track(name="list_weekly_summaries")
def list_weekly_summaries() -> list[dict]:
    """List all available weekly summaries, most recent first.

    Returns a list of {summary_id, week_start, week_end, stats, narration_md}.
    """
    resp = httpx.get(f"{BACKEND_URL}/api/summaries", timeout=10)
    if resp.status_code != 200:
        raise ToolException(f"GET /api/summaries returned {resp.status_code}: {resp.text}")
    return resp.json()


@tool
@opik.track(name="narrate_week")
def narrate_week(
    stats: Annotated[
        dict,
        "Weekly stats dict from get_weekly_summary. Must contain keys: week_start, week_end, stats "
        "(nested dict with dollar_waste_avoided, action_cards_confirmed, moq_tax_accumulated, "
        "supplier_disruptions_caught, schedule_changes_confirmed, new_supplier_orders, "
        "new_retailer_orders). Optionally: quiet_week (bool).",
    ],
) -> str:
    """Narrate a weekly stats dict into a 300-500 word executive markdown summary.

    If stats contains quiet_week=True, returns a single short paragraph.
    Every number in the output is sourced from the stats input — no hallucination.
    """
    if stats.get("quiet_week"):
        week_start = stats.get("week_start", "unknown")
        week_end = stats.get("week_end", "unknown")
        return (
            f"**Week of {week_start} – {week_end}:** Operations were stable with no significant "
            "disruptions, anomalies, or urgent action items requiring executive attention. "
            "All KPIs remained within normal thresholds."
        )

    system_prompt = get_prompt_store().get("weekly_summary")
    llm = ChatAnthropic(model=get_model("default"), temperature=0)
    response = llm.invoke(
        [
            SystemMessage(content=system_prompt),
            HumanMessage(content=json.dumps(stats, default=str)),
        ]
    )
    return str(response.content)
