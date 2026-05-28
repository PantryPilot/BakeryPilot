"""Apply confirmed schedule_change action cards to production_schedules."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ProductionSchedule


def utc_iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


async def resolve_schedule(db: AsyncSession, schedule_id: str) -> ProductionSchedule | None:
    """Resolve a schedule path param, including ``current`` / ``latest`` aliases."""
    if schedule_id in ("current", "latest"):
        suggested = (
            await db.execute(
                select(ProductionSchedule)
                .where(ProductionSchedule.status == "suggested")
                .order_by(ProductionSchedule.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if suggested:
            return suggested
        return (
            await db.execute(
                select(ProductionSchedule)
                .where(ProductionSchedule.status == "approved")
                .order_by(ProductionSchedule.start_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

    try:
        sid = uuid.UUID(schedule_id)
    except ValueError:
        return None
    return await db.get(ProductionSchedule, sid)


def parse_iso_dt(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def resolve_schedule_window(
    payload: dict[str, Any],
    original: ProductionSchedule | None,
    now: datetime,
) -> tuple[datetime, datetime, int]:
    """Return (start_at, end_at, version) for the replacement schedule row."""
    start_raw = payload.get("start_at")
    end_raw = payload.get("end_at")
    if start_raw and end_raw:
        return parse_iso_dt(start_raw), parse_iso_dt(end_raw), (original.version + 1 if original else 1)

    if original is not None:
        return original.start_at, original.end_at, original.version + 1

    start_at = now
    duration_h = float(payload.get("duration_hours") or 4)
    return start_at, start_at + timedelta(hours=duration_h), 1


async def find_schedule_for_change(
    db: AsyncSession,
    payload: dict[str, Any],
    facility_id: str,
    line_id: str | None,
) -> ProductionSchedule | None:
    schedule_id = payload.get("schedule_id")
    if schedule_id:
        try:
            sid = uuid.UUID(str(schedule_id))
        except ValueError:
            return None
        return await db.get(ProductionSchedule, sid)

    requested_by_sku_id = payload.get("requested_by_sku_id")
    q = select(ProductionSchedule).where(
        ProductionSchedule.facility_id == facility_id,
        ProductionSchedule.status.in_(("suggested", "approved")),
    )
    if line_id:
        q = q.where(ProductionSchedule.line_id == line_id)
    if requested_by_sku_id:
        q = q.where(ProductionSchedule.sku_id == requested_by_sku_id)
    q = q.order_by(ProductionSchedule.start_at.desc()).limit(1)
    return (await db.execute(q)).scalars().first()


async def apply_schedule_change(
    db: AsyncSession,
    *,
    payload: dict[str, Any],
    card_id: str,
    facility_id: str,
    line_id: str,
    substitute_sku_id: str,
    requested_units: int,
    now: datetime | None = None,
) -> ProductionSchedule:
    """Supersede the matched schedule and insert an approved replacement row."""
    now = now or datetime.now(timezone.utc)
    original = await find_schedule_for_change(db, payload, facility_id, line_id)
    if original is not None:
        original.status = "complete"

    start_at, end_at, version = resolve_schedule_window(payload, original, now)
    waste = float(payload.get("waste_avoided_kg") or 0)

    new_schedule = ProductionSchedule(
        facility_id=facility_id,
        line_id=line_id,
        sku_id=substitute_sku_id,
        start_at=start_at,
        end_at=end_at,
        quantity_units=requested_units,
        status="approved",
        waste_avoided_kg=waste,
        action_card_id=uuid.UUID(card_id),
        version=version,
        created_at=now,
    )
    db.add(new_schedule)
    await db.flush()
    return new_schedule
