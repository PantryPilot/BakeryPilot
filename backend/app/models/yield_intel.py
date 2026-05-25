"""Yield + anomaly diagnosis models."""

from pydantic import BaseModel


class YieldVarianceItem(BaseModel):
    ingredient_id: str
    theoretical_kg: float
    actual_kg: float
    variance_pct: float
    dollar_leak: float


class YieldRun(BaseModel):
    run_id: str
    schedule_id: str | None
    line_id: str
    facility_id: str
    started_at: str
    ended_at: str | None
    actual_vs_theoretical: list[YieldVarianceItem]
    total_dollar_leak: float
    status: str


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
