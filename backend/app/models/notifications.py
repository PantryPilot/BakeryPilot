"""Notification (Gmail draft) + stakeholder models."""

from pydantic import BaseModel


class Stakeholder(BaseModel):
    stakeholder_id: str
    name: str
    email: str
    role: str
    organization: str
    tags: list[str]
    relevance_reason: str | None = None


class StakeholderIdentifyRequest(BaseModel):
    action_kind: str
    context: dict = {}


class NotificationDraftRequest(BaseModel):
    stakeholder_ids: list[str]
    subject: str
    body_md: str
    kind: str


class NotificationDraft(BaseModel):
    draft_id: str
    kind: str
    recipients: list[str]
    subject: str
    body_md: str
    gmail_draft_url: str
    action_card_id: str | None = None
    created_at: str
