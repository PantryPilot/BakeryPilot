"""Stakeholders router: directory + identification."""

from fastapi import APIRouter

from app import mock_data
from app.models.notifications import Stakeholder, StakeholderIdentifyRequest

router = APIRouter(prefix="/api/stakeholders", tags=["stakeholders"])


_ACTION_KIND_TO_TAG = {
    "supplier_order": "supplier_negotiation",
    "schedule_change": "production_changes",
    "transfer": "production_changes",
    "work_order": "cmms",
    "notify": "supplier_negotiation",  # default
    "negotiation_draft": "supplier_negotiation",
    "retailer_negotiation": "retailer_negotiation",
    "weekly_summary": "weekly_summary",
    "contract_lifecycle": "contract_lifecycle",
    "esg_report": "esg",
}


@router.get("", response_model=list[Stakeholder])
async def list_stakeholders(tag: str | None = None) -> list[Stakeholder]:
    rows = mock_data.STAKEHOLDERS
    if tag:
        rows = [s for s in rows if tag in s["tags"]]
    return [Stakeholder(**s) for s in rows]


@router.post("/identify", response_model=list[Stakeholder])
async def identify_stakeholders(req: StakeholderIdentifyRequest) -> list[Stakeholder]:
    """Return stakeholders relevant to the given action_kind, with a reason."""
    tag = _ACTION_KIND_TO_TAG.get(req.action_kind)
    candidates = [
        mock_data.stakeholder_with_reason(s, tag)
        for s in mock_data.STAKEHOLDERS
        if (tag is None or tag in s["tags"])
    ]
    return [Stakeholder(**s) for s in candidates]
