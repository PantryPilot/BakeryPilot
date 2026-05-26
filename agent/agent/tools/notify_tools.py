from __future__ import annotations

from typing import Annotated

import httpx
import opik
from langchain_core.tools import tool, ToolException

from agent.config import BACKEND_URL


@tool
@opik.track(name="identify_stakeholders")
def identify_stakeholders(
    action_kind: Annotated[
        str,
        "Action type: supplier_order, schedule_change, work_order, esg_report, weekly_summary, contract_lifecycle, retailer_negotiation",
    ],
    context: Annotated[dict, "Additional context for relevance scoring"] = {},
) -> list[dict]:
    """Return stakeholders relevant to an action, each with a one-sentence relevance_reason."""
    resp = httpx.post(
        f"{BACKEND_URL}/api/stakeholders/identify",
        json={"action_kind": action_kind, "context": context},
        timeout=10,
    )
    if resp.status_code != 200:
        raise ToolException(
            f"POST /api/stakeholders/identify returned {resp.status_code}: {resp.text}"
        )
    return resp.json()


@tool
@opik.track(name="send_confirmation_email")
def send_confirmation_email(
    stakeholder_ids: Annotated[list[str], "Stakeholder IDs to notify"],
    subject: Annotated[str, "Email subject line"],
    body_md: Annotated[str, "Email body in markdown"],
    kind: Annotated[str, "Notification kind: supplier_order, schedule_change, work_order, esg_report, etc."] = "notify",
) -> list[dict]:
    """Create Gmail draft(s) for the selected stakeholders. Drafts are never auto-sent — user reviews in Gmail first."""
    resp = httpx.post(
        f"{BACKEND_URL}/api/notifications/drafts",
        json={
            "stakeholder_ids": stakeholder_ids,
            "subject": subject,
            "body_md": body_md,
            "kind": kind,
        },
        timeout=10,
    )
    if resp.status_code != 200:
        raise ToolException(
            f"POST /api/notifications/drafts returned {resp.status_code}: {resp.text}"
        )
    return resp.json()
