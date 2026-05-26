from __future__ import annotations

from typing import Annotated

import httpx
import opik
from langchain_core.tools import tool, ToolException

from agent.config import BACKEND_URL


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
