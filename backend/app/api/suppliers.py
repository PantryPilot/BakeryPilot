from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import MoqTaxEntry, Supplier as SupplierORM
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
