"""Facility list, detail, storage utilisation, and in-flight runs.

Drives the FlowSight canvas (plant utilisation rings, FactoryView lines and
storage caps) and the TopBar facility selector. The frontend keeps the on-canvas
x/y positions and `p1`-`p4` short codes as UI layout; this router supplies the
domain data that should not be hardcoded.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Facility,
    Ingredient,
    IngredientLot,
    ProductionLine,
    ProductionRun,
    Sku,
    WarehouseCost,
)
from app.db.session import get_db

router = APIRouter(prefix="/api/facilities", tags=["facilities"])


# Stable short codes so the frontend FACILITY_MAP keeps working without a
# DB schema change.
_SHORT_CODE_MAP: dict[str, str] = {
    "plant-toronto": "p1",
    "plant-mississauga": "p2",
    "plant-hamilton": "p3",
    "plant-montreal": "p4",
    # Legacy mock prefix support for older seeds.
    "plant_1": "p1",
    "plant_2": "p2",
    "plant_3": "p3",
    "plant_4": "p4",
}


def short_code_for(facility_id: str) -> str:
    return _SHORT_CODE_MAP.get(facility_id, facility_id)


class FacilityRow(BaseModel):
    facility_id: str
    short_code: str
    name: str
    city: str | None = None
    province: str | None = None
    timezone: str
    cold_capacity_kg: float | None = None
    dry_capacity_kg: float | None = None
    line_count: int = 0


class FacilityUtilizationZone(BaseModel):
    zone: str  # frozen | refrigerated | dry
    used_kg: float
    capacity_kg: float
    pct: float  # 0..1


class FacilityUtilization(BaseModel):
    facility_id: str
    short_code: str
    zones: list[FacilityUtilizationZone]
    overall_pct: float


class ActiveRunRow(BaseModel):
    run_id: str
    line_id: str
    line_number: int
    sku_id: str
    sku_name: str
    started_at: str
    ended_at: str | None = None
    planned_kg: float | None = None
    actual_kg: float | None = None
    status: str


async def _line_count(db: AsyncSession, facility_id: str) -> int:
    count = (
        await db.execute(
            select(func.count())
            .select_from(ProductionLine)
            .where(ProductionLine.facility_id == facility_id)
        )
    ).scalar_one()
    return int(count or 0)


def _to_row(f: Facility, line_count: int) -> FacilityRow:
    return FacilityRow(
        facility_id=f.facility_id,
        short_code=short_code_for(f.facility_id),
        name=f.name,
        city=f.city,
        province=f.province,
        timezone=f.timezone,
        cold_capacity_kg=float(f.cold_capacity_kg) if f.cold_capacity_kg is not None else None,
        dry_capacity_kg=float(f.dry_capacity_kg) if f.dry_capacity_kg is not None else None,
        line_count=line_count,
    )


@router.get("", response_model=list[FacilityRow])
async def list_facilities(db: AsyncSession = Depends(get_db)) -> list[FacilityRow]:
    facilities = (await db.execute(select(Facility).order_by(Facility.name))).scalars().all()
    rows: list[FacilityRow] = []
    for f in facilities:
        rows.append(_to_row(f, await _line_count(db, f.facility_id)))
    return rows


@router.get("/{facility_id}", response_model=FacilityRow)
async def get_facility(facility_id: str, db: AsyncSession = Depends(get_db)) -> FacilityRow:
    f = await db.get(Facility, facility_id)
    if not f:
        raise HTTPException(404, f"facility {facility_id} not found")
    return _to_row(f, await _line_count(db, facility_id))


@router.get("/{facility_id}/utilization", response_model=FacilityUtilization)
async def facility_utilization(
    facility_id: str, db: AsyncSession = Depends(get_db)
) -> FacilityUtilization:
    f = await db.get(Facility, facility_id)
    if not f:
        raise HTTPException(404, f"facility {facility_id} not found")

    # Used kg per zone from active ingredient lots at this facility.
    used_rows = (
        await db.execute(
            select(IngredientLot.storage_zone, func.sum(IngredientLot.quantity_kg))
            .where(
                IngredientLot.facility_id == facility_id,
                IngredientLot.quantity_kg > 0,
            )
            .group_by(IngredientLot.storage_zone)
        )
    ).all()
    used_by_zone: dict[str, float] = {z: float(kg or 0) for z, kg in used_rows}

    # Capacity per zone from warehouse_costs. Fall back to reasonable defaults
    # so frontends never see /0.
    cap_rows = (
        await db.execute(
            select(WarehouseCost.storage_type, WarehouseCost.capacity_kg)
            .where(WarehouseCost.facility_id == facility_id)
        )
    ).all()
    capacity_by_zone: dict[str, float] = {t: float(kg or 0) for t, kg in cap_rows}

    zones_out: list[FacilityUtilizationZone] = []
    total_used = 0.0
    total_cap = 0.0
    for zone in ("frozen", "refrigerated", "dry"):
        used = used_by_zone.get(zone, 0.0)
        cap = capacity_by_zone.get(zone, 0.0) or _default_capacity_for(f, zone)
        pct = (used / cap) if cap > 0 else 0.0
        zones_out.append(
            FacilityUtilizationZone(
                zone=zone, used_kg=round(used, 1), capacity_kg=round(cap, 1), pct=round(min(1.0, pct), 4)
            )
        )
        total_used += used
        total_cap += cap

    overall = (total_used / total_cap) if total_cap > 0 else 0.0
    return FacilityUtilization(
        facility_id=facility_id,
        short_code=short_code_for(facility_id),
        zones=zones_out,
        overall_pct=round(min(1.0, overall), 4),
    )


def _default_capacity_for(f: Facility, zone: str) -> float:
    """Fallback capacities derived from facility cold/dry totals when warehouse_costs is empty."""
    cold = float(f.cold_capacity_kg or 50_000)
    dry = float(f.dry_capacity_kg or 100_000)
    if zone == "frozen":
        return cold * 0.6
    if zone == "refrigerated":
        return cold * 0.4
    if zone == "dry":
        return dry
    return 1_000.0


@router.get("/{facility_id}/active_runs", response_model=list[ActiveRunRow])
async def active_runs(
    facility_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[ActiveRunRow]:
    f = await db.get(Facility, facility_id)
    if not f:
        raise HTTPException(404, f"facility {facility_id} not found")

    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    rows = (
        await db.execute(
            select(ProductionRun)
            .where(
                ProductionRun.facility_id == facility_id,
                ProductionRun.started_at >= cutoff,
            )
            .order_by(ProductionRun.started_at.desc())
            .limit(8)
        )
    ).scalars().all()

    # Pull SKU names in one round-trip
    sku_ids = {r.sku_id for r in rows}
    sku_names: dict[str, str] = {}
    if sku_ids:
        sku_rows = (
            await db.execute(select(Sku).where(Sku.sku_id.in_(sku_ids)))
        ).scalars().all()
        sku_names = {s.sku_id: s.name for s in sku_rows}

    out: list[ActiveRunRow] = []
    for r in rows:
        raw_line = (r.line_id or "").rsplit("-", 1)[-1]
        try:
            line_number = int("".join(c for c in raw_line if c.isdigit()))
        except ValueError:
            line_number = 0
        out.append(
            ActiveRunRow(
                run_id=str(r.run_id),
                line_id=r.line_id,
                line_number=line_number or 1,
                sku_id=r.sku_id,
                sku_name=sku_names.get(r.sku_id, r.sku_id),
                started_at=r.started_at.isoformat(),
                ended_at=r.ended_at.isoformat() if r.ended_at else None,
                planned_kg=float(r.planned_kg) if r.planned_kg is not None else None,
                actual_kg=float(r.actual_kg) if r.actual_kg is not None else None,
                status=r.status,
            )
        )
    return out


# Optional helper kept off the public list: returns ingredient lot counts per
# storage zone for a facility (used by the FactoryView "expiring lot" hint).
# Defined here for cohesion but not exposed under a route for now.
async def _expiring_lot_for_facility(db: AsyncSession, facility_id: str) -> dict | None:
    rows = (
        await db.execute(
            select(IngredientLot, Ingredient)
            .join(Ingredient, Ingredient.ingredient_id == IngredientLot.ingredient_id)
            .where(IngredientLot.facility_id == facility_id, IngredientLot.quantity_kg > 0)
            .order_by(IngredientLot.expiry_date.asc())
            .limit(1)
        )
    ).all()
    if not rows:
        return None
    lot, ing = rows[0]
    return {
        "lot_id": str(lot.lot_id),
        "ingredient_name": ing.name,
        "expiry_date": lot.expiry_date.isoformat(),
    }
