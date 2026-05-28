"""Common types: ActionCard, enums."""

from enum import Enum
from typing import Any

from pydantic import BaseModel


class ActionCardKind(str, Enum):
    supplier_order = "supplier_order"
    schedule_change = "schedule_change"
    new_production_order = "new_production_order"
    transfer = "transfer"
    work_order = "work_order"
    notify = "notify"
    download = "download"


class ActionCardState(str, Enum):
    pending = "pending"
    confirmed = "confirmed"
    rejected = "rejected"


class ActionCard(BaseModel):
    card_id: str
    kind: ActionCardKind
    payload: dict[str, Any]
    state: ActionCardState
    created_at: str
    decided_at: str | None = None
    decided_by: str | None = None


class ActionCardRef(BaseModel):
    """Minimal action-card reference returned by draft endpoints."""

    action_card_id: str
