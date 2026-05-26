from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import IngredientLot, ProductionFormula, Sku


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

    results = []
    for sku in sku_rows:
        non_blocked = [f for f in sku.formulas if f.ingredient_id != blocked_ingredient_id]
        if len(non_blocked) != len(sku.formulas):
            continue

        lot_q = select(IngredientLot).where(IngredientLot.quantity_kg > 0)
        if facility_id:
            lot_q = lot_q.where(IngredientLot.facility_id == facility_id)
        lots = (await session.execute(lot_q)).scalars().all()
        stock = {l.ingredient_id: l.quantity_kg for l in lots}

        achievable = int(
            min(
                stock.get(f.ingredient_id, 0) / f.kg_per_unit
                for f in non_blocked
                if f.kg_per_unit > 0
            )
        ) if non_blocked else 0

        results.append({
            "sku_id": sku.sku_id,
            "sku_name": sku.name,
            "achievable_quantity": achievable,
            "margin_score": float(sku.margin_per_unit or 0),
            "reason": f"Producible without {blocked_ingredient_id}; ~{achievable} units achievable from current stock",
        })

    results.sort(key=lambda x: x["margin_score"], reverse=True)
    return results[:5]
