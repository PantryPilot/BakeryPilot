"""Unit tests for retailer PO ↔ schedule fulfillment rules."""

import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.services.schedule_fulfillment import (
    assert_po_not_already_scheduled,
    assert_qty_within_po,
    assert_sku_matches_po,
    mark_po_scheduled,
    revert_po_if_unlinked,
    validate_open_retailer_order,
)


def _po(**kwargs):
    defaults = {
        "retailer_order_id": uuid.uuid4(),
        "retailer_id": "costco",
        "sku_id": "sku-wonder-classic-white-loaf",
        "quantity_units": 8000,
        "status": "open",
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_validate_open_retailer_order_accepts_open():
    validate_open_retailer_order(_po())


def test_validate_open_retailer_order_rejects_scheduled():
    with pytest.raises(HTTPException) as exc:
        validate_open_retailer_order(_po(status="scheduled"))
    assert exc.value.status_code == 409


def test_assert_sku_matches_po():
    po = _po(sku_id="sku-ace-baguette-classic")
    assert_sku_matches_po(po, "sku-ace-baguette-classic")
    with pytest.raises(HTTPException) as exc:
        assert_sku_matches_po(po, "sku-other")
    assert exc.value.status_code == 422


def test_assert_qty_within_po():
    po = _po(quantity_units=1000)
    assert_qty_within_po(po, 1000)
    assert_qty_within_po(po, 500)
    with pytest.raises(HTTPException) as exc:
        assert_qty_within_po(po, 1001)
    assert exc.value.status_code == 422


def test_mark_po_scheduled_sets_status():
    po = _po(status="open")
    mark_po_scheduled(po)
    assert po.status == "scheduled"


def test_assert_po_not_already_scheduled_rejects_active_link():
    po_id = uuid.uuid4()
    existing = SimpleNamespace(schedule_id=uuid.uuid4())

    async def _run():
        db = AsyncMock()
        scalars = MagicMock()
        scalars.first.return_value = existing
        result = MagicMock()
        result.scalars.return_value = scalars
        db.execute.return_value = result
        with pytest.raises(HTTPException) as exc:
            await assert_po_not_already_scheduled(db, po_id)
        assert exc.value.status_code == 409

    asyncio.run(_run())


def test_revert_po_if_unlinked_reopens_orphaned_po():
    po_id = uuid.uuid4()
    po = SimpleNamespace(status="scheduled")

    async def _run():
        db = AsyncMock()
        db.get.return_value = po
        count_result = MagicMock()
        count_result.scalar_one.return_value = 0
        db.execute.return_value = count_result
        await revert_po_if_unlinked(db, po_id)
        assert po.status == "open"

    asyncio.run(_run())


def test_revert_po_if_unlinked_keeps_po_when_still_linked():
    po_id = uuid.uuid4()
    po = SimpleNamespace(status="scheduled")

    async def _run():
        db = AsyncMock()
        db.get.return_value = po
        count_result = MagicMock()
        count_result.scalar_one.return_value = 1
        db.execute.return_value = count_result
        await revert_po_if_unlinked(db, po_id)
        assert po.status == "scheduled"

    asyncio.run(_run())
