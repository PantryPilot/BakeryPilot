from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ActionCard, MoqTaxEntry, ProductionRun, WasteEvent


async def aggregate(
    week_start: date,
    session: AsyncSession,
) -> dict:
    week_end = week_start + timedelta(days=6)
    ws = week_start.isoformat()
    we = week_end.isoformat()

    cards_q = select(
        ActionCard.kind, func.count().label("n")
    ).where(
        ActionCard.state == "confirmed",
        ActionCard.decided_at >= f"{ws}T00:00:00",
        ActionCard.decided_at <= f"{we}T23:59:59",
    ).group_by(ActionCard.kind)
    cards = {row.kind: row.n for row in (await session.execute(cards_q)).all()}

    waste_q = select(
        func.sum(WasteEvent.dollar_value).label("saved"),
        func.sum(WasteEvent.kg).label("kg"),
        func.sum(WasteEvent.co2e_kg).label("co2e"),
    ).where(
        WasteEvent.avoided == True,
        WasteEvent.event_at >= f"{ws}T00:00:00",
        WasteEvent.event_at <= f"{we}T23:59:59",
    )
    waste = (await session.execute(waste_q)).one()

    moq_q = select(func.sum(MoqTaxEntry.holding_cost).label("tax")).where(
        MoqTaxEntry.recorded_at >= f"{ws}T00:00:00",
        MoqTaxEntry.recorded_at <= f"{we}T23:59:59",
    )
    moq = (await session.execute(moq_q)).scalar()

    runs_q = select(func.count()).where(
        ProductionRun.started_at >= f"{ws}T00:00:00",
        ProductionRun.started_at <= f"{we}T23:59:59",
    )
    run_count = (await session.execute(runs_q)).scalar() or 0

    total_cards = sum(cards.values())
    if total_cards == 0 and run_count == 0 and not waste.saved:
        return {
            "week_start": ws,
            "week_end": we,
            "quiet_week": True,
            "action_cards_confirmed": 0,
            "cards_by_kind": {},
            "waste_avoided_usd": 0.0,
            "waste_avoided_kg": 0.0,
            "co2e_avoided_kg": 0.0,
            "moq_tax_accumulated_usd": 0.0,
            "production_runs": 0,
        }

    return {
        "week_start": ws,
        "week_end": we,
        "quiet_week": False,
        "action_cards_confirmed": total_cards,
        "cards_by_kind": cards,
        "waste_avoided_usd": float(waste.saved or 0),
        "waste_avoided_kg": float(waste.kg or 0),
        "co2e_avoided_kg": float(waste.co2e or 0),
        "moq_tax_accumulated_usd": float(moq or 0),
        "production_runs": int(run_count),
    }
