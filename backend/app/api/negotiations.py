from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import NegotiationDraft as DraftORM, Supplier
from app.db.session import get_db
from app.models.suppliers import NegotiationDraft

router = APIRouter(prefix="/api/negotiations", tags=["negotiations"])


class CreateNegotiationDraftRequest(BaseModel):
    supplier_id: str
    trigger_kind: str
    body_md: str


@router.get("", response_model=list[NegotiationDraft])
async def list_negotiation_drafts(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[NegotiationDraft]:
    q = select(DraftORM).order_by(DraftORM.created_at.desc())
    if status:
        q = q.where(DraftORM.status == status)
    rows = (await db.execute(q)).scalars().all()
    return [
        NegotiationDraft(
            draft_id=str(r.draft_id),
            supplier_id=r.supplier_id,
            trigger_kind=r.trigger_kind,
            body_md=r.body_md,
            status=r.status,
            created_at=r.created_at.isoformat(),
            sent_at=r.sent_at.isoformat() if r.sent_at else None,
            action_card_id=str(r.action_card_id) if r.action_card_id else None,
        )
        for r in rows
    ]


@router.post("", response_model=NegotiationDraft)
async def create_draft(
    req: CreateNegotiationDraftRequest,
    db: AsyncSession = Depends(get_db),
) -> NegotiationDraft:
    if not await db.get(Supplier, req.supplier_id):
        raise HTTPException(404, f"supplier {req.supplier_id} not found")
    draft = DraftORM(
        supplier_id=req.supplier_id,
        trigger_kind=req.trigger_kind,
        body_md=req.body_md,
    )
    db.add(draft)
    await db.commit()
    await db.refresh(draft)
    return NegotiationDraft(
        draft_id=str(draft.draft_id),
        supplier_id=draft.supplier_id,
        trigger_kind=draft.trigger_kind,
        body_md=draft.body_md,
        status=draft.status,
        created_at=draft.created_at.isoformat(),
        sent_at=None,
        action_card_id=None,
    )


@router.post("/{draft_id}/mark_sent", response_model=NegotiationDraft)
async def mark_sent(
    draft_id: str,
    db: AsyncSession = Depends(get_db),
) -> NegotiationDraft:
    draft = await db.get(DraftORM, draft_id)
    if not draft:
        raise HTTPException(404, f"draft {draft_id} not found")
    from datetime import datetime, timezone
    draft.status = "sent"
    draft.sent_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(draft)
    return NegotiationDraft(
        draft_id=str(draft.draft_id),
        supplier_id=draft.supplier_id,
        trigger_kind=draft.trigger_kind,
        body_md=draft.body_md,
        status=draft.status,
        created_at=draft.created_at.isoformat(),
        sent_at=draft.sent_at.isoformat() if draft.sent_at else None,
        action_card_id=None,
    )


@router.post("/{draft_id}/discard", response_model=NegotiationDraft)
async def discard_draft(
    draft_id: str,
    db: AsyncSession = Depends(get_db),
) -> NegotiationDraft:
    draft = await db.get(DraftORM, draft_id)
    if not draft:
        raise HTTPException(404, f"draft {draft_id} not found")
    if draft.status in ("sent",):
        raise HTTPException(409, "cannot discard a sent draft")
    draft.status = "discarded"
    await db.commit()
    await db.refresh(draft)
    return NegotiationDraft(
        draft_id=str(draft.draft_id),
        supplier_id=draft.supplier_id,
        trigger_kind=draft.trigger_kind,
        body_md=draft.body_md,
        status=draft.status,
        created_at=draft.created_at.isoformat(),
        sent_at=draft.sent_at.isoformat() if draft.sent_at else None,
        action_card_id=None,
    )
