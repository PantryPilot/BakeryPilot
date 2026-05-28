import asyncio
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

from app.db.models import ProductionSchedule
from app.services.schedule_apply import apply_schedule_change, parse_iso_dt, resolve_schedule_window


def test_apply_schedule_change_updates_row_in_place():
    original_id = uuid.uuid4()
    original = ProductionSchedule(
        schedule_id=original_id,
        facility_id="plant-toronto",
        line_id="line-toronto-1",
        sku_id="sku-a",
        start_at=datetime(2026, 6, 1, 9, tzinfo=timezone.utc),
        end_at=datetime(2026, 6, 1, 13, tzinfo=timezone.utc),
        quantity_units=1000,
        status="approved",
        version=2,
    )

    async def _run():
        db = AsyncMock()
        db.get = AsyncMock(return_value=original)
        db.flush = AsyncMock()
        payload = {
            "schedule_id": str(original_id),
            "start_at": "2026-06-01T14:00:00Z",
            "end_at": "2026-06-01T18:00:00Z",
        }
        result = await apply_schedule_change(
            db,
            payload=payload,
            card_id=str(uuid.uuid4()),
            facility_id="plant-toronto",
            line_id="line-toronto-1",
            substitute_sku_id="sku-a",
            requested_units=1000,
        )
        assert result.schedule_id == original_id
        assert result.start_at == parse_iso_dt("2026-06-01T14:00:00Z")
        assert result.end_at == parse_iso_dt("2026-06-01T18:00:00Z")
        assert result.version == 3
        assert result.status == "approved"
        db.add.assert_not_called()

    asyncio.run(_run())

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
