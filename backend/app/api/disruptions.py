from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import DisruptionSignal as DisruptionSignalORM
from app.db.session import get_db
from app.models.suppliers import DisruptionSignal

router = APIRouter(prefix="/api/disruptions", tags=["disruptions"])


@router.get("", response_model=list[DisruptionSignal])
async def list_disruptions(
    supplier_id: str | None = Query(None, description="Exact supplier_id match."),
    ingredient_id: str | None = Query(None, description="Exact ingredient_id match."),
    kinds: str | None = Query(
        None,
        description="Comma-separated kind whitelist, e.g. 'heavy_rain,wind,news,commodity'.",
    ),
    sources: str | None = Query(
        None,
        description=(
            "Comma-separated source whitelist, e.g. 'open_meteo,gdelt'. "
            "Often more stable than `kinds` — open_meteo writes one row per "
            "condition (heat/frost/heavy_rain/wind), but `source='open_meteo'` "
            "matches all of them with one filter."
        ),
    ),
    include_unscoped: bool = Query(
        False,
        description=(
            "When True, also include rows where both supplier_id and ingredient_id "
            "are NULL — i.e. broad regional weather + macro news signals. "
            "Useful for risk reasoning that needs context beyond supplier-specific events."
        ),
    ),
    since_days: int | None = Query(
        None,
        ge=1,
        le=365,
        description="Restrict to rows whose observed_at is within the last N days.",
    ),
    min_severity: float = Query(0.0, ge=0.0, le=1.0),
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> list[DisruptionSignal]:
    q = select(DisruptionSignalORM).order_by(DisruptionSignalORM.observed_at.desc())

    # Scope filters: supplier/ingredient/unscoped combine as an OR group.
    scope_clauses = []
    if supplier_id:
        scope_clauses.append(DisruptionSignalORM.supplier_id == supplier_id)
    if ingredient_id:
        scope_clauses.append(DisruptionSignalORM.ingredient_id == ingredient_id)
    if include_unscoped:
        scope_clauses.append(
            (DisruptionSignalORM.supplier_id.is_(None))
            & (DisruptionSignalORM.ingredient_id.is_(None))
        )
    if scope_clauses:
        q = q.where(or_(*scope_clauses))

    if kinds:
        kind_list = [k.strip() for k in kinds.split(",") if k.strip()]
        if kind_list:
            q = q.where(DisruptionSignalORM.kind.in_(kind_list))

    if sources:
        source_list = [s.strip() for s in sources.split(",") if s.strip()]
        if source_list:
            q = q.where(DisruptionSignalORM.source.in_(source_list))

    if since_days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=since_days)
        q = q.where(DisruptionSignalORM.observed_at >= cutoff)

    if min_severity > 0:
        q = q.where(DisruptionSignalORM.severity >= min_severity)

    q = q.limit(limit)

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
