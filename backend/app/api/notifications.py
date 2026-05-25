"""Notifications router: Gmail draft creation (mock; never auto-sends)."""

from datetime import datetime

from fastapi import APIRouter, HTTPException

from app import mock_data
from app.models.notifications import NotificationDraft, NotificationDraftRequest

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/drafts", response_model=list[NotificationDraft])
async def list_drafts(limit: int = 50) -> list[NotificationDraft]:
    rows = sorted(
        mock_data.NOTIFICATION_DRAFTS, key=lambda d: d["created_at"], reverse=True,
    )[:limit]
    return [NotificationDraft(**d) for d in rows]


@router.post("/drafts", response_model=list[NotificationDraft])
async def create_drafts(req: NotificationDraftRequest) -> list[NotificationDraft]:
    """Create one Gmail draft per selected stakeholder. Never sends."""
    stakeholders = [
        s for s in mock_data.STAKEHOLDERS if s["stakeholder_id"] in req.stakeholder_ids
    ]
    if not stakeholders:
        raise HTTPException(400, "no matching stakeholders")

    created: list[NotificationDraft] = []
    for s in stakeholders:
        draft_id = mock_data.new_id("ndft")
        draft = {
            "draft_id": draft_id,
            "kind": req.kind,
            "recipients": [s["email"]],
            "subject": req.subject,
            "body_md": req.body_md,
            "gmail_draft_url": f"https://mail.google.com/mail/u/0/#drafts/mock-{draft_id}",
            "action_card_id": None,
            "created_at": datetime.utcnow().isoformat(),
        }
        mock_data.NOTIFICATION_DRAFTS.append(draft)
        created.append(NotificationDraft(**draft))
    return created
