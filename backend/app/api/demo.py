from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.demo import (
    DemoGenerateRequest,
    DemoGenerateResponse,
    DemoRetailerOrderSummary,
    DemoScheduleSummary,
    DemoSupplierOrderSummary,
)
from app.services.demo_generator import generate_demo_operations

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.post("/generate", response_model=DemoGenerateResponse)
async def generate_demo(
    req: DemoGenerateRequest, db: AsyncSession = Depends(get_db)
) -> DemoGenerateResponse:
    """Generate random demo retailer POs, supplier POs, and production schedules."""
    result = await generate_demo_operations(
        db,
        retailer_order_count=req.retailer_order_count,
        supplier_order_count=req.supplier_order_count,
        schedule_count=req.schedule_count,
        facility_id=req.facility_id,
        seed=req.seed,
    )
    return DemoGenerateResponse(
        retailer_orders=[DemoRetailerOrderSummary(**r) for r in result.retailer_orders],
        supplier_orders=[DemoSupplierOrderSummary(**s) for s in result.supplier_orders],
        schedules=[DemoScheduleSummary(**s) for s in result.schedules],
        totals=result.totals,
    )
