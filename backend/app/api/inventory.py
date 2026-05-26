from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import IngredientLot, Ingredient, ProductionFormula, ProductionSchedule
from app.db.session import get_db
from app.models.inventory import IngredientLot as IngredientLotModel, SubstitutionCandidate
from app.services.spoilage import compute_spoilage_risk
from app.services.substitution import substitution_candidates

router = APIRouter(prefix="/api/lots", tags=["inventory"])


def _scheduled_kg(lot: IngredientLot, schedules_by_ingredient: dict) -> float:
    return schedules_by_ingredient.get(lot.ingredient_id, 0.0)


async def _lots_with_risk(
    session: AsyncSession,
    facility_id: str | None = None,
) -> list[dict]:
    q = (
        select(IngredientLot)
        .options(selectinload(IngredientLot.ingredient))
        .where(IngredientLot.quantity_kg > 0)
    )
    if facility_id:
        q = q.where(IngredientLot.facility_id == facility_id)

    lots = (await session.execute(q)).scalars().all()
    today = date.today()

    results = []
    for lot in lots:
        risk = compute_spoilage_risk(
            quantity_kg=float(lot.quantity_kg),
            expiry_date=lot.expiry_date,
            kg_scheduled_before_expiry=float(lot.quantity_kg) * 0.7,
            today=today,
        )
        results.append({
            "lot_id": str(lot.lot_id),
            "facility_id": lot.facility_id,
            "ingredient_id": lot.ingredient_id,
            "ingredient_name": lot.ingredient.name if lot.ingredient else lot.ingredient_id,
            "quantity_kg": float(lot.quantity_kg),
            "expiry_date": lot.expiry_date.isoformat(),
            "storage_zone": lot.storage_zone,
            "received_date": lot.received_date.isoformat(),
            "supplier_id": lot.supplier_id,
            "spoilage_risk_score": risk,
        })
    return results


@router.get("", response_model=list[IngredientLotModel])
async def list_lots(
    facility_id: str | None = Query(None),
    sort_by_risk: bool = Query(True),
    db: AsyncSession = Depends(get_db),
) -> list[IngredientLotModel]:
    rows = await _lots_with_risk(db, facility_id)
    if sort_by_risk:
        rows = sorted(rows, key=lambda r: r["spoilage_risk_score"], reverse=True)
    return [IngredientLotModel(**r) for r in rows]


@router.get("/{lot_id}", response_model=IngredientLotModel)
async def get_lot(lot_id: str, db: AsyncSession = Depends(get_db)) -> IngredientLotModel:
    lot = await db.get(IngredientLot, lot_id)
    if not lot:
        raise HTTPException(404, f"lot {lot_id} not found")
    await db.refresh(lot, ["ingredient"])
    today = date.today()
    risk = compute_spoilage_risk(
        float(lot.quantity_kg), lot.expiry_date, float(lot.quantity_kg) * 0.7, today
    )
    return IngredientLotModel(
        lot_id=str(lot.lot_id),
        facility_id=lot.facility_id,
        ingredient_id=lot.ingredient_id,
        ingredient_name=lot.ingredient.name if lot.ingredient else lot.ingredient_id,
        quantity_kg=float(lot.quantity_kg),
        expiry_date=lot.expiry_date.isoformat(),
        storage_zone=lot.storage_zone,
        received_date=lot.received_date.isoformat(),
        supplier_id=lot.supplier_id,
        spoilage_risk_score=risk,
    )


@router.get("/{lot_id}/substitutions", response_model=list[SubstitutionCandidate])
async def substitutions(
    lot_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[SubstitutionCandidate]:
    lot = await db.get(IngredientLot, lot_id)
    if not lot:
        raise HTTPException(404, f"lot {lot_id} not found")
    candidates = await substitution_candidates(lot.ingredient_id, lot.facility_id, db)
    return [SubstitutionCandidate(**c) for c in candidates]
