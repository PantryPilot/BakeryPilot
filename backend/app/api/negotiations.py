"""Negotiations router: draft list + create + send marker."""

from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import mock_data
from app.models.suppliers import NegotiationDraft

router = APIRouter(prefix="/api/negotiations", tags=["negotiations"])


class CreateNegotiationDraftRequest(BaseModel):
    supplier_id: str
    trigger_kind: str  # moq_tax | late_window | price_drift
    body_md: str


@router.get("", response_model=list[NegotiationDraft])
async def list_negotiation_drafts(status: str | None = None) -> list[NegotiationDraft]:
    rows = mock_data.NEGOTIATION_DRAFTS
    if status:
        rows = [d for d in rows if d["status"] == status]
    return [NegotiationDraft(**d) for d in rows]


@router.post("", response_model=NegotiationDraft)
async def create_draft(req: CreateNegotiationDraftRequest) -> NegotiationDraft:
    if not any(s["supplier_id"] == req.supplier_id for s in mock_data.SUPPLIERS):
        raise HTTPException(404, f"supplier {req.supplier_id} not found")
    draft = {
        "draft_id": mock_data.new_id("neg"),
        "supplier_id": req.supplier_id,
        "trigger_kind": req.trigger_kind,
        "body_md": req.body_md,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
        "sent_at": None,
        "action_card_id": None,
    }
    mock_data.NEGOTIATION_DRAFTS.append(draft)
    return NegotiationDraft(**draft)


@router.post("/{draft_id}/mark_sent", response_model=NegotiationDraft)
async def mark_sent(draft_id: str) -> NegotiationDraft:
    draft = next((d for d in mock_data.NEGOTIATION_DRAFTS if d["draft_id"] == draft_id), None)
    if not draft:
        raise HTTPException(404, f"draft {draft_id} not found")
    draft["status"] = "sent"
    draft["sent_at"] = datetime.utcnow().isoformat()
    return NegotiationDraft(**draft)
