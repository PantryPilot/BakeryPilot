"""Pallets router: finished_goods_pallets, FEFO routing, recovery options."""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

from app import mock_data
from app.models.pallets import Pallet, RouteRequest

router = APIRouter(prefix="/api/pallets", tags=["pallets"])


@router.get("", response_model=list[Pallet])
async def list_pallets(facility_id: str | None = Query(None)) -> list[Pallet]:
    rows = mock_data.FINISHED_PALLETS
    if facility_id:
        rows = [p for p in rows if p["facility_id"] == facility_id]
    return [Pallet(**p) for p in rows]


@router.get("/stranded", response_model=list[Pallet])
async def stranded_pallets(
    days_horizon: int = Query(3, ge=1, le=30),
) -> list[Pallet]:
    """Pallets within `days_horizon` of expiry with no committed outbound order."""
    rows = [
        p for p in mock_data.FINISHED_PALLETS
        if p["status"] == "in_warehouse"
        and p["days_remaining"] <= days_horizon
        and p["committed_order_id"] is None
    ]
    rows = sorted(rows, key=lambda p: p["days_remaining"])
    return [Pallet(**p) for p in rows]


@router.post("/{pallet_id}/route", response_model=dict)
async def route_pallet(pallet_id: str, req: RouteRequest) -> dict:
    pallet = next((p for p in mock_data.FINISHED_PALLETS if p["pallet_id"] == pallet_id), None)
    if not pallet:
        raise HTTPException(404, f"pallet {pallet_id} not found")
    card = mock_data.make_action_card(
        kind="transfer",
        payload={
            "pallet_id": pallet_id,
            "action": req.action,
            "target_facility_id": req.target_facility_id,
            "notes": req.notes,
            "proposed_at": datetime.utcnow().isoformat(),
        },
    )
    return {"action_card_id": card["card_id"]}
