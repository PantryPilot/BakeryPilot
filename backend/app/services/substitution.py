from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Facility, Ingredient, IngredientLot, Sku


async def substitution_candidates(
    blocked_ingredient_id: str,
    facility_id: str | None,
    session: AsyncSession,
) -> list[dict]:
    sku_rows = (
        await session.execute(
            select(Sku).options(selectinload(Sku.formulas))
        )
    ).scalars().all()

    # Build facility lookup once
    facility_map: dict[str, str] = {}
    if facility_id:
        f = await session.get(Facility, facility_id)
        if f:
            facility_map[f.facility_id] = f.name
    else:
        facilities = (await session.execute(select(Facility))).scalars().all()
        facility_map = {f.facility_id: f.name for f in facilities}

    # Allergens come from the Ingredient table.
    ingredient_allergens: dict[str, list[str]] = {
        ing.ingredient_id: list(ing.allergen_tags or [])
        for ing in (await session.execute(select(Ingredient))).scalars().all()
    }

    results = []
    for sku in sku_rows:
        non_blocked = [f for f in sku.formulas if f.ingredient_id != blocked_ingredient_id]
        if len(non_blocked) != len(sku.formulas):
            continue

        lot_q = select(IngredientLot).where(IngredientLot.quantity_kg > 0)
        if facility_id:
            lot_q = lot_q.where(IngredientLot.facility_id == facility_id)
        lots = (await session.execute(lot_q)).scalars().all()
        stock: dict[str, float] = {}
        for lot in lots:
            stock[lot.ingredient_id] = stock.get(lot.ingredient_id, 0.0) + float(lot.quantity_kg or 0)

        # Track which facility this batch could ship from (first one with stock).
        candidate_facility_id: str | None = None
        for f in non_blocked:
            for lot in lots:
                if lot.ingredient_id == f.ingredient_id:
                    candidate_facility_id = candidate_facility_id or lot.facility_id
                    break

        achievable = int(
            min(
                stock.get(f.ingredient_id, 0.0) / float(f.kg_per_unit)
                for f in non_blocked
                if float(f.kg_per_unit) > 0
            )
        ) if non_blocked else 0

        allergens: set[str] = set()
        for f in non_blocked:
            for a in ingredient_allergens.get(f.ingredient_id, []):
                allergens.add(a)

        results.append({
            "sku_id": sku.sku_id,
            "sku_name": sku.name,
            "achievable_quantity": achievable,
            "margin_score": float(sku.margin_per_unit or 0),
            "reason": f"Producible without {blocked_ingredient_id}; ~{achievable} units achievable from current stock",
            "facility_id": candidate_facility_id or facility_id,
            "facility_name": facility_map.get(candidate_facility_id or facility_id or "", None),
            "allergens": sorted(allergens),
        })

    results.sort(key=lambda x: x["margin_score"], reverse=True)
    return results[:5]
