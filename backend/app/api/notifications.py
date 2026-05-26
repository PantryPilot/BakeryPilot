from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import NotificationDraft as DraftORM, Stakeholder as StakeholderORM
from app.db.session import get_db
from app.models.notifications import NotificationDraft, NotificationDraftRequest

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/drafts", response_model=list[NotificationDraft])
async def list_drafts(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> list[NotificationDraft]:
    rows = (
        await db.execute(
            select(DraftORM).order_by(DraftORM.created_at.desc()).limit(limit)
        )
    ).scalars().all()
    return [
        NotificationDraft(
            draft_id=str(r.draft_id),
            kind=r.kind,
            recipients=r.recipients,
            subject=r.subject,
            body_md=r.body_md,
            gmail_draft_url=r.gmail_draft_url or "",
            action_card_id=str(r.action_card_id) if r.action_card_id else None,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]


@router.post("/drafts", response_model=list[NotificationDraft])
async def create_drafts(
    req: NotificationDraftRequest,
    db: AsyncSession = Depends(get_db),
) -> list[NotificationDraft]:
    stakeholders = (
        await db.execute(
            select(StakeholderORM).where(
                StakeholderORM.stakeholder_id.in_(req.stakeholder_ids)
            )
        )
    ).scalars().all()
    if not stakeholders:
        raise HTTPException(400, "no matching stakeholders")

    created = []
    for s in stakeholders:
        draft = DraftORM(
            kind=req.kind,
            recipients=[s.email],
            subject=req.subject,
            body_md=req.body_md,
            gmail_draft_url=f"https://mail.google.com/mail/u/0/#drafts/mock-{s.stakeholder_id}",
        )
        db.add(draft)
        await db.flush()
        created.append(
            NotificationDraft(
                draft_id=str(draft.draft_id),
                kind=draft.kind,
                recipients=draft.recipients,
                subject=draft.subject,
                body_md=draft.body_md,
                gmail_draft_url=draft.gmail_draft_url or "",
                action_card_id=None,
                created_at=draft.created_at.isoformat(),
            )
        )

    await db.commit()
    return created
