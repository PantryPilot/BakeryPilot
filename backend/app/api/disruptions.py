from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import DisruptionSignal as DisruptionSignalORM
from app.db.session import get_db
from app.models.suppliers import DisruptionSignal

router = APIRouter(prefix="/api/disruptions", tags=["disruptions"])


@router.get("", response_model=list[DisruptionSignal])
async def list_disruptions(
    supplier_id: str | None = Query(None),
    min_severity: float = Query(0.0, ge=0.0, le=1.0),
    db: AsyncSession = Depends(get_db),
) -> list[DisruptionSignal]:
    q = (
        select(DisruptionSignalORM)
        .order_by(DisruptionSignalORM.observed_at.desc())
    )
    if supplier_id:
        q = q.where(DisruptionSignalORM.supplier_id == supplier_id)
    if min_severity > 0:
        q = q.where(DisruptionSignalORM.severity >= min_severity)

    rows = (await db.execute(q)).scalars().all()
    return [
        DisruptionSignal(
            signal_id=str(r.signal_id),
            supplier_id=r.supplier_id,
            ingredient_id=r.ingredient_id,
            kind=r.kind,
            severity=float(r.severity),
            source=r.source,
            message=r.message,
            observed_at=r.observed_at.isoformat(),
        )
        for r in rows
    ]
