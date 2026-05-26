from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ActionCard as ActionCardORM, FinishedGoodsPallet
from app.db.session import get_db
from app.models.pallets import Pallet, RouteRequest

router = APIRouter(prefix="/api/pallets", tags=["pallets"])


def _days_remaining(p: FinishedGoodsPallet) -> int:
    produced = p.produced_at.date() if hasattr(p.produced_at, "date") else p.produced_at
    expiry = date.fromordinal(produced.toordinal() + p.shelf_life_days)
    return max(0, (expiry - date.today()).days)


def _to_model(p: FinishedGoodsPallet) -> Pallet:
    return Pallet(
        pallet_id=str(p.pallet_id),
        sku_id=p.sku_id,
        facility_id=p.facility_id,
        produced_at=p.produced_at.isoformat(),
        shelf_life_days=p.shelf_life_days,
        days_remaining=_days_remaining(p),
        quantity=p.quantity,
        status=p.status,
        committed_order_id=str(p.committed_order_id) if p.committed_order_id else None,
    )


@router.get("", response_model=list[Pallet])
async def list_pallets(
    facility_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[Pallet]:
    q = select(FinishedGoodsPallet).order_by(FinishedGoodsPallet.produced_at.desc())
    if facility_id:
        q = q.where(FinishedGoodsPallet.facility_id == facility_id)
    pallets = (await db.execute(q)).scalars().all()
    return [_to_model(p) for p in pallets]


@router.get("/stranded", response_model=list[Pallet])
async def stranded_pallets(
    days_horizon: int = Query(3, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
) -> list[Pallet]:
    q = select(FinishedGoodsPallet).where(
        FinishedGoodsPallet.status == "in_warehouse",
        FinishedGoodsPallet.committed_order_id == None,
    )
    pallets = (await db.execute(q)).scalars().all()
    stranded = [p for p in pallets if _days_remaining(p) <= days_horizon]
    stranded.sort(key=_days_remaining)
    return [_to_model(p) for p in stranded]


@router.post("/{pallet_id}/route", response_model=dict)
async def route_pallet(
    pallet_id: str, req: RouteRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    p = await db.get(FinishedGoodsPallet, pallet_id)
    if not p:
        raise HTTPException(404, f"pallet {pallet_id} not found")
    card = ActionCardORM(
        kind="transfer",
        payload={
            "pallet_id": pallet_id,
            "action": req.action,
            "target_facility_id": req.target_facility_id,
            "notes": req.notes,
            "proposed_at": datetime.now(timezone.utc).isoformat(),
            "title": f"Route pallet {pallet_id[:8]} — {req.action}",
            "agent": "InventoryAgent",
        },
    )
    db.add(card)
    await db.commit()
    return {"action_card_id": str(card.card_id)}
