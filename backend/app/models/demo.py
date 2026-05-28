from pydantic import BaseModel, Field


class DemoGenerateRequest(BaseModel):
    retailer_order_count: int = Field(default=5, ge=0, le=20)
    supplier_order_count: int = Field(default=4, ge=0, le=15)
    schedule_count: int = Field(default=6, ge=0, le=20)
    facility_id: str | None = None
    seed: int | None = None


class DemoRetailerOrderSummary(BaseModel):
    order_id: str
    retailer_id: str
    sku_id: str
    quantity: int
    requested_delivery_date: str
    status: str


class DemoSupplierOrderSummary(BaseModel):
    order_id: str
    supplier_id: str
    facility_id: str
    status: str
    delivery_date: str | None
    items: list[dict]


class DemoScheduleSummary(BaseModel):
    schedule_id: str
    facility_id: str
    line_id: str
    sku_id: str
    status: str
    quantity_units: int
    start_at: str
    end_at: str
    retailer_order_id: str | None = None


class DemoGenerateResponse(BaseModel):
    retailer_orders: list[DemoRetailerOrderSummary]
    supplier_orders: list[DemoSupplierOrderSummary]
    schedules: list[DemoScheduleSummary]
    totals: dict[str, int]
