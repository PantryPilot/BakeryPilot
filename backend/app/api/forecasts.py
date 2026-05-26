from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import DemandForecast
from app.db.session import get_db
from app.models.forecasts import DemandForecastPoint

router = APIRouter(prefix="/api/forecasts", tags=["forecasts"])


@router.get("", response_model=list[DemandForecastPoint])
async def list_forecasts(
    sku_id: str | None = Query(None),
    days: int = Query(14, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
) -> list[DemandForecastPoint]:
    q = (
        select(DemandForecast)
        .order_by(DemandForecast.forecast_date)
        .limit(days * 12)
    )
    if sku_id:
        q = q.where(DemandForecast.sku_id == sku_id)
    rows = (await db.execute(q)).scalars().all()
    return [
        DemandForecastPoint(
            sku_id=r.sku_id,
            forecast_date=r.forecast_date.isoformat(),
            quantity_expected=int(r.quantity_expected),
            quantity_low=int(r.quantity_low or r.quantity_expected),
            quantity_high=int(r.quantity_high or r.quantity_expected),
            model_version=r.model_version,
            generated_at=r.generated_at.isoformat(),
        )
        for r in rows
    ]
