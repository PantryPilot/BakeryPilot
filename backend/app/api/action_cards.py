from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.db.models import (
    ActionCard as ActionCardORM,
    IngredientLot,
    InventoryEvent,
    NotificationDraft,
    ProductionLine,
    ProductionOrder,
    Sku,
    SupplierOrder,
    SupplierOrderItem,
)
from app.services.schedule_apply import apply_schedule_change
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
            # If a draft SupplierOrder was created by /orders/draft, promote it
            # to confirmed instead of creating a duplicate.
            existing = (
                await db.execute(
                    select(SupplierOrder).where(SupplierOrder.action_card_id == card.card_id)
                )
            ).scalar_one_or_none()
            if existing:
                existing.status = "confirmed"
                existing.confirmed_at = card.decided_at
            else:
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

        elif card.kind == "transfer":
            await _execute_transfer_card(card.payload, str(card.card_id), db)
            flag_modified(card, "payload")

        elif card.kind == "schedule_change":
            await _execute_schedule_change_card(card.payload, str(card.card_id), db)
            flag_modified(card, "payload")

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


# ---------------------------------------------------------------------------
# Card executors — make confirmation actually mutate inventory / orders.
# ---------------------------------------------------------------------------

async def _execute_transfer_card(payload: dict[str, Any], card_id: str, db: AsyncSession) -> None:
    """Move ingredient lots between facilities to satisfy a transfer plan.

    Two payload shapes supported:
      * Multi-item plan: payload["items"] = [{ingredient_id, from_facility_id, quantity_kg}, ...]
      * Single transfer: payload contains ingredient_id, from_facility_id, quantity_kg
    Lots are picked FIFO by expiry from the source facility. Partial draws
    split the source lot: the consumed kg moves to a brand-new lot at the
    destination, preserving lot expiry, supplier, unit cost, lot_code.
    """
    destination_facility = payload.get("facility_id")
    if not destination_facility:
        raise HTTPException(422, "transfer card payload missing facility_id (destination)")

    items_raw = payload.get("items")
    if not items_raw:
        if all(k in payload for k in ("ingredient_id", "from_facility_id", "quantity_kg")):
            items_raw = [{
                "ingredient_id": payload["ingredient_id"],
                "from_facility_id": payload["from_facility_id"],
                "quantity_kg": payload["quantity_kg"],
            }]
        else:
            return  # nothing actionable
    moved: list[dict] = []
    for item in items_raw:
        ingredient_id = item["ingredient_id"]
        from_facility = item["from_facility_id"]
        qty_needed = float(item["quantity_kg"])
        if qty_needed <= 0:
            continue
        remaining = qty_needed
        lots = (
            await db.execute(
                select(IngredientLot)
                .where(
                    IngredientLot.facility_id == from_facility,
                    IngredientLot.ingredient_id == ingredient_id,
                    IngredientLot.quantity_kg > 0,
                )
                .order_by(IngredientLot.expiry_date.asc())
            )
        ).scalars().all()
        for lot in lots:
            if remaining <= 0:
                break
            available = float(lot.quantity_kg)
            if available <= 0:
                continue
            take = min(available, remaining)
            if take >= available - 1e-9:
                # Full lot transfer — re-home the lot.
                lot.facility_id = destination_facility
                db.add(InventoryEvent(
                    kind="transfer",
                    lot_id=lot.lot_id,
                    delta_kg=-take,
                    source="action_card_transfer",
                    source_ref=card_id,
                    note=f"full lot moved {from_facility} -> {destination_facility}",
                ))
            else:
                # Partial transfer — create a new lot at the destination, decrement source.
                lot.quantity_kg = available - take
                new_lot = IngredientLot(
                    facility_id=destination_facility,
                    ingredient_id=ingredient_id,
                    supplier_id=lot.supplier_id,
                    quantity_kg=take,
                    received_date=lot.received_date,
                    expiry_date=lot.expiry_date,
                    storage_zone=lot.storage_zone,
                    unit_cost=lot.unit_cost,
                    lot_code=(lot.lot_code + "-T" if lot.lot_code else None),
                )
                db.add(new_lot)
                db.add(InventoryEvent(
                    kind="transfer",
                    lot_id=lot.lot_id,
                    delta_kg=-take,
                    source="action_card_transfer",
                    source_ref=card_id,
                    note=f"split: {take} kg moved to {destination_facility}",
                ))
            remaining -= take
            moved.append({
                "ingredient_id": ingredient_id,
                "from": from_facility,
                "to": destination_facility,
                "kg": take,
            })
        if remaining > 1e-6:
            # Record the unsatisfied portion so the audit trail tells the truth.
            moved.append({
                "ingredient_id": ingredient_id,
                "from": from_facility,
                "to": destination_facility,
                "kg_unsatisfied": round(remaining, 3),
            })

    # Stash result into the payload for downstream visibility.
    payload["executed_at"] = datetime.now(timezone.utc).isoformat()
    payload["executed_movements"] = moved


async def _execute_schedule_change_card(payload: dict[str, Any], card_id: str, db: AsyncSession) -> None:
    """Reassign a production line to a substitute SKU.

    On confirm: supersedes the matching ``production_schedules`` row, inserts an
    approved replacement, cancels the active ``production_orders`` row for
    ``requested_by_sku_id``, and creates a new planned order for the substitute.
    """
    substitute_sku_id = payload.get("substitute_sku_id")
    requested_by_sku_id = payload.get("requested_by_sku_id")
    requested_units = int(payload.get("requested_units") or 0)
    facility_id = payload.get("facility_id")
    if not (substitute_sku_id and facility_id and requested_units > 0):
        return

    substitute = await db.get(Sku, substitute_sku_id)
    if substitute is None:
        return

    # Find the most recent active order matching the original SKU at this facility.
    candidates = (
        await db.execute(
            select(ProductionOrder)
            .where(
                ProductionOrder.facility_id == facility_id,
                ProductionOrder.sku_id == requested_by_sku_id,
                ProductionOrder.status.in_(("planned", "producing", "paused")),
            )
            .order_by(ProductionOrder.created_at.desc())
        )
    ).scalars().all()

    original = candidates[0] if candidates else None
    now = datetime.now(timezone.utc)
    line_id: str | None = payload.get("line_id")
    if original:
        line_id = original.line_id
        original.status = "cancelled"
        original.updated_at = now
        original.notes = (original.notes or "") + f"\nSubstituted via action card {card_id}"
        line = await db.get(ProductionLine, original.line_id)
        if line and line.current_order_id == original.order_id:
            line.status = "setup"
            line.current_order_id = None

    if line_id is None:
        line = (
            await db.execute(
                select(ProductionLine)
                .where(ProductionLine.facility_id == facility_id, ProductionLine.status == "idle")
                .limit(1)
            )
        ).scalars().first()
        if line is None:
            return
        line_id = line.line_id

    new_order = ProductionOrder(
        facility_id=facility_id,
        line_id=line_id,
        sku_id=substitute_sku_id,
        quantity_units=requested_units,
        status="planned",
        notes=f"Auto-created from substitution action card {card_id}",
        created_at=now,
        updated_at=now,
    )
    db.add(new_order)
    await db.flush()

    line = await db.get(ProductionLine, line_id)
    if line is not None:
        line.status = "setup"
        line.current_order_id = new_order.order_id

    new_schedule = await apply_schedule_change(
        db,
        payload=payload,
        card_id=card_id,
        facility_id=facility_id,
        line_id=line_id,
        substitute_sku_id=substitute_sku_id,
        requested_units=requested_units,
        now=now,
    )

    payload["executed_at"] = now.isoformat()
    payload["new_production_order_id"] = str(new_order.order_id)
    payload["new_schedule_id"] = str(new_schedule.schedule_id)
    if original:
        payload["cancelled_production_order_id"] = str(original.order_id)
