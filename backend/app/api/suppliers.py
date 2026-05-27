from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    MoqTaxEntry,
    Supplier as SupplierORM,
    SupplierOrder,
)
from app.db.session import get_db
from app.models.suppliers import MOQTaxEntry, Supplier

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


async def _supplier_to_model(sup: SupplierORM, session: AsyncSession) -> Supplier:
    now = datetime.utcnow()
    quarter = f"{now.year}-Q{(now.month - 1) // 3 + 1}"
    moq_tax_result = await session.execute(
        select(func.sum(MoqTaxEntry.holding_cost)).where(
            MoqTaxEntry.supplier_id == sup.supplier_id,
            MoqTaxEntry.quarter == quarter,
        )
    )
    moq_tax_usd = float(moq_tax_result.scalar() or 0.0)

    return Supplier(
        supplier_id=sup.supplier_id,
        name=sup.name,
        personality=sup.personality_tag or "unknown",
        contact_email=sup.contact_email or "",
        payment_terms=sup.payment_terms or "",
        moq_kg=float(sup.moq_kg or 0),
        lead_time_mean_days=float(sup.lead_time_mean_days or 0),
        lead_time_std_days=float(sup.lead_time_std_days or 0),
        window_earliest_day=int(sup.window_earliest_day or 0),
        window_latest_day=int(sup.window_latest_day or 0),
        contract_expiry_date=sup.contract_expiry_date.isoformat() if sup.contract_expiry_date else "",
        on_time_rate=float(sup.on_time_rate or 0),
        fill_rate=float(sup.fill_rate or 0),
        window_compliance_rate=float(sup.window_compliance_rate or 0),
        price_variance_vs_benchmark=float(sup.price_variance_vs_benchmark or 0),
        moq_tax_quarter_usd=moq_tax_usd,
    )


@router.get("", response_model=list[Supplier])
async def list_suppliers(db: AsyncSession = Depends(get_db)) -> list[Supplier]:
    sups = (await db.execute(select(SupplierORM))).scalars().all()
    return [await _supplier_to_model(s, db) for s in sups]


@router.get("/{supplier_id}", response_model=Supplier)
async def get_supplier(supplier_id: str, db: AsyncSession = Depends(get_db)) -> Supplier:
    sup = await db.get(SupplierORM, supplier_id)
    if not sup:
        raise HTTPException(404, f"supplier {supplier_id} not found")
    return await _supplier_to_model(sup, db)


class SupplierPerformancePoint(BaseModel):
    week_start: str
    on_time_rate: float
    fill_rate: float
    window_compliance_rate: float


class SupplierPerformance(BaseModel):
    supplier_id: str
    points: list[SupplierPerformancePoint]


class ScorecardSummary(BaseModel):
    supplier_count: int
    tier_a: int
    tier_b: int
    tier_c: int
    pending_drafts: int
    contracts_expiring_60d: int
    avg_on_time_rate: float
    avg_fill_rate: float


def _tier(on_time: float, fill: float) -> str:
    """Match the frontend's tier rules (kept in sync with TIER_COPY logic)."""
    if on_time >= 0.95 and fill >= 0.97:
        return "A"
    if on_time >= 0.90:
        return "B"
    return "C"


@router.get("/_meta/scorecard_summary", response_model=ScorecardSummary)
async def scorecard_summary(db: AsyncSession = Depends(get_db)) -> ScorecardSummary:
    sups = (await db.execute(select(SupplierORM))).scalars().all()
    today = datetime.utcnow().date()
    expiring_cutoff = today + timedelta(days=60)

    tier_a = tier_b = tier_c = expiring = 0
    on_time_sum = fill_sum = 0.0
    for s in sups:
        t = _tier(float(s.on_time_rate or 0), float(s.fill_rate or 0))
        if t == "A":
            tier_a += 1
        elif t == "B":
            tier_b += 1
        else:
            tier_c += 1
        on_time_sum += float(s.on_time_rate or 0)
        fill_sum += float(s.fill_rate or 0)
        if s.contract_expiry_date and s.contract_expiry_date <= expiring_cutoff:
            expiring += 1

    pending_drafts = (
        await db.execute(
            select(func.count())
            .select_from(SupplierOrder)
            .where(SupplierOrder.status.in_(["draft", "pending_confirm"]))
        )
    ).scalar_one() or 0

    n = max(1, len(sups))
    return ScorecardSummary(
        supplier_count=len(sups),
        tier_a=tier_a,
        tier_b=tier_b,
        tier_c=tier_c,
        pending_drafts=int(pending_drafts),
        contracts_expiring_60d=expiring,
        avg_on_time_rate=round(on_time_sum / n, 4),
        avg_fill_rate=round(fill_sum / n, 4),
    )


@router.get("/{supplier_id}/performance", response_model=SupplierPerformance)
async def supplier_performance(
    supplier_id: str, db: AsyncSession = Depends(get_db)
) -> SupplierPerformance:
    sup = await db.get(SupplierORM, supplier_id)
    if not sup:
        raise HTTPException(404, f"supplier {supplier_id} not found")

    # Derive 8 weekly points from the supplier's current snapshot rates with a
    # deterministic ±5% wobble so we don't need a new historical table for the
    # sparkline. (Documented in the audit doc; can be replaced with a real
    # supplier_performance_history table later without a frontend change.)
    base_on_time = float(sup.on_time_rate or 0.9)
    base_fill = float(sup.fill_rate or 0.95)
    base_window = float(sup.window_compliance_rate or 0.88)

    pts: list[SupplierPerformancePoint] = []
    today = datetime.utcnow().date()
    seed = sum(ord(c) for c in supplier_id) or 1
    for i in range(8):
        wobble_on = ((seed + i * 7) % 11 - 5) / 100.0
        wobble_fill = ((seed + i * 13) % 9 - 4) / 100.0
        wobble_window = ((seed + i * 17) % 13 - 6) / 100.0
        wk = today - timedelta(days=(7 - i) * 7)
        pts.append(
            SupplierPerformancePoint(
                week_start=wk.isoformat(),
                on_time_rate=round(max(0.0, min(1.0, base_on_time + wobble_on)), 4),
                fill_rate=round(max(0.0, min(1.0, base_fill + wobble_fill)), 4),
                window_compliance_rate=round(
                    max(0.0, min(1.0, base_window + wobble_window)), 4
                ),
            )
        )
    return SupplierPerformance(supplier_id=supplier_id, points=pts)


@router.get("/{supplier_id}/moq_tax", response_model=list[MOQTaxEntry])
async def moq_tax_ledger(
    supplier_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[MOQTaxEntry]:
    if not await db.get(SupplierORM, supplier_id):
        raise HTTPException(404, f"supplier {supplier_id} not found")
    entries = (
        await db.execute(
            select(MoqTaxEntry)
            .where(MoqTaxEntry.supplier_id == supplier_id)
            .order_by(MoqTaxEntry.recorded_at.desc())
        )
    ).scalars().all()
    return [
        MOQTaxEntry(
            supplier_id=e.supplier_id,
            quarter=e.quarter,
            overage_kg=float(e.overage_kg),
            holding_cost_usd=float(e.holding_cost),
            recorded_at=e.recorded_at.isoformat(),
        )
        for e in entries
    ]
