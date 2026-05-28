"""Schedule models."""

from pydantic import BaseModel


class ScheduleRun(BaseModel):
    run_id: str
    sku_id: str
    start_at: str
    end_at: str
    quantity: int
    lot_assignments: list[str]
    retailer_order_id: str | None = None
    retailer_id: str | None = None
    retailer_name: str | None = None
    requested_delivery_date: str | None = None


class ProductionSchedule(BaseModel):
    schedule_id: str
    version: int
    facility_id: str
    line_id: str
    runs: list[ScheduleRun]
    waste_avoided_kg: float
    status: str
    retailer_order_id: str | None = None
    retailer_id: str | None = None
    retailer_name: str | None = None
    requested_delivery_date: str | None = None


class ScheduleChange(BaseModel):
    kind: str
    narration: str
    affected_run_ids: list[str]


class ScheduleDiff(BaseModel):
    before: list[ScheduleRun]
    after: list[ScheduleRun]
    changes: list[ScheduleChange]


class WhatIfRequest(BaseModel):
    schedule_id: str
    change_description: str


class CreateScheduleRequest(BaseModel):
    facility_id: str
    line_id: str
    sku_id: str
    start_at: str
    end_at: str
    quantity_units: int
    retailer_order_id: str | None = None
    status: str = "approved"
    waste_avoided_kg: float = 0


class UpdateScheduleRequest(BaseModel):
    start_at: str | None = None
    end_at: str | None = None
    line_id: str | None = None
    facility_id: str | None = None
