"""ESG models."""

from pydantic import BaseModel


class WasteCounter(BaseModel):
    kg_avoided: float
    dollars_saved: float
    co2e_avoided_kg: float
    period_start: str
    period_end: str


class ESGPattern(BaseModel):
    pattern_id: str
    description: str
    occurrences: int
    root_cause: str
    proposed_rule: str
