import uuid
from datetime import date, datetime

from sqlalchemy import (
    ARRAY,
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Facility(Base):
    __tablename__ = "facilities"

    facility_id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str | None] = mapped_column(Text)
    province: Mapped[str | None] = mapped_column(Text)
    timezone: Mapped[str] = mapped_column(Text, nullable=False, default="America/Toronto")
    cold_capacity_kg: Mapped[float | None] = mapped_column(Numeric)
    dry_capacity_kg: Mapped[float | None] = mapped_column(Numeric)

    lots: Mapped[list["IngredientLot"]] = relationship(back_populates="facility")


class Ingredient(Base):
    __tablename__ = "ingredients"

    ingredient_id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(Text)
    default_storage_zone: Mapped[str] = mapped_column(Text, nullable=False)
    shelf_life_days_default: Mapped[int] = mapped_column(Integer, nullable=False)
    allergen_tags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=[])
    unit_of_measure: Mapped[str] = mapped_column(Text, nullable=False, default="kg")


class Sku(Base):
    __tablename__ = "skus"

    sku_id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(Text)
    margin_per_unit: Mapped[float] = mapped_column(Numeric, nullable=False, default=0)
    allergen_tags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=[])
    shelf_life_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)

    formulas: Mapped[list["ProductionFormula"]] = relationship(back_populates="sku")


class ProductionLine(Base):
    __tablename__ = "production_lines"

    line_id: Mapped[str] = mapped_column(Text, primary_key=True)
    facility_id: Mapped[str] = mapped_column(Text, ForeignKey("facilities.facility_id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    capacity_kg_per_hour: Mapped[float] = mapped_column(Numeric, nullable=False)
    supported_allergen_tags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=[])
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="idle")
    current_order_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))


class Retailer(Base):
    __tablename__ = "retailers"

    retailer_id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    edi_endpoint: Mapped[str | None] = mapped_column(Text)


class Supplier(Base):
    __tablename__ = "suppliers"

    supplier_id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    contact_email: Mapped[str | None] = mapped_column(Text)
    payment_terms: Mapped[str | None] = mapped_column(Text)
    contract_expiry_date: Mapped[date | None] = mapped_column(Date)
    personality_tag: Mapped[str | None] = mapped_column(Text)
    moq_kg: Mapped[float | None] = mapped_column(Numeric)
    lead_time_mean_days: Mapped[float | None] = mapped_column(Numeric)
    lead_time_std_days: Mapped[float | None] = mapped_column(Numeric)
    window_earliest_day: Mapped[int | None] = mapped_column(Integer)
    window_latest_day: Mapped[int | None] = mapped_column(Integer)
    on_time_rate: Mapped[float | None] = mapped_column(Numeric)
    fill_rate: Mapped[float | None] = mapped_column(Numeric)
    window_compliance_rate: Mapped[float | None] = mapped_column(Numeric)
    price_variance_vs_benchmark: Mapped[float | None] = mapped_column(Numeric)
    contact_name: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    website: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)

    lots: Mapped[list["IngredientLot"]] = relationship(back_populates="supplier")
    orders: Mapped[list["SupplierOrder"]] = relationship(back_populates="supplier")
    messages: Mapped[list["SupplierMessage"]] = relationship(back_populates="supplier", cascade="all, delete-orphan")


class SupplierMessage(Base):
    __tablename__ = "supplier_messages"

    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supplier_id: Mapped[str] = mapped_column(Text, ForeignKey("suppliers.supplier_id", ondelete="CASCADE"), nullable=False)
    direction: Mapped[str] = mapped_column(Text, nullable=False)
    channel: Mapped[str] = mapped_column(Text, nullable=False, default="email")
    subject: Mapped[str | None] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    author: Mapped[str | None] = mapped_column(Text)
    related_order_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("supplier_orders.order_id", ondelete="SET NULL"))
    related_negotiation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("negotiation_drafts.draft_id", ondelete="SET NULL"))
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    supplier: Mapped["Supplier"] = relationship(back_populates="messages")


class WarehouseCost(Base):
    __tablename__ = "warehouse_costs"

    facility_id: Mapped[str] = mapped_column(Text, ForeignKey("facilities.facility_id"), primary_key=True)
    storage_type: Mapped[str] = mapped_column(Text, primary_key=True)
    cost_per_kg_per_day: Mapped[float] = mapped_column(Numeric, nullable=False)
    capacity_kg: Mapped[float] = mapped_column(Numeric, nullable=False)


class IngredientLot(Base):
    __tablename__ = "ingredient_lots"

    lot_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    facility_id: Mapped[str] = mapped_column(Text, ForeignKey("facilities.facility_id"), nullable=False)
    ingredient_id: Mapped[str] = mapped_column(Text, ForeignKey("ingredients.ingredient_id"), nullable=False)
    supplier_id: Mapped[str | None] = mapped_column(Text, ForeignKey("suppliers.supplier_id"))
    quantity_kg: Mapped[float] = mapped_column(Numeric, nullable=False)
    received_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    storage_zone: Mapped[str] = mapped_column(Text, nullable=False)
    unit_cost: Mapped[float | None] = mapped_column(Numeric)
    lot_code: Mapped[str | None] = mapped_column(Text)

    facility: Mapped["Facility"] = relationship(back_populates="lots")
    ingredient: Mapped["Ingredient"] = relationship()
    supplier: Mapped["Supplier | None"] = relationship(back_populates="lots")


class ProductionFormula(Base):
    __tablename__ = "production_formulas"

    sku_id: Mapped[str] = mapped_column(Text, ForeignKey("skus.sku_id"), primary_key=True)
    ingredient_id: Mapped[str] = mapped_column(Text, ForeignKey("ingredients.ingredient_id"), primary_key=True)
    kg_per_unit: Mapped[float] = mapped_column(Numeric, nullable=False)

    sku: Mapped["Sku"] = relationship(back_populates="formulas")
    ingredient: Mapped["Ingredient"] = relationship()


class ProductionSchedule(Base):
    __tablename__ = "production_schedules"

    schedule_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    facility_id: Mapped[str] = mapped_column(Text, ForeignKey("facilities.facility_id"), nullable=False)
    line_id: Mapped[str] = mapped_column(Text, ForeignKey("production_lines.line_id"), nullable=False)
    sku_id: Mapped[str] = mapped_column(Text, ForeignKey("skus.sku_id"), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    quantity_units: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="suggested")
    waste_avoided_kg: Mapped[float] = mapped_column(Numeric, nullable=False, default=0)
    action_card_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    sku: Mapped["Sku"] = relationship()
    line: Mapped["ProductionLine"] = relationship()


class RetailerOrder(Base):
    __tablename__ = "retailer_orders"

    retailer_order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    retailer_id: Mapped[str] = mapped_column(Text, ForeignKey("retailers.retailer_id"), nullable=False)
    sku_id: Mapped[str] = mapped_column(Text, ForeignKey("skus.sku_id"), nullable=False)
    quantity_units: Mapped[int] = mapped_column(Integer, nullable=False)
    requested_delivery_date: Mapped[date] = mapped_column(Date, nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="open")

    retailer: Mapped["Retailer"] = relationship()
    sku: Mapped["Sku"] = relationship()


class DemandForecast(Base):
    __tablename__ = "demand_forecasts"

    sku_id: Mapped[str] = mapped_column(Text, ForeignKey("skus.sku_id"), primary_key=True)
    forecast_date: Mapped[date] = mapped_column(Date, primary_key=True)
    model_version: Mapped[str] = mapped_column(Text, primary_key=True)
    quantity_expected: Mapped[float] = mapped_column(Numeric, nullable=False)
    quantity_low: Mapped[float | None] = mapped_column(Numeric)
    quantity_high: Mapped[float | None] = mapped_column(Numeric)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class ActionCard(Base):
    __tablename__ = "action_cards"

    card_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    state: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_by: Mapped[str | None] = mapped_column(Text)


class SupplierOrder(Base):
    __tablename__ = "supplier_orders"

    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supplier_id: Mapped[str] = mapped_column(Text, ForeignKey("suppliers.supplier_id"), nullable=False)
    facility_id: Mapped[str] = mapped_column(Text, ForeignKey("facilities.facility_id"), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    action_card_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("action_cards.card_id"))
    external_po_number: Mapped[str | None] = mapped_column(Text)
    delivery_date: Mapped[date | None] = mapped_column(Date)

    supplier: Mapped["Supplier"] = relationship(back_populates="orders")
    items: Mapped[list["SupplierOrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class SupplierOrderItem(Base):
    __tablename__ = "supplier_order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("supplier_orders.order_id", ondelete="CASCADE"), primary_key=True)
    ingredient_id: Mapped[str] = mapped_column(Text, ForeignKey("ingredients.ingredient_id"), primary_key=True)
    quantity_kg: Mapped[float] = mapped_column(Numeric, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric, nullable=False)

    order: Mapped["SupplierOrder"] = relationship(back_populates="items")
    ingredient: Mapped["Ingredient"] = relationship()


class DisruptionSignal(Base):
    __tablename__ = "disruption_signals"

    signal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supplier_id: Mapped[str | None] = mapped_column(Text, ForeignKey("suppliers.supplier_id"))
    ingredient_id: Mapped[str | None] = mapped_column(Text, ForeignKey("ingredients.ingredient_id"))
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[float] = mapped_column(Numeric, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    supplier: Mapped["Supplier | None"] = relationship()
    ingredient: Mapped["Ingredient | None"] = relationship()


class NegotiationDraft(Base):
    __tablename__ = "negotiation_drafts"

    draft_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supplier_id: Mapped[str] = mapped_column(Text, ForeignKey("suppliers.supplier_id"), nullable=False)
    trigger_kind: Mapped[str] = mapped_column(Text, nullable=False)
    body_md: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    action_card_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("action_cards.card_id"))

    supplier: Mapped["Supplier"] = relationship()


class MoqTaxEntry(Base):
    __tablename__ = "moq_tax_ledger"

    ledger_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    supplier_id: Mapped[str] = mapped_column(Text, ForeignKey("suppliers.supplier_id"), nullable=False)
    quarter: Mapped[str] = mapped_column(Text, nullable=False)
    overage_kg: Mapped[float] = mapped_column(Numeric, nullable=False)
    holding_cost: Mapped[float] = mapped_column(Numeric, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    supplier: Mapped["Supplier"] = relationship()


class ProductionRun(Base):
    __tablename__ = "production_runs"

    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    schedule_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("production_schedules.schedule_id"))
    line_id: Mapped[str] = mapped_column(Text, ForeignKey("production_lines.line_id"), nullable=False)
    facility_id: Mapped[str] = mapped_column(Text, ForeignKey("facilities.facility_id"), nullable=False)
    sku_id: Mapped[str] = mapped_column(Text, ForeignKey("skus.sku_id"), nullable=False)
    operator_id: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    planned_kg: Mapped[float | None] = mapped_column(Numeric)
    actual_kg: Mapped[float | None] = mapped_column(Numeric)
    actual_ingredient_consumption: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="in_progress")
    equipment_notes: Mapped[str | None] = mapped_column(Text)

    schedule: Mapped["ProductionSchedule | None"] = relationship()
    sku: Mapped["Sku"] = relationship()
    line: Mapped["ProductionLine"] = relationship()


class WasteEvent(Base):
    __tablename__ = "waste_events"

    waste_event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    kg: Mapped[float] = mapped_column(Numeric, nullable=False)
    dollar_value: Mapped[float | None] = mapped_column(Numeric)
    co2e_kg: Mapped[float | None] = mapped_column(Numeric)
    source_table: Mapped[str | None] = mapped_column(Text)
    source_id: Mapped[str | None] = mapped_column(Text)
    avoided: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    facility_id: Mapped[str | None] = mapped_column(Text, ForeignKey("facilities.facility_id"))
    ingredient_id: Mapped[str | None] = mapped_column(Text, ForeignKey("ingredients.ingredient_id"))

    ingredient: Mapped["Ingredient | None"] = relationship()


class FinishedGoodsPallet(Base):
    __tablename__ = "finished_goods_pallets"

    pallet_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sku_id: Mapped[str] = mapped_column(Text, ForeignKey("skus.sku_id"), nullable=False)
    facility_id: Mapped[str] = mapped_column(Text, ForeignKey("facilities.facility_id"), nullable=False)
    produced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    shelf_life_days: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="in_warehouse")
    committed_order_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))

    sku: Mapped["Sku"] = relationship()


class Stakeholder(Base):
    __tablename__ = "stakeholders"

    stakeholder_id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    organization: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=[])


class NotificationDraft(Base):
    __tablename__ = "notification_drafts"

    draft_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    recipients: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=[])
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    body_md: Mapped[str] = mapped_column(Text, nullable=False)
    gmail_draft_url: Mapped[str | None] = mapped_column(Text)
    action_card_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("action_cards.card_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class WeeklySummary(Base):
    __tablename__ = "weekly_summaries"

    summary_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    week_end: Mapped[date] = mapped_column(Date, nullable=False)
    stats: Mapped[dict] = mapped_column(JSON, nullable=False)
    narration_md: Mapped[str | None] = mapped_column(Text)
    gmail_draft_url: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("week_start", name="weekly_summaries_week_start_unique"),)


class AppUser(Base):
    __tablename__ = "app_users"

    user_id: Mapped[str] = mapped_column(Text, primary_key=True)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    default_facility_id: Mapped[str | None] = mapped_column(Text, ForeignKey("facilities.facility_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("app_users.user_id", ondelete="CASCADE"), primary_key=True
    )
    theme: Mapped[str] = mapped_column(Text, nullable=False, default="light")
    accent: Mapped[str] = mapped_column(Text, nullable=False, default="blue")
    notif_toast: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notif_auto_dismiss: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notif_expiring_lots: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notif_supplier_risk: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notif_yield_anomaly: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class InventoryEvent(Base):
    __tablename__ = "inventory_events"

    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    lot_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ingredient_lots.lot_id"), nullable=False)
    delta_kg: Mapped[float] = mapped_column(Numeric, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    source_ref: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)


class ProductionOrder(Base):
    __tablename__ = "production_orders"

    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    facility_id: Mapped[str] = mapped_column(Text, ForeignKey("facilities.facility_id"), nullable=False)
    line_id: Mapped[str] = mapped_column(Text, ForeignKey("production_lines.line_id"), nullable=False)
    sku_id: Mapped[str] = mapped_column(Text, ForeignKey("skus.sku_id"), nullable=False)
    quantity_units: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="planned")
    planned_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    sku: Mapped["Sku"] = relationship()
    line: Mapped["ProductionLine"] = relationship()
