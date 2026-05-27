"""Retailer list with derived po_ratio and shelf_risk.

No new columns added — values are computed from existing tables:
- `po_ratio` = sum(open retailer_orders.quantity_units) / sum(demand_forecasts.quantity_expected)
  over the next 14 days. Clamped to [0.1, 2.0].
- `shelf_risk` = bucket of red/amber/green pallets remaining for this retailer's
  committed orders (uses finished_goods_pallets shelf-life days).
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    DemandForecast,
    FinishedGoodsPallet,
    Retailer,
    RetailerOrder,
)
from app.db.session import get_db

router = APIRouter(prefix="/api/retailers", tags=["retailers"])


class RetailerRow(BaseModel):
    retailer_id: str
    name: str
    po_ratio: float       # actual demand vs. forecast (1.0 = on plan)
    shelf_risk: str       # green | amber | red
    open_orders: int
    forecast_units: int   # next 14 days


@router.get("", response_model=list[RetailerRow])
async def list_retailers(db: AsyncSession = Depends(get_db)) -> list[RetailerRow]:
    retailers = (await db.execute(select(Retailer).order_by(Retailer.name))).scalars().all()

    today = date.today()
    horizon = today + timedelta(days=14)

    # Pre-compute orders per retailer + sku within horizon
    order_rows = (
        await db.execute(
            select(
                RetailerOrder.retailer_id,
                RetailerOrder.sku_id,
                func.sum(RetailerOrder.quantity_units),
                func.count(),
            )
            .where(
                RetailerOrder.requested_delivery_date >= today,
                RetailerOrder.requested_delivery_date <= horizon,
                RetailerOrder.status != "cancelled",
            )
            .group_by(RetailerOrder.retailer_id, RetailerOrder.sku_id)
        )
    ).all()

    # Forecast expected per sku within same window (sum across days)
    forecast_rows = (
        await db.execute(
            select(DemandForecast.sku_id, func.sum(DemandForecast.quantity_expected))
            .where(
                DemandForecast.forecast_date >= today,
                DemandForecast.forecast_date <= horizon,
            )
            .group_by(DemandForecast.sku_id)
        )
    ).all()
    forecast_by_sku: dict[str, float] = {sku_id: float(qty or 0) for sku_id, qty in forecast_rows}

    orders_by_retailer: dict[str, dict[str, float]] = {}
    open_count_by_retailer: dict[str, int] = {}
    for retailer_id, sku_id, qty, cnt in order_rows:
        orders_by_retailer.setdefault(retailer_id, {})[sku_id] = float(qty or 0)
        open_count_by_retailer[retailer_id] = open_count_by_retailer.get(retailer_id, 0) + int(cnt or 0)

    # Pallet shelf-risk per retailer: count pallets older than (shelf_life - 3) days
    # committed to this retailer. We use sku_id linkage as a proxy since
    # finished_goods_pallets only carries a committed_order_id.
    risky_by_retailer = await _shelf_risk_counts(db)

    out: list[RetailerRow] = []
    for r in retailers:
        sku_orders = orders_by_retailer.get(r.retailer_id, {})
        sum_orders = sum(sku_orders.values())
        sum_forecast = sum(forecast_by_sku.get(sku_id, 0.0) for sku_id in sku_orders) or sum(
            forecast_by_sku.values()
        )
        if sum_forecast > 0 and sum_orders > 0:
            ratio = sum_orders / sum_forecast
        elif sum_orders > 0:
            ratio = 1.0
        else:
            ratio = 0.0
        ratio = max(0.0, min(2.0, round(ratio, 3)))

        risky = risky_by_retailer.get(r.retailer_id, {"red": 0, "amber": 0, "green": 0})
        if risky["red"] >= 5:
            shelf_risk = "red"
        elif risky["amber"] >= 5 or ratio > 1.2:
            shelf_risk = "amber"
        else:
            shelf_risk = "green"

        out.append(
            RetailerRow(
                retailer_id=r.retailer_id,
                name=r.name,
                po_ratio=ratio,
                shelf_risk=shelf_risk,
                open_orders=open_count_by_retailer.get(r.retailer_id, 0),
                forecast_units=int(
                    sum(forecast_by_sku.get(sku_id, 0.0) for sku_id in sku_orders)
                    or sum(forecast_by_sku.values())
                ),
            )
        )
    return out


async def _shelf_risk_counts(db: AsyncSession) -> dict[str, dict[str, int]]:
    """Bucket pallets per retailer by shelf-risk colour.

    Returns {retailer_id: {red, amber, green}}. Uses committed_order_id → retailer
    lookup; pallets without an order are skipped.
    """
    rows = (
        await db.execute(
            select(
                RetailerOrder.retailer_id,
                FinishedGoodsPallet.produced_at,
                FinishedGoodsPallet.shelf_life_days,
            )
            .join(
                RetailerOrder,
                RetailerOrder.retailer_order_id == FinishedGoodsPallet.committed_order_id,
            )
            .where(FinishedGoodsPallet.status == "in_warehouse")
        )
    ).all()

    today = date.today()
    out: dict[str, dict[str, int]] = {}
    for retailer_id, produced_at, shelf_life_days in rows:
        produced = produced_at.date() if hasattr(produced_at, "date") else produced_at
        days_left = max(0, (produced + timedelta(days=shelf_life_days) - today).days)
        bucket = out.setdefault(retailer_id, {"red": 0, "amber": 0, "green": 0})
        if days_left <= 2:
            bucket["red"] += 1
        elif days_left <= 5:
            bucket["amber"] += 1
        else:
            bucket["green"] += 1
    return out
