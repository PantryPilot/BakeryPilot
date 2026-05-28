from datetime import datetime, timezone

from app.db.models import ProductionSchedule
from app.services.schedule_apply import parse_iso_dt, resolve_schedule_window


def test_resolve_schedule_window_from_payload_times():
    original = ProductionSchedule(
        facility_id="plant-toronto",
        line_id="line-toronto-1",
        sku_id="sku-a",
        start_at=datetime(2026, 1, 1, 6, tzinfo=timezone.utc),
        end_at=datetime(2026, 1, 1, 10, tzinfo=timezone.utc),
        quantity_units=1000,
        status="approved",
        version=2,
    )
    now = datetime(2026, 5, 27, 12, tzinfo=timezone.utc)
    payload = {
        "start_at": "2026-05-27T14:00:00Z",
        "end_at": "2026-05-27T18:00:00Z",
    }
    start, end, version = resolve_schedule_window(payload, original, now)
    assert start == parse_iso_dt("2026-05-27T14:00:00Z")
    assert end == parse_iso_dt("2026-05-27T18:00:00Z")
    assert version == 3


def test_resolve_schedule_window_copies_original_when_no_overrides():
    original = ProductionSchedule(
        facility_id="plant-toronto",
        line_id="line-toronto-1",
        sku_id="sku-a",
        start_at=datetime(2026, 1, 1, 6, tzinfo=timezone.utc),
        end_at=datetime(2026, 1, 1, 10, tzinfo=timezone.utc),
        quantity_units=1000,
        status="approved",
        version=1,
    )
    now = datetime(2026, 5, 27, 12, tzinfo=timezone.utc)
    start, end, version = resolve_schedule_window({}, original, now)
    assert start == original.start_at
    assert end == original.end_at
    assert version == 2


def test_resolve_schedule_window_defaults_when_no_original():
    now = datetime(2026, 5, 27, 12, tzinfo=timezone.utc)
    start, end, version = resolve_schedule_window({}, None, now)
    assert start == now
    assert (end - start).total_seconds() == 4 * 3600
    assert version == 1
