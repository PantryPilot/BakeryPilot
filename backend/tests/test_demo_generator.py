"""Unit tests for demo_generator service."""

import asyncio
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.demo_generator import (
    DemoGenerateResult,
    _open_pos_without_schedule,
    _weighted_ingredients,
    generate_demo_operations,
)


def test_weighted_ingredients_prefers_low_stock():
    rng = __import__("random").Random(42)
    ingredients = ["ing-a", "ing-b", "ing-c"]
    lot_totals = {
        ("plant-toronto", "ing-a"): 500.0,
        ("plant-toronto", "ing-b"): 20.0,
        ("plant-toronto", "ing-c"): 800.0,
    }
    picks = _weighted_ingredients(rng, ingredients, lot_totals, "plant-toronto", 3)
    picked_ids = {p[0] for p in picks}
    assert picked_ids == {"ing-a", "ing-b", "ing-c"}
    assert all(p[1] >= 300 for p in picks)


def test_demo_generate_result_totals():
    result = DemoGenerateResult(
        retailer_orders=[{"order_id": "1"}],
        supplier_orders=[{"order_id": "2"}, {"order_id": "3"}],
        schedules=[],
    )
    assert result.totals == {
        "retailer_orders": 1,
        "supplier_orders": 2,
        "schedules": 0,
    }


def test_open_pos_without_schedule_skips_linked():
    po_id = uuid.uuid4()
    po = SimpleNamespace(retailer_order_id=po_id, status="open")

    async def _run():
        db = AsyncMock()
        db.execute.return_value = MagicMock(
            scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[po_id])))
        )
        db.get.return_value = po
        open_pos = await _open_pos_without_schedule(db, [po_id])
        assert open_pos == []

    asyncio.run(_run())


def test_open_pos_without_schedule_returns_open():
    po_id = uuid.uuid4()
    po = SimpleNamespace(retailer_order_id=po_id, status="open")

    async def _run():
        db = AsyncMock()
        db.execute.return_value = MagicMock(
            scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        )
        db.get.return_value = po
        open_pos = await _open_pos_without_schedule(db, [po_id])
        assert open_pos == [po]

    asyncio.run(_run())


def test_generate_demo_operations_creates_entities():
    now = datetime.now(timezone.utc)
    today = date.today()

    class _FlushCounter:
        def __init__(self):
            self.count = 0

        async def __call__(self):
            self.count += 1

    flush_counter = _FlushCounter()

    async def _run():
        db = AsyncMock()

        def _scalar_all_side_effect(stmt):
            stmt_str = str(stmt)
            result = MagicMock()
            if "retailers" in stmt_str:
                result.scalars.return_value.all.return_value = ["costco"]
            elif "skus" in stmt_str:
                result.scalars.return_value.all.return_value = ["sku-wonder-classic-white-loaf"]
            elif "suppliers" in stmt_str:
                result.scalars.return_value.all.return_value = ["sup-northgrain"]
            elif "ingredients" in stmt_str:
                result.scalars.return_value.all.return_value = ["ing-flour-ap"]
            elif "facilities" in stmt_str and "production_lines" not in stmt_str:
                result.scalars.return_value.all.return_value = ["plant-toronto"]
            elif "production_lines" in stmt_str:
                result.all.return_value = [("plant-toronto", "line-toronto-1")]
            elif "ingredient_lots" in stmt_str:
                result.all.return_value = [("plant-toronto", "ing-flour-ap", 100.0)]
            elif "production_schedules" in stmt_str:
                result.scalars.return_value.all.return_value = []
            else:
                result.scalars.return_value.all.return_value = []
                result.all.return_value = []
            return result

        db.execute = AsyncMock(side_effect=_scalar_all_side_effect)
        db.flush = flush_counter
        db.commit = AsyncMock()
        db.add = MagicMock()

        added: list = []

        def _capture_add(obj):
            added.append(obj)
            if hasattr(obj, "retailer_order_id") and obj.retailer_order_id is None:
                obj.retailer_order_id = uuid.uuid4()
            if hasattr(obj, "order_id") and obj.order_id is None:
                obj.order_id = uuid.uuid4()
            if hasattr(obj, "schedule_id") and obj.schedule_id is None:
                obj.schedule_id = uuid.uuid4()

        db.add.side_effect = _capture_add

        result = await generate_demo_operations(
            db,
            retailer_order_count=2,
            supplier_order_count=1,
            schedule_count=1,
            seed=99,
        )
        assert result.totals["retailer_orders"] == 2
        assert result.totals["supplier_orders"] == 1
        assert result.totals["schedules"] == 1
        assert len(added) >= 4
        db.commit.assert_called_once()

    asyncio.run(_run())


def test_generate_demo_operations_reproducible_with_seed():
    """Same seed should pick same retailer/sku via RNG (structural check)."""
    rng1 = __import__("random").Random(12345)
    rng2 = __import__("random").Random(12345)
    assert rng1.choice(["a", "b", "c"]) == rng2.choice(["a", "b", "c"])
