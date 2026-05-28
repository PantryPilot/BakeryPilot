"""Per-table filter definitions for the admin data browser."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TableFilterDef:
    column: str
    label: str
    option_labels: dict[str, str] | None = None


TABLE_FILTER_DEFS: dict[str, tuple[TableFilterDef, ...]] = {
    "commodity_prices": (
        TableFilterDef(
            "source",
            "Data source",
            {
                "yahoo_finance": "Yahoo Finance",
                "bank_of_canada": "Bank of Canada",
                "frankfurter": "ECB / Frankfurter",
                "fred": "FRED (St. Louis Fed)",
            },
        ),
        TableFilterDef("commodity_id", "Commodity"),
    ),
    "disruption_signals": (
        TableFilterDef(
            "source",
            "Source",
            {
                "open_meteo": "Open-Meteo",
                "gdelt": "GDELT News",
                "commodity": "Commodity benchmark",
            },
        ),
        TableFilterDef("kind", "Signal kind"),
    ),
    "ingredient_lots": (
        TableFilterDef("facility_id", "Facility"),
        TableFilterDef(
            "storage_zone",
            "Storage zone",
            {"frozen": "Frozen", "refrigerated": "Refrigerated", "dry": "Dry"},
        ),
    ),
    "action_cards": (
        TableFilterDef("kind", "Kind"),
        TableFilterDef(
            "state",
            "State",
            {"pending": "Pending", "confirmed": "Confirmed", "rejected": "Rejected"},
        ),
    ),
    "supplier_orders": (
        TableFilterDef("facility_id", "Facility"),
        TableFilterDef(
            "status",
            "Status",
            {
                "draft": "Draft",
                "pending_confirm": "Pending confirm",
                "confirmed": "Confirmed",
                "sent": "Sent",
            },
        ),
    ),
    "production_schedules": (
        TableFilterDef("facility_id", "Facility"),
        TableFilterDef(
            "status",
            "Status",
            {"suggested": "Suggested", "approved": "Approved", "complete": "Complete"},
        ),
    ),
    "waste_events": (
        TableFilterDef("facility_id", "Facility"),
        TableFilterDef(
            "kind",
            "Kind",
            {
                "spoilage": "Spoilage",
                "yield_loss": "Yield loss",
                "moq_overage": "MOQ overage",
                "expired_pallet": "Expired pallet",
            },
        ),
    ),
    # Additional tables
    "allergen_changeovers": (
        TableFilterDef("from_allergen", "From allergen"),
        TableFilterDef("to_allergen", "To allergen"),
    ),
    "negotiation_drafts": (
        TableFilterDef("supplier_id", "Supplier"),
        TableFilterDef(
            "status",
            "Status",
            {"pending": "Pending", "sent": "Sent", "discarded": "Discarded"},
        ),
        TableFilterDef("trigger_kind", "Trigger"),
    ),
    "production_runs": (
        TableFilterDef("facility_id", "Facility"),
        TableFilterDef("sku_id", "SKU"),
        TableFilterDef(
            "status",
            "Status",
            {"in_progress": "In progress", "complete": "Complete", "cancelled": "Cancelled"},
        ),
    ),
    "finished_goods_pallets": (
        TableFilterDef("facility_id", "Facility"),
        TableFilterDef("sku_id", "SKU"),
        TableFilterDef(
            "status",
            "Status",
            {
                "in_warehouse": "In warehouse",
                "shipped": "Shipped",
                "donated": "Donated",
                "written_off": "Written off",
            },
        ),
    ),
    "retailer_orders": (
        TableFilterDef("retailer_id", "Retailer"),
        TableFilterDef(
            "status",
            "Status",
            {"open": "Open", "scheduled": "Scheduled", "shipped": "Shipped", "cancelled": "Cancelled"},
        ),
    ),
    "outbound_shipments": (
        TableFilterDef("facility_id", "Facility"),
        TableFilterDef(
            "status",
            "Status",
            {"scheduled": "Scheduled", "in_transit": "In transit", "delivered": "Delivered"},
        ),
    ),
    "suppliers": (
        TableFilterDef(
            "personality_tag",
            "Personality",
            {
                "reliable": "Reliable",
                "cheap_late": "Cheap / late",
                "high_moq": "High MOQ",
                "disrupted": "Disrupted",
                "new": "New entrant",
            },
        ),
    ),
    "demand_forecasts": (
        TableFilterDef("sku_id", "SKU"),
        TableFilterDef("model_version", "Model version"),
    ),
    "inventory_events": (
        TableFilterDef("facility_id", "Facility"),
        TableFilterDef("event_type", "Event type"),
    ),
    "dock_schedules": (
        TableFilterDef("facility_id", "Facility"),
    ),
    "moq_tax_ledger": (
        TableFilterDef("supplier_id", "Supplier"),
        TableFilterDef("facility_id", "Facility"),
    ),
}


def filter_columns_for_table(table_name: str) -> set[str]:
    return {d.column for d in TABLE_FILTER_DEFS.get(table_name, ())}


def option_label(table_name: str, column: str, value: str) -> str:
    for d in TABLE_FILTER_DEFS.get(table_name, ()):
        if d.column == column and d.option_labels:
            return d.option_labels.get(value, value)
    return value
