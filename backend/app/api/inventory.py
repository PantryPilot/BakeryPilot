from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import (
    ActionCard as ActionCardORM,
    Facility,
    Ingredient,
    IngredientLot,
    ProductionFormula,
    ProductionSchedule,
    WasteEvent,
)
from app.db.session import get_db
from app.models.inventory import IngredientLot as IngredientLotModel, SubstitutionCandidate
from app.services.spoilage import compute_spoilage_risk
from app.services.substitution import substitution_candidates

router = APIRouter(prefix="/api/lots", tags=["inventory"])
ingredients_router = APIRouter(prefix="/api/ingredients", tags=["inventory"])


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


class WriteOffRequest(BaseModel):
    reason: str = "manual write-off"
    quantity_kg: float | None = None  # defaults to full lot


@router.post("/{lot_id}/write_off", response_model=IngredientLotModel)
async def write_off_lot(
    lot_id: str,
    req: WriteOffRequest,
    db: AsyncSession = Depends(get_db),
) -> IngredientLotModel:
    lot = await db.get(IngredientLot, lot_id)
    if not lot:
        raise HTTPException(404, f"lot {lot_id} not found")
    if lot.quantity_kg <= 0:
        raise HTTPException(400, "lot is already empty")

    write_off_kg = float(req.quantity_kg if req.quantity_kg is not None else lot.quantity_kg)
    if write_off_kg <= 0 or write_off_kg > float(lot.quantity_kg):
        raise HTTPException(400, "quantity_kg must be > 0 and <= lot quantity")

    # Append-only inventory event.
    await db.execute(
        text(
            "INSERT INTO inventory_events (kind, lot_id, delta_kg, source, note) "
            "VALUES ('spoilage', :lot_id, :delta, 'ui_write_off', :note)"
        ),
        {"lot_id": str(lot.lot_id), "delta": -write_off_kg, "note": req.reason},
    )

    # Log a waste event for ESG counter.
    unit_cost = float(lot.unit_cost or 2.5)
    waste_ev = WasteEvent(
        event_at=datetime.now(timezone.utc),
        kind="spoilage",
        kg=write_off_kg,
        dollar_value=round(write_off_kg * unit_cost, 2),
        co2e_kg=round(write_off_kg * 0.0025, 4),
        source_table="ingredient_lots",
        source_id=str(lot.lot_id),
        avoided=False,
        facility_id=lot.facility_id,
        ingredient_id=lot.ingredient_id,
    )
    db.add(waste_ev)

    lot.quantity_kg = float(lot.quantity_kg) - write_off_kg
    await db.commit()
    await db.refresh(lot, ["ingredient"])

    today = date.today()
    risk = compute_spoilage_risk(float(lot.quantity_kg), lot.expiry_date, float(lot.quantity_kg) * 0.7, today)
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


class TransferRequest(BaseModel):
    destination_facility_id: str
    quantity_kg: float | None = None  # defaults to full lot


@router.post("/{lot_id}/transfer", response_model=IngredientLotModel)
async def transfer_lot(
    lot_id: str,
    req: TransferRequest,
    db: AsyncSession = Depends(get_db),
) -> IngredientLotModel:
    lot = await db.get(IngredientLot, lot_id)
    if not lot:
        raise HTTPException(404, f"lot {lot_id} not found")
    if lot.quantity_kg <= 0:
        raise HTTPException(400, "lot is already empty")
    if lot.expiry_date < date.today():
        raise HTTPException(400, "expired lots cannot be transferred; write off the lot instead")

    dest = await db.get(Facility, req.destination_facility_id)
    if not dest:
        raise HTTPException(404, f"facility {req.destination_facility_id} not found")

    if req.destination_facility_id == lot.facility_id:
        raise HTTPException(400, "destination is the same as current facility")

    transfer_kg = float(req.quantity_kg if req.quantity_kg is not None else lot.quantity_kg)
    if transfer_kg <= 0 or transfer_kg > float(lot.quantity_kg):
        raise HTTPException(400, "quantity_kg must be > 0 and <= lot quantity")

    # Append-only inventory event for the source lot.
    await db.execute(
        text(
            "INSERT INTO inventory_events (kind, lot_id, delta_kg, source, note) "
            "VALUES ('transfer', :lot_id, :delta, 'ui_transfer', :note)"
        ),
        {
            "lot_id": str(lot.lot_id),
            "delta": -transfer_kg,
            "note": f"transfer to {req.destination_facility_id}",
        },
    )

    full_transfer = transfer_kg >= float(lot.quantity_kg) - 1e-9
    if full_transfer:
        lot.facility_id = req.destination_facility_id
    else:
        lot.quantity_kg = float(lot.quantity_kg) - transfer_kg
        new_lot = IngredientLot(
            facility_id=req.destination_facility_id,
            ingredient_id=lot.ingredient_id,
            supplier_id=lot.supplier_id,
            quantity_kg=transfer_kg,
            received_date=lot.received_date,
            expiry_date=lot.expiry_date,
            storage_zone=lot.storage_zone,
            unit_cost=lot.unit_cost,
            lot_code=(lot.lot_code + "-T" if lot.lot_code else None),
        )
        db.add(new_lot)
    await db.commit()
    await db.refresh(lot, ["ingredient"])

    today = date.today()
    risk = compute_spoilage_risk(float(lot.quantity_kg), lot.expiry_date, float(lot.quantity_kg) * 0.7, today)
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


class TransferDraftRequest(BaseModel):
    lot_id: str
    destination_facility_id: str
    quantity_kg: float | None = None
    rationale: str | None = None


@router.post("/transfer/draft", response_model=dict)
async def draft_lot_transfer(
    req: TransferDraftRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a pending action_card for a lot transfer. The actual stock
    move runs inside _execute_transfer_card when the operator confirms the
    card — mirrors the procurement / scheduler human-in-the-loop pattern."""
    lot = await db.get(IngredientLot, req.lot_id)
    if not lot:
        raise HTTPException(404, f"lot {req.lot_id} not found")
    if float(lot.quantity_kg) <= 0:
        raise HTTPException(400, "lot is already empty")
    if lot.expiry_date < date.today():
        raise HTTPException(400, "expired lots cannot be transferred; write off the lot instead")

    dest = await db.get(Facility, req.destination_facility_id)
    if not dest:
        raise HTTPException(404, f"facility {req.destination_facility_id} not found")
    if req.destination_facility_id == lot.facility_id:
        raise HTTPException(400, "destination is the same as current facility")

    transfer_kg = float(req.quantity_kg if req.quantity_kg is not None else lot.quantity_kg)
    if transfer_kg <= 0 or transfer_kg > float(lot.quantity_kg):
        raise HTTPException(400, "quantity_kg must be > 0 and <= lot quantity")

    await db.refresh(lot, ["ingredient"])
    ingredient_name = lot.ingredient.name if lot.ingredient else lot.ingredient_id
    payload = {
        "ingredient_id": lot.ingredient_id,
        "from_facility_id": lot.facility_id,
        "facility_id": req.destination_facility_id,  # executor reads this as destination
        "quantity_kg": transfer_kg,
        "rationale": req.rationale or "",
        "title": f"Transfer {transfer_kg:g} kg {ingredient_name}: {lot.facility_id} → {req.destination_facility_id}",
        "lot_id": str(lot.lot_id),
        "agent": "InventoryAgent",
    }
    card = ActionCardORM(kind="transfer", payload=payload)
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return {
        "action_card_id": str(card.card_id),
        "kind": "transfer",
        "title": payload["title"],
    }


class SubstituteApplyRequest(BaseModel):
    substitute_sku_id: str
    quantity_kg: float


@router.post("/{lot_id}/substitute", response_model=dict)
async def apply_substitution(
    lot_id: str,
    req: SubstituteApplyRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    lot = await db.get(IngredientLot, lot_id)
    if not lot:
        raise HTTPException(404, f"lot {lot_id} not found")

    card = ActionCardORM(
        kind="schedule_change",
        payload={
            "title": f"Apply substitution for lot {lot_id}",
            "lot_id": lot_id,
            "ingredient_id": lot.ingredient_id,
            "substitute_sku_id": req.substitute_sku_id,
            "quantity_kg": req.quantity_kg,
            "facility_id": lot.facility_id,
            "agent": "InventoryAgent",
        },
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return {"action_card_id": str(card.card_id)}


class CreateLotRequest(BaseModel):
    facility_id: str
    ingredient_id: str
    supplier_id: str | None = None
    quantity_kg: float
    received_date: str
    expiry_date: str
    storage_zone: str = "dry"
    unit_cost: float | None = None
    lot_code: str | None = None


@router.post("", response_model=IngredientLotModel)
async def create_lot(
    req: CreateLotRequest, db: AsyncSession = Depends(get_db)
) -> IngredientLotModel:
    ing = await db.get(Ingredient, req.ingredient_id)
    if not ing:
        raise HTTPException(404, f"ingredient {req.ingredient_id} not found")
    fac = await db.get(Facility, req.facility_id)
    if not fac:
        raise HTTPException(404, f"facility {req.facility_id} not found")
    lot = IngredientLot(
        facility_id=req.facility_id,
        ingredient_id=req.ingredient_id,
        supplier_id=req.supplier_id,
        quantity_kg=req.quantity_kg,
        received_date=date.fromisoformat(req.received_date),
        expiry_date=date.fromisoformat(req.expiry_date),
        storage_zone=req.storage_zone,
        unit_cost=req.unit_cost,
        lot_code=req.lot_code,
    )
    db.add(lot)
    await db.commit()
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


@router.delete("/{lot_id}", response_model=dict)
async def delete_lot(lot_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    lot = await db.get(IngredientLot, lot_id)
    if not lot:
        raise HTTPException(404, f"lot {lot_id} not found")
    await db.delete(lot)
    await db.commit()
    return {"deleted": lot_id}


# ---------- Ingredients list (used by PO form dropdowns) ----------


class IngredientRow(BaseModel):
    ingredient_id: str
    name: str
    category: str | None = None
    default_storage_zone: str


@ingredients_router.get("", response_model=list[IngredientRow])
async def list_ingredients(db: AsyncSession = Depends(get_db)) -> list[IngredientRow]:
    rows = (await db.execute(select(Ingredient).order_by(Ingredient.name))).scalars().all()
    return [
        IngredientRow(
            ingredient_id=r.ingredient_id,
            name=r.name,
            category=r.category,
            default_storage_zone=r.default_storage_zone,
        )
        for r in rows
    ]


class CreateIngredientRequest(BaseModel):
    ingredient_id: str
    name: str
    category: str | None = None
    default_storage_zone: str = "dry"
    shelf_life_days_default: int = 365
    unit_of_measure: str = "kg"


class UpdateIngredientRequest(BaseModel):
    name: str | None = None
    category: str | None = None
    default_storage_zone: str | None = None
    shelf_life_days_default: int | None = None


@ingredients_router.post("", response_model=IngredientRow)
async def create_ingredient(
    req: CreateIngredientRequest, db: AsyncSession = Depends(get_db)
) -> IngredientRow:
    if await db.get(Ingredient, req.ingredient_id):
        raise HTTPException(409, f"ingredient {req.ingredient_id} already exists")
    ing = Ingredient(
        ingredient_id=req.ingredient_id,
        name=req.name,
        category=req.category,
        default_storage_zone=req.default_storage_zone,
        shelf_life_days_default=req.shelf_life_days_default,
        unit_of_measure=req.unit_of_measure,
        allergen_tags=[],
    )
    db.add(ing)
    await db.commit()
    return IngredientRow(
        ingredient_id=ing.ingredient_id,
        name=ing.name,
        category=ing.category,
        default_storage_zone=ing.default_storage_zone,
    )


@ingredients_router.patch("/{ingredient_id}", response_model=IngredientRow)
async def update_ingredient(
    ingredient_id: str, req: UpdateIngredientRequest, db: AsyncSession = Depends(get_db)
) -> IngredientRow:
    ing = await db.get(Ingredient, ingredient_id)
    if not ing:
        raise HTTPException(404, f"ingredient {ingredient_id} not found")
    if req.name is not None:
        ing.name = req.name
    if req.category is not None:
        ing.category = req.category
    if req.default_storage_zone is not None:
        ing.default_storage_zone = req.default_storage_zone
    if req.shelf_life_days_default is not None:
        ing.shelf_life_days_default = req.shelf_life_days_default
    await db.commit()
    return IngredientRow(
        ingredient_id=ing.ingredient_id,
        name=ing.name,
        category=ing.category,
        default_storage_zone=ing.default_storage_zone,
    )


@ingredients_router.delete("/{ingredient_id}", response_model=dict)
async def delete_ingredient(
    ingredient_id: str, db: AsyncSession = Depends(get_db)
) -> dict:
    ing = await db.get(Ingredient, ingredient_id)
    if not ing:
        raise HTTPException(404, f"ingredient {ingredient_id} not found")
    lot_count = (
        await db.execute(
            select(func.count()).select_from(IngredientLot).where(
                IngredientLot.ingredient_id == ingredient_id
            )
        )
    ).scalar_one()
    if lot_count > 0:
        raise HTTPException(
            409,
            f"ingredient {ingredient_id} has {lot_count} active lot(s); delete them first",
        )
    await db.delete(ing)
    await db.commit()
    return {"deleted": ingredient_id}
