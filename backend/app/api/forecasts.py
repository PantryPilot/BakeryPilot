"""Forecasts router: per-SKU demand forecast + bands."""

from fastapi import APIRouter, Query

from app import mock_data
from app.models.forecasts import DemandForecastPoint

router = APIRouter(prefix="/api/forecasts", tags=["forecasts"])


@router.get("", response_model=list[DemandForecastPoint])
async def list_forecasts(
    sku_id: str | None = Query(None),
    days: int = Query(14, ge=1, le=30),
) -> list[DemandForecastPoint]:
    rows = mock_data.DEMAND_FORECASTS
    if sku_id:
        rows = [r for r in rows if r["sku_id"] == sku_id]
    return [DemandForecastPoint(**r) for r in rows[: days * 6]]
