"""Create schedule_change action cards from the current schedule diff."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ActionCard as ActionCardORM,
    Facility,
    ProductionLine,
    ProductionSchedule as ScheduleORM,
    Sku,
)
from app.models.schedules import ScheduleChange, ScheduleDiff, ScheduleRun
from app.services.schedule_apply import parse_iso_dt, resolve_schedule, utc_iso


def _fmt_dt(dt: datetime) -> str:
    return dt.strftime("%a %d %b %Y, %H:%M")


def _fmt_time(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def format_schedule_window(start_iso: str, end_iso: str) -> str:
    start = parse_iso_dt(start_iso)
    end = parse_iso_dt(end_iso)
    return f"{_fmt_dt(start)} – {_fmt_time(end)} UTC"


def build_change_narration(
    *,
    facility_name: str,
    line_name: str,
    before_name: str,
    after_name: str,
    before_start: datetime,
    before_end: datetime,
    after_start: datetime,
    after_end: datetime,
) -> str:
    before_window = f"{_fmt_dt(before_start)} – {_fmt_time(before_end)} UTC"
    after_window = f"{_fmt_dt(after_start)} – {_fmt_time(after_end)} UTC"
    parts = [f"{facility_name} · {line_name}:"]
    if before_name != after_name:
        parts.append(f"replace {before_name} with {after_name}.")
    else:
        parts.append(f"reschedule {before_name}.")
    parts.append(f"Was {before_window}; proposed {after_window}.")
    if before_start.date() != after_start.date():
        parts.append(
            f"Date moves from {before_start.strftime('%a %d %b')} to {after_start.strftime('%a %d %b')}."
        )
    delta_h = (after_start - before_start).total_seconds() / 3600
    if abs(delta_h) >= 0.05:
        sign = "+" if delta_h > 0 else ""
        parts.append(f"Start time shifts {sign}{delta_h:.1f}h.")
    return " ".join(parts)


def build_schedule_diff(s: ScheduleORM) -> ScheduleDiff:
    """Build the optimizer diff for a schedule row (mock swap until OR-Tools lands)."""
    retailer_fields: dict[str, str | None] = {}
    retailer_note = ""
    ro = getattr(s, "retailer_order", None)
    if s.retailer_order_id and ro is not None:
        retailer_name = ro.retailer.name if getattr(ro, "retailer", None) else ro.retailer_id
        retailer_fields = {
            "retailer_order_id": str(s.retailer_order_id),
            "retailer_id": ro.retailer_id,
            "retailer_name": retailer_name,
            "requested_delivery_date": (
                ro.requested_delivery_date.isoformat() if ro.requested_delivery_date else None
            ),
        }
        retailer_note = f" Fulfills {retailer_name} retailer PO."

    before_run = ScheduleRun(
        run_id=str(s.schedule_id),
        sku_id=s.sku_id,
        start_at=utc_iso(s.start_at),
        end_at=utc_iso(s.end_at),
        quantity=s.quantity_units,
        lot_assignments=[],
        **retailer_fields,
    )
    after_run = ScheduleRun(
        run_id=str(s.schedule_id),
        sku_id=s.sku_id,
        start_at=utc_iso(s.start_at + timedelta(hours=1)),
        end_at=utc_iso(s.end_at + timedelta(hours=1)),
        quantity=s.quantity_units,
        lot_assignments=[],
        **retailer_fields,
    )
    before_window = format_schedule_window(before_run.start_at, before_run.end_at)
    after_window = format_schedule_window(after_run.start_at, after_run.end_at)
    return ScheduleDiff(
        before=[before_run],
        after=[after_run],
        changes=[
            ScheduleChange(
                kind="move",
                affected_run_ids=[str(s.schedule_id)],
                narration=(
                    f"Reschedule run on {s.line_id}: {before_window} → {after_window} "
                    f"(+1h start, same SKU)."
                    f"{retailer_note}"
                ),
            )
        ],
    )


async def build_schedule_change_payload(
    db: AsyncSession,
    s: ScheduleORM,
    before: ScheduleRun,
    after: ScheduleRun,
    *,
    agent: str = "SchedulerAgent",
    rationale: str | None = None,
) -> dict[str, Any]:
    sku_before = await db.get(Sku, before.sku_id)
    sku_after = await db.get(Sku, after.sku_id)
    facility = await db.get(Facility, s.facility_id)
    line = await db.get(ProductionLine, s.line_id)

    before_name = sku_before.name if sku_before else before.sku_id
    after_name = sku_after.name if sku_after else after.sku_id
    facility_name = facility.name if facility else s.facility_id
    line_name = line.name if line else s.line_id

    before_start = parse_iso_dt(before.start_at)
    before_end = parse_iso_dt(before.end_at)
    after_start = parse_iso_dt(after.start_at)
    after_end = parse_iso_dt(after.end_at)

    before_window = format_schedule_window(before.start_at, before.end_at)
    after_window = format_schedule_window(after.start_at, after.end_at)
    change_summary = build_change_narration(
        facility_name=facility_name,
        line_name=line_name,
        before_name=before_name,
        after_name=after_name,
        before_start=before_start,
        before_end=before_end,
        after_start=after_start,
        after_end=after_end,
    )

    return {
        "facility_id": s.facility_id,
        "line_id": s.line_id,
        "schedule_id": str(s.schedule_id),
        "substitute_sku_id": after.sku_id,
        "requested_by_sku_id": before.sku_id,
        "requested_units": after.quantity,
        "before_start_at": before.start_at,
        "before_end_at": before.end_at,
        "start_at": after.start_at,
        "end_at": after.end_at,
        "before_sku_name": before_name,
        "after_sku_name": after_name,
        "facility_name": facility_name,
        "line_name": line_name,
        "before_window": before_window,
        "after_window": after_window,
        "change_summary": change_summary,
        "rationale": rationale or change_summary,
        "title": f"{facility_name} · {before_name} → {after_name}",
        "agent": agent,
        **(
            {"retailer_order_id": str(s.retailer_order_id)}
            if s.retailer_order_id
            else {}
        ),
    }


async def create_schedule_change_card(
    db: AsyncSession,
    s: ScheduleORM,
    diff: ScheduleDiff,
    *,
    agent: str = "SchedulerAgent",
) -> ActionCardORM:
    before = diff.before[0]
    after = diff.after[0]
    payload = await build_schedule_change_payload(db, s, before, after, agent=agent)
    card = ActionCardORM(
        kind="schedule_change",
        payload=payload,
    )
    db.add(card)
    await db.flush()
    return card


async def propose_current_schedule_change(db: AsyncSession) -> ActionCardORM | None:
    """Resolve current schedule, build diff, and insert a pending action card."""
    s = await resolve_schedule(db, "current")
    if not s:
        return None
    diff = build_schedule_diff(s)
    card = await create_schedule_change_card(db, s, diff)
    await db.commit()
    await db.refresh(card)
    return card


async def resolve_schedule_for_draft(
    db: AsyncSession,
    *,
    schedule_id: str | None,
    facility_id: str,
    line_id: str | None,
    requested_by_sku_id: str,
) -> ScheduleORM | None:
    if schedule_id:
        resolved = await resolve_schedule(db, schedule_id)
        if resolved:
            return resolved
    q = select(ScheduleORM).where(
        ScheduleORM.facility_id == facility_id,
        ScheduleORM.sku_id == requested_by_sku_id,
        ScheduleORM.status.in_(("suggested", "approved")),
    )
    if line_id:
        q = q.where(ScheduleORM.line_id == line_id)
    q = q.order_by(ScheduleORM.start_at.desc()).limit(1)
    return (await db.execute(q)).scalars().first()
