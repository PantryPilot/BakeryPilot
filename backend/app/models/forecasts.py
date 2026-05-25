"""Forecast models."""

from pydantic import BaseModel


class DemandForecastPoint(BaseModel):
    sku_id: str
    forecast_date: str
    quantity_expected: int
    quantity_low: int
    quantity_high: int
    model_version: str
    generated_at: str
