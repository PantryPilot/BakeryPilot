import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.db.models import ProductionSchedule
from app.services.schedule_propose import build_schedule_diff


def _schedule(**overrides) -> ProductionSchedule:
    defaults = dict(
        schedule_id=uuid.uuid4(),
        facility_id="plant-toronto",
        line_id="line-toronto-1",
        sku_id="sku-wonder-classic-white-loaf",
        start_at=datetime(2026, 5, 29, 12, tzinfo=timezone.utc),
        end_at=datetime(2026, 5, 29, 16, tzinfo=timezone.utc),
        quantity_units=1400,
        status="suggested",
        waste_avoided_kg=0,
        retailer_order_id=None,
        version=1,
        created_at=datetime(2026, 5, 28, 12, tzinfo=timezone.utc),
    )
    defaults.update(overrides)
    return ProductionSchedule(**defaults)


def test_build_schedule_diff_without_retailer_po():
    diff = build_schedule_diff(_schedule())
    assert len(diff.before) == 1
    assert len(diff.after) == 1
    assert diff.before[0].sku_id == "sku-wonder-classic-white-loaf"
    assert diff.before[0].retailer_order_id is None
    assert "Reschedule run" in diff.changes[0].narration


def test_build_schedule_diff_with_linked_retailer_po():
    po_id = uuid.uuid4()
    schedule = _schedule(retailer_order_id=po_id)
    schedule.retailer_order = SimpleNamespace(
        retailer_id="costco",
        retailer=SimpleNamespace(name="Costco"),
        requested_delivery_date=date(2026, 5, 30),
    )

    diff = build_schedule_diff(schedule)

    assert diff.before[0].retailer_order_id == str(po_id)
    assert diff.before[0].retailer_name == "Costco"
    assert diff.before[0].requested_delivery_date == "2026-05-30"
    assert "Costco retailer PO" in diff.changes[0].narration


def test_build_schedule_diff_skips_unloaded_retailer_po():
    """Avoid lazy-loading retailer_order in async request handlers."""
    po_id = uuid.uuid4()
    schedule = _schedule(retailer_order_id=po_id)
    # Relationship not attached — must not touch ORM lazy loader.
    diff = build_schedule_diff(schedule)
    assert diff.before[0].retailer_order_id == str(po_id)
    assert diff.before[0].retailer_name is None
