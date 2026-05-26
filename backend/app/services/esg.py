from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import WasteEvent


async def compute_running_counter(session: AsyncSession, facility_id: str | None = None) -> dict:
    q = select(
        func.sum(WasteEvent.kg).label("kg_avoided"),
        func.sum(WasteEvent.dollar_value).label("dollars_saved"),
        func.sum(WasteEvent.co2e_kg).label("co2e_avoided"),
    ).where(WasteEvent.avoided == True)

    if facility_id:
        q = q.where(WasteEvent.facility_id == facility_id)

    row = (await session.execute(q)).one()
    return {
        "kg_avoided": float(row.kg_avoided or 0),
        "dollars_saved": float(row.dollars_saved or 0),
        "co2e_avoided_kg": float(row.co2e_avoided or 0),
        "period_start": (datetime.utcnow() - timedelta(days=90)).date().isoformat(),
        "period_end": datetime.utcnow().date().isoformat(),
    }


async def list_waste_events(
    session: AsyncSession,
    facility_id: str | None = None,
    limit: int = 50,
) -> list[dict]:
    q = (
        select(WasteEvent)
        .order_by(WasteEvent.event_at.desc())
        .limit(limit)
    )
    if facility_id:
        q = q.where(WasteEvent.facility_id == facility_id)

    rows = (await session.execute(q)).scalars().all()
    return [
        {
            "event_id": str(r.waste_event_id),
            "ts": r.event_at.isoformat(),
            "lot_id": r.source_id,
            "ingredient_name": r.ingredient_id or "unknown",
            "quantity_kg": float(r.kg),
            "value_usd": float(r.dollar_value or 0),
            "reason": r.kind,
            "avoided": r.avoided,
            "facility_id": r.facility_id,
        }
        for r in rows
    ]


async def get_esg_patterns(session: AsyncSession) -> list[dict]:
    q = (
        select(
            WasteEvent.kind,
            WasteEvent.facility_id,
            WasteEvent.ingredient_id,
            func.count().label("occurrences"),
            func.sum(WasteEvent.dollar_value).label("total_value"),
        )
        .group_by(WasteEvent.kind, WasteEvent.facility_id, WasteEvent.ingredient_id)
        .order_by(func.count().desc())
        .limit(10)
    )
    rows = (await session.execute(q)).all()
    patterns = []
    for i, row in enumerate(rows):
        patterns.append({
            "pattern_id": f"pat_{i+1:03d}",
            "description": f"{row.kind} events for {row.ingredient_id or 'unknown'} at {row.facility_id or 'all facilities'}",
            "occurrences": row.occurrences,
            "root_cause": f"Recurring {row.kind} pattern — review {row.ingredient_id or 'ingredient'} handling procedures",
            "proposed_rule": f"Trigger alert when {row.kind} events exceed 2 per week for this ingredient-facility pair",
        })
    return patterns
