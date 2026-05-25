"""Orders router: supplier_orders draft + retailer_orders intake."""

from datetime import datetime

from fastapi import APIRouter, HTTPException

from app import mock_data
from app.models.orders import (
    LandedCostBreakdown,
    RetailerOrder,
    RetailerOrderRequest,
    SupplierOrder,
    SupplierOrderDraftRequest,
    SupplierOrderDraftResponse,
)

router = APIRouter(prefix="/api", tags=["orders"])


@router.post("/orders/draft", response_model=SupplierOrderDraftResponse)
async def draft_supplier_order(req: SupplierOrderDraftRequest) -> SupplierOrderDraftResponse:
    """Compute landed cost + create a pending action card. Does NOT write the order."""
    if not any(s["supplier_id"] == req.supplier_id for s in mock_data.SUPPLIERS):
        raise HTTPException(404, f"supplier {req.supplier_id} not found")

    items_dicts = [i.model_dump() for i in req.items]
    breakdown = mock_data.compute_landed_cost(items_dicts, req.supplier_id)
    card = mock_data.make_action_card(
        kind="supplier_order",
        payload={
            "supplier_id": req.supplier_id,
            "items": items_dicts,
            "delivery_date": req.delivery_date,
            "landed_cost_breakdown": breakdown,
        },
    )
    return SupplierOrderDraftResponse(
        action_card_id=card["card_id"],
        landed_cost_breakdown=LandedCostBreakdown(**breakdown),
    )


@router.get("/orders", response_model=list[SupplierOrder])
async def list_orders() -> list[SupplierOrder]:
    return [SupplierOrder(**o) for o in mock_data.SUPPLIER_ORDERS]


@router.get("/retailer_orders", response_model=list[RetailerOrder])
async def list_retailer_orders() -> list[RetailerOrder]:
    return [RetailerOrder(**o) for o in mock_data.RETAILER_ORDERS]


@router.post("/retailer_orders", response_model=dict)
async def create_retailer_order(req: RetailerOrderRequest) -> dict:
    """Accept a retailer PO and create an action card with a proposed schedule diff."""
    order_id = mock_data.new_id("rord")
    order = {
        "order_id": order_id,
        "retailer_id": req.retailer_id,
        "sku_id": req.sku_id,
        "quantity": req.quantity,
        "requested_delivery_date": req.requested_delivery_date,
        "received_at": datetime.utcnow().isoformat(),
        "status": "firm",
    }
    mock_data.RETAILER_ORDERS.append(order)
    card = mock_data.make_action_card(
        kind="schedule_change",
        payload={
            "trigger_order_id": order_id,
            "narration": (
                f"New {req.retailer_id} PO for {req.quantity:,} units of {req.sku_id} "
                f"by {req.requested_delivery_date}. Proposing schedule re-tile."
            ),
        },
    )
    return {"order_id": order_id, "action_card_id": card["card_id"]}
