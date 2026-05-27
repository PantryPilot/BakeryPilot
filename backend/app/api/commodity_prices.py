"""Read-only access to the `commodity_prices` table.

The table is populated by the data-source refresh scripts (Yahoo Finance,
Bank of Canada, Frankfurter, FRED). This route lets the procurement
agent — via `get_commodity_benchmark` — query a current price + rolling
window stats so `draft_negotiation` can cite real benchmark numbers
instead of synthetic constants.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter(prefix="/api/commodity_prices", tags=["commodity_prices"])


class CommodityWindowStats(BaseModel):
    commodity_id: str
    unit: str | None
    source: str | None
    window_days: int
    latest_date: str | None
    latest_close: float | None
    avg_close: float | None
    min_close: float | None
    max_close: float | None
    pct_change_vs_window_avg: float | None
    sample_count: int


class CommodityHistoryPoint(BaseModel):
    price_date: str
    close_price: float


class CommodityBenchmark(BaseModel):
    stats: CommodityWindowStats
    history: list[CommodityHistoryPoint]


@router.get("", response_model=list[CommodityWindowStats])
async def list_commodity_benchmarks(
    days: int = Query(30, ge=1, le=365, description="Rolling-window size in days."),
    commodity_id: str | None = Query(
        None,
        description="Filter to a single commodity_id (e.g. wheat-cbot-zw). Omit to list all.",
    ),
    db: AsyncSession = Depends(get_db),
) -> list[CommodityWindowStats]:
    """Latest close + window stats per commodity_id.

    Window math is done in SQL so the agent gets a small JSON payload
    rather than the full history. For a single series with full history,
    use GET /{commodity_id}.
    """
    where = "WHERE price_date >= CURRENT_DATE - :days * interval '1 day'"
    params: dict[str, object] = {"days": days}
    if commodity_id:
        where += " AND commodity_id = :commodity_id"
        params["commodity_id"] = commodity_id

    sql = f"""
        WITH win AS (
            SELECT
                commodity_id,
                unit,
                source,
                COUNT(*) AS n,
                AVG(close_price) AS avg_close,
                MIN(close_price) AS min_close,
                MAX(close_price) AS max_close
            FROM commodity_prices
            {where}
            GROUP BY commodity_id, unit, source
        ),
        latest AS (
            SELECT DISTINCT ON (commodity_id)
                commodity_id, price_date, close_price
            FROM commodity_prices
            ORDER BY commodity_id, price_date DESC
        )
        SELECT
            w.commodity_id,
            w.unit,
            w.source,
            w.n,
            w.avg_close,
            w.min_close,
            w.max_close,
            l.price_date AS latest_date,
            l.close_price AS latest_close
        FROM win w
        LEFT JOIN latest l USING (commodity_id)
        ORDER BY w.commodity_id;
    """
    rows = (await db.execute(text(sql), params)).mappings().all()

    out: list[CommodityWindowStats] = []
    for r in rows:
        latest_close = float(r["latest_close"]) if r["latest_close"] is not None else None
        avg_close = float(r["avg_close"]) if r["avg_close"] is not None else None
        pct = None
        if latest_close is not None and avg_close not in (None, 0):
            pct = round(((latest_close - avg_close) / avg_close) * 100, 2)
        out.append(
            CommodityWindowStats(
                commodity_id=r["commodity_id"],
                unit=r["unit"],
                source=r["source"],
                window_days=days,
                latest_date=r["latest_date"].isoformat() if r["latest_date"] else None,
                latest_close=latest_close,
                avg_close=round(avg_close, 4) if avg_close is not None else None,
                min_close=float(r["min_close"]) if r["min_close"] is not None else None,
                max_close=float(r["max_close"]) if r["max_close"] is not None else None,
                pct_change_vs_window_avg=pct,
                sample_count=int(r["n"]),
            )
        )
    return out


@router.get("/{commodity_id}", response_model=CommodityBenchmark)
async def get_commodity_benchmark(
    commodity_id: str,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
) -> CommodityBenchmark:
    """Stats + full daily series for one commodity over the trailing window."""
    stats_list = await list_commodity_benchmarks(days=days, commodity_id=commodity_id, db=db)
    if not stats_list:
        raise HTTPException(
            status_code=404,
            detail=f"No data for commodity_id '{commodity_id}' (or window too small). "
                   f"Run the matching seed.* target via the admin Data Sources panel.",
        )

    history_rows = (
        await db.execute(
            text(
                """
                SELECT price_date, close_price
                FROM commodity_prices
                WHERE commodity_id = :commodity_id
                  AND price_date >= CURRENT_DATE - :days * interval '1 day'
                ORDER BY price_date ASC
                """
            ),
            {"commodity_id": commodity_id, "days": days},
        )
    ).mappings().all()

    history = [
        CommodityHistoryPoint(
            price_date=r["price_date"].isoformat(),
            close_price=float(r["close_price"]),
        )
        for r in history_rows
    ]
    return CommodityBenchmark(stats=stats_list[0], history=history)
