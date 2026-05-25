"""Pallet + outbound routing models."""

from enum import Enum

from pydantic import BaseModel


class PalletStatus(str, Enum):
    in_warehouse = "in_warehouse"
    shipped = "shipped"
    donated = "donated"
    written_off = "written_off"


class Pallet(BaseModel):
    pallet_id: str
    sku_id: str
    facility_id: str
    produced_at: str
    shelf_life_days: int
    days_remaining: int
    quantity: int
    status: PalletStatus
    committed_order_id: str | None = None


class RouteRequest(BaseModel):
    action: str  # reroute | donate | markdown | writeoff
    target_facility_id: str | None = None
    notes: str | None = None
