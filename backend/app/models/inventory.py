"""Inventory models."""

from pydantic import BaseModel


class IngredientLot(BaseModel):
    lot_id: str
    facility_id: str
    ingredient_id: str
    ingredient_name: str
    quantity_kg: float
    expiry_date: str
    storage_zone: str
    received_date: str
    supplier_id: str | None
    spoilage_risk_score: float


class SubstitutionCandidate(BaseModel):
    sku_id: str
    sku_name: str
    achievable_quantity: int
    margin_score: float
    reason: str
