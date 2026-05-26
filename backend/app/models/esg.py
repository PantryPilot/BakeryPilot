"""ESG models."""

from pydantic import BaseModel


class WasteCounter(BaseModel):
    kg_avoided: float
    dollars_saved: float
    co2e_avoided_kg: float
    period_start: str
    period_end: str
    moq_tax_ytd: float = 0.0
    disruptions_caught: int = 0


class ESGPattern(BaseModel):
    pattern_id: str
    description: str
    occurrences: int
    root_cause: str
    proposed_rule: str


class WasteEvent(BaseModel):
    event_id: str
    ts: str
    lot_id: str | None = None
    ingredient_name: str
    quantity_kg: float
    value_usd: float
    reason: str
    avoided: bool
    facility_id: str | None = None
