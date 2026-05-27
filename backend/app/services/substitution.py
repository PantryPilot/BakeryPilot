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


async def production_substitution_candidates(
    requested_units: int,
    facility_id: str,
    session: AsyncSession,
    *,
    exclude_sku_id: str | None = None,
) -> list[dict]:
    """Order-level substitution options for production.

    Returns SKUs that can be produced at the target facility using the full
    recipe, with achievable quantity computed from current on-hand stock.
    """
    if requested_units <= 0:
        return []

    sku_rows = (
        await session.execute(
            select(Sku).options(selectinload(Sku.formulas))
        )
    ).scalars().all()

    lots = (
        await session.execute(
            select(IngredientLot).where(
                IngredientLot.facility_id == facility_id,
                IngredientLot.quantity_kg > 0,
            )
        )
    ).scalars().all()
    stock_by_ingredient: dict[str, float] = {}
    for lot in lots:
        stock_by_ingredient[lot.ingredient_id] = stock_by_ingredient.get(lot.ingredient_id, 0.0) + float(lot.quantity_kg or 0)

    results: list[dict] = []
    for sku in sku_rows:
        if exclude_sku_id and sku.sku_id == exclude_sku_id:
            continue
        if not sku.formulas:
            continue

        positive_formulas = [f for f in sku.formulas if float(f.kg_per_unit) > 0]
        if not positive_formulas:
            continue

        achievable = int(
            min(
                stock_by_ingredient.get(f.ingredient_id, 0.0) / float(f.kg_per_unit)
                for f in positive_formulas
            )
        )
        if achievable <= 0:
            continue

        fully_covering = achievable >= requested_units
        results.append(
            {
                "sku_id": sku.sku_id,
                "sku_name": sku.name,
                "achievable_quantity": achievable,
                "covers_requested_units": fully_covering,
                "margin_score": float(sku.margin_per_unit or 0),
                "reason": (
                    f"Can produce requested {requested_units} units with current stock"
                    if fully_covering
                    else f"Only {achievable} units possible with current stock"
                ),
            }
        )

    results.sort(
        key=lambda x: (bool(x["covers_requested_units"]), float(x["margin_score"])),
        reverse=True,
    )
    return results[:5]
