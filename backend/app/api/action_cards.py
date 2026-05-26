from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ActionCard as ActionCardORM,
    NotificationDraft,
    SupplierOrder,
    SupplierOrderItem,
)
from app.db.session import get_db
from app.models.common import ActionCard

router = APIRouter(prefix="/api/action_cards", tags=["action_cards"])


def _to_model(card: ActionCardORM) -> ActionCard:
    return ActionCard(
        card_id=str(card.card_id),
        kind=card.kind,
        payload=card.payload,
        state=card.state,
        created_at=card.created_at.isoformat(),
        decided_at=card.decided_at.isoformat() if card.decided_at else None,
        decided_by=card.decided_by,
    )


@router.get("", response_model=list[ActionCard])
async def list_action_cards(
    state: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[ActionCard]:
    q = select(ActionCardORM).order_by(ActionCardORM.created_at.desc())
    if state:
        q = q.where(ActionCardORM.state == state)
    cards = (await db.execute(q)).scalars().all()
    return [_to_model(c) for c in cards]


@router.get("/{card_id}", response_model=ActionCard)
async def get_action_card(card_id: str, db: AsyncSession = Depends(get_db)) -> ActionCard:
    card = await db.get(ActionCardORM, card_id)
    if not card:
        raise HTTPException(404, f"action card {card_id} not found")
    return _to_model(card)


@router.post("/{card_id}/confirm", response_model=ActionCard)
async def confirm_action_card(
    card_id: str, db: AsyncSession = Depends(get_db)
) -> ActionCard:
    card = await db.get(ActionCardORM, card_id)
    if not card:
        raise HTTPException(404, f"action card {card_id} not found")
    if card.state == "rejected":
        raise HTTPException(409, "card already rejected")
    if card.state == "pending":
        card.state = "confirmed"
        card.decided_at = datetime.now(timezone.utc)
        card.decided_by = "demo_user"

        if card.kind == "supplier_order":
            p = card.payload
            order = SupplierOrder(
                supplier_id=p["supplier_id"],
                facility_id=p.get("facility_id", "plant-toronto"),
                status="confirmed",
                confirmed_at=card.decided_at,
                action_card_id=card.card_id,
                delivery_date=p.get("delivery_date"),
            )
            db.add(order)
            await db.flush()
            for item in p.get("items", []):
                db.add(SupplierOrderItem(
                    order_id=order.order_id,
                    ingredient_id=item["ingredient_id"],
                    quantity_kg=item["quantity_kg"],
                    unit_price=item.get("unit_price", 0),
                ))

        elif card.kind == "notify":
            for stakeholder in card.payload.get("stakeholders", []):
                draft = NotificationDraft(
                    kind=card.payload.get("kind", "notify"),
                    recipients=[stakeholder.get("email", "")],
                    subject=card.payload.get("subject", ""),
                    body_md=card.payload.get("body_md", ""),
                    gmail_draft_url=f"https://mail.google.com/mail/u/0/#drafts/mock-{card.card_id}",
                    action_card_id=card.card_id,
                )
                db.add(draft)

        await db.commit()
        await db.refresh(card)
    return _to_model(card)


@router.post("/{card_id}/reject", response_model=ActionCard)
async def reject_action_card(
    card_id: str, db: AsyncSession = Depends(get_db)
) -> ActionCard:
    card = await db.get(ActionCardORM, card_id)
    if not card:
        raise HTTPException(404, f"action card {card_id} not found")
    if card.state == "confirmed":
        raise HTTPException(409, "card already confirmed")
    if card.state == "pending":
        card.state = "rejected"
        card.decided_at = datetime.now(timezone.utc)
        card.decided_by = "demo_user"
        await db.commit()
        await db.refresh(card)
    return _to_model(card)
