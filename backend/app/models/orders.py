"""Order models."""

from pydantic import BaseModel


class OrderLineItem(BaseModel):
    ingredient_id: str
    quantity_kg: float
    unit_price: float


class SupplierOrderDraftRequest(BaseModel):
    supplier_id: str
    items: list[OrderLineItem]
    delivery_date: str


class LandedCostBreakdown(BaseModel):
    unit_price: float
    quantity_kg: float
    base_cost: float
    overage_cost: float
    holding_cost: float
    total: float


class SupplierOrderDraftResponse(BaseModel):
    action_card_id: str
    landed_cost_breakdown: LandedCostBreakdown


class SupplierOrder(BaseModel):
    order_id: str
    supplier_id: str
    items: list[OrderLineItem]
    delivery_date: str
    status: str
    confirmed_at: str | None = None
    action_card_id: str | None = None


class RetailerOrderRequest(BaseModel):
    retailer_id: str
    sku_id: str
    quantity: int
    requested_delivery_date: str


class RetailerOrder(BaseModel):
    order_id: str
    retailer_id: str
    sku_id: str
    quantity: int
    requested_delivery_date: str
    received_at: str
    status: str
