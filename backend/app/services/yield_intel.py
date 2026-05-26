from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ProductionFormula, ProductionRun


async def compute_variance(run_id: str, session: AsyncSession) -> dict:
    run = await session.get(ProductionRun, run_id)
    if not run:
        return {"error": f"run {run_id} not found"}

    formulas = (
        await session.execute(
            select(ProductionFormula).where(ProductionFormula.sku_id == run.sku_id)
        )
    ).scalars().all()

    actual: dict = run.actual_ingredient_consumption or {}
    items = []
    total_leak = 0.0

    for formula in formulas:
        if run.actual_kg and run.planned_kg and run.planned_kg > 0:
            scale = run.actual_kg / run.planned_kg
        else:
            scale = 1.0

        theoretical_kg = float(formula.kg_per_unit) * scale * (run.planned_kg or 1)
        actual_kg_val = float(actual.get(formula.ingredient_id, theoretical_kg))
        variance_pct = (actual_kg_val - theoretical_kg) / max(theoretical_kg, 0.001) * 100
        unit_cost = 1.0
        dollar_leak = (actual_kg_val - theoretical_kg) * unit_cost

        items.append({
            "ingredient_id": formula.ingredient_id,
            "theoretical_kg": round(theoretical_kg, 3),
            "actual_kg": round(actual_kg_val, 3),
            "variance_pct": round(variance_pct, 2),
            "dollar_leak": round(dollar_leak, 2),
        })
        total_leak += dollar_leak

    return {
        "run_id": str(run.run_id),
        "line_id": run.line_id,
        "facility_id": run.facility_id,
        "sku_id": run.sku_id,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "ended_at": run.ended_at.isoformat() if run.ended_at else None,
        "actual_vs_theoretical": items,
        "total_dollar_leak": round(total_leak, 2),
        "status": run.status,
        "equipment_notes": run.equipment_notes,
    }
