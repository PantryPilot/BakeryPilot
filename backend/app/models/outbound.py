"""Outbound warehouse → retailer shipment models."""

from pydantic import BaseModel


class WarehouseStockRow(BaseModel):
    sku_id: str
    sku_name: str
    available_units: int
    pallet_count: int


class OutboundShipment(BaseModel):
    shipment_id: str
    facility_id: str
    facility_name: str | None = None
    retailer_order_id: str
    retailer_id: str
    retailer_name: str | None = None
    sku_id: str
    sku_name: str | None = None
    quantity_units: int
    start_at: str
    end_at: str
    status: str
    requested_delivery_date: str | None = None


class CreateOutboundShipmentRequest(BaseModel):
    facility_id: str
    retailer_order_id: str
    sku_id: str
    start_at: str
    end_at: str
    quantity_units: int
    status: str = "scheduled"


class UpdateOutboundShipmentRequest(BaseModel):
    start_at: str | None = None
    end_at: str | None = None


class DraftOutboundShipmentRequest(BaseModel):
    facility_id: str
    retailer_order_id: str
    sku_id: str
    start_at: str
    end_at: str
    quantity_units: int
    rationale: str | None = None
