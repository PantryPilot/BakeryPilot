from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Stakeholder as StakeholderORM
from app.db.session import get_db
from app.models.notifications import Stakeholder, StakeholderIdentifyRequest

router = APIRouter(prefix="/api/stakeholders", tags=["stakeholders"])

_ACTION_KIND_TO_TAG: dict[str, str] = {
    "supplier_order": "supplier_negotiation",
    "schedule_change": "production_changes",
    "transfer": "production_changes",
    "work_order": "cmms",
    "notify": "supplier_negotiation",
    "negotiation_draft": "supplier_negotiation",
    "retailer_negotiation": "retailer_negotiation",
    "weekly_summary": "weekly_summary",
    "contract_lifecycle": "contract_lifecycle",
    "esg_report": "esg_reporting",
}


def _to_model(s: StakeholderORM, relevance_reason: str | None = None) -> Stakeholder:
    return Stakeholder(
        stakeholder_id=s.stakeholder_id,
        name=s.name,
        email=s.email,
        role=s.role,
        organization=s.organization,
        tags=s.tags,
        relevance_reason=relevance_reason,
    )


@router.get("", response_model=list[Stakeholder])
async def list_stakeholders(
    tag: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[Stakeholder]:
    q = select(StakeholderORM)
    if tag:
        q = q.where(StakeholderORM.tags.any(tag))
    rows = (await db.execute(q)).scalars().all()
    return [_to_model(s) for s in rows]


@router.post("/identify", response_model=list[Stakeholder])
async def identify_stakeholders(
    req: StakeholderIdentifyRequest,
    db: AsyncSession = Depends(get_db),
) -> list[Stakeholder]:
    tag = _ACTION_KIND_TO_TAG.get(req.action_kind)
    q = select(StakeholderORM)
    if tag:
        q = q.where(StakeholderORM.tags.any(tag))
    rows = (await db.execute(q)).scalars().all()
    return [
        _to_model(s, relevance_reason=f"Tagged for {req.action_kind} actions")
        for s in rows
    ]
