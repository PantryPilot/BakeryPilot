from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import DisruptionSignal, Supplier


async def score_supplier(supplier_id: str, session: AsyncSession) -> float:
    ninety_days_ago = datetime.utcnow() - timedelta(days=90)
    result = await session.execute(
        select(func.avg(DisruptionSignal.severity)).where(
            DisruptionSignal.supplier_id == supplier_id,
            DisruptionSignal.observed_at >= ninety_days_ago,
        )
    )
    avg_severity = result.scalar()
    if avg_severity is None:
        return 0.0

    supplier = await session.get(Supplier, supplier_id)
    if supplier and supplier.on_time_rate is not None:
        miss_penalty = max(0.0, 1.0 - float(supplier.on_time_rate))
    else:
        miss_penalty = 0.0

    score = float(avg_severity) * 0.6 + miss_penalty * 0.4
    return min(1.0, round(score, 3))


async def all_supplier_scores(session: AsyncSession) -> dict[str, float]:
    suppliers = (await session.execute(select(Supplier))).scalars().all()
    return {s.supplier_id: await score_supplier(s.supplier_id, session) for s in suppliers}
