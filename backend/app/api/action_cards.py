"""Action card router: list, get, confirm, reject (HITL gate)."""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from app import mock_data
from app.models.common import ActionCard

router = APIRouter(prefix="/api/action_cards", tags=["action_cards"])


@router.get("", response_model=list[ActionCard])
async def list_action_cards(state: str | None = Query(None)) -> list[ActionCard]:
    cards = list(mock_data.ACTION_CARDS.values())
    if state:
        cards = [c for c in cards if c["state"] == state]
    cards = sorted(cards, key=lambda c: c["created_at"], reverse=True)
    return [ActionCard(**c) for c in cards]


@router.get("/{card_id}", response_model=ActionCard)
async def get_action_card(card_id: str) -> ActionCard:
    if card_id not in mock_data.ACTION_CARDS:
        raise HTTPException(404, f"action card {card_id} not found")
    return ActionCard(**mock_data.ACTION_CARDS[card_id])


@router.post("/{card_id}/confirm", response_model=ActionCard)
async def confirm_action_card(card_id: str) -> ActionCard:
    """Idempotent: re-confirming a confirmed card returns the existing record."""
    if card_id not in mock_data.ACTION_CARDS:
        raise HTTPException(404, f"action card {card_id} not found")
    card = mock_data.ACTION_CARDS[card_id]
    if card["state"] == "rejected":
        raise HTTPException(409, "card already rejected")
    if card["state"] == "pending":
        card["state"] = "confirmed"
        card["decided_at"] = datetime.utcnow().isoformat()
        card["decided_by"] = "demo_user"
        # Apply mock side effects per kind
        if card["kind"] == "supplier_order":
            mock_data.SUPPLIER_ORDERS.append({
                "order_id": mock_data.new_id("ord"),
                "supplier_id": card["payload"]["supplier_id"],
                "items": card["payload"]["items"],
                "delivery_date": card["payload"]["delivery_date"],
                "status": "confirmed",
                "confirmed_at": card["decided_at"],
                "action_card_id": card_id,
            })
    return ActionCard(**card)


@router.post("/{card_id}/reject", response_model=ActionCard)
async def reject_action_card(card_id: str) -> ActionCard:
    if card_id not in mock_data.ACTION_CARDS:
        raise HTTPException(404, f"action card {card_id} not found")
    card = mock_data.ACTION_CARDS[card_id]
    if card["state"] == "confirmed":
        raise HTTPException(409, "card already confirmed")
    card["state"] = "rejected"
    card["decided_at"] = datetime.utcnow().isoformat()
    card["decided_by"] = "demo_user"
    return ActionCard(**card)
