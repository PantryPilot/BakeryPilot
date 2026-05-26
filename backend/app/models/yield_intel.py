"""Yield + anomaly diagnosis models."""

from pydantic import BaseModel


class YieldVarianceItem(BaseModel):
    ingredient_id: str
    ingredient_name: str | None = None
    theoretical_kg: float
    actual_kg: float
    variance_pct: float
    dollar_leak: float


class YieldRun(BaseModel):
    run_id: str
    schedule_id: str | None = None
    line_id: str
    facility_id: str
    sku_id: str | None = None
    operator_id: str | None = None
    started_at: str
    ended_at: str | None = None
    actual_vs_theoretical: list[YieldVarianceItem]
    total_dollar_leak: float
    status: str
    equipment_notes: str | None = None


class CandidateCause(BaseModel):
    cause: str
    confidence: float
    supporting_data: list[str]


class AnomalyDiagnosis(BaseModel):
    run_id: str
    candidate_causes: list[CandidateCause]
    recommendation: str


class WorkOrderRequest(BaseModel):
    equipment_id: str
    suggested_window: str
    reason: str


class WorkOrderResponse(BaseModel):
    work_order_id: str
    scheduled_at: str


class YieldTelemetryPoint(BaseModel):
    date: str
    line_id: str
    facility_id: str
    actual_pct: float
    target_pct: float
