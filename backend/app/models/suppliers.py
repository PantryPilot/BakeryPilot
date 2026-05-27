"""Supplier models."""

from pydantic import BaseModel


class Supplier(BaseModel):
    supplier_id: str
    name: str
    personality: str
    contact_email: str
    payment_terms: str
    moq_kg: float
    lead_time_mean_days: float
    lead_time_std_days: float
    window_earliest_day: int
    window_latest_day: int
    contract_expiry_date: str
    on_time_rate: float
    fill_rate: float
    window_compliance_rate: float
    price_variance_vs_benchmark: float
    moq_tax_quarter_usd: float
    contact_name: str | None = None
    phone: str | None = None
    website: str | None = None
    address: str | None = None
    notes: str | None = None


class SupplierMessage(BaseModel):
    message_id: str
    supplier_id: str
    direction: str
    channel: str
    subject: str | None
    body: str
    author: str | None
    related_order_id: str | None
    related_negotiation_id: str | None
    sent_at: str
    read_at: str | None


class MOQTaxEntry(BaseModel):
    supplier_id: str
    quarter: str
    overage_kg: float
    holding_cost_usd: float
    recorded_at: str


class DisruptionSignal(BaseModel):
    signal_id: str
    supplier_id: str | None
    ingredient_id: str | None
    kind: str
    severity: float
    source: str
    message: str
    observed_at: str


class NegotiationDraft(BaseModel):
    draft_id: str
    supplier_id: str
    trigger_kind: str
    body_md: str
    status: str
    created_at: str
    sent_at: str | None
    action_card_id: str | None
