"""Suppliers router: master, scorecard, MOQ-tax ledger, contract lifecycle."""

from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException

from app import mock_data
from app.models.suppliers import MOQTaxEntry, Supplier

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


@router.get("", response_model=list[Supplier])
async def list_suppliers() -> list[Supplier]:
    return [Supplier(**s) for s in mock_data.SUPPLIERS]


@router.get("/{supplier_id}", response_model=Supplier)
async def get_supplier(supplier_id: str) -> Supplier:
    row = next((s for s in mock_data.SUPPLIERS if s["supplier_id"] == supplier_id), None)
    if not row:
        raise HTTPException(404, f"supplier {supplier_id} not found")
    return Supplier(**row)


@router.get("/{supplier_id}/moq_tax", response_model=list[MOQTaxEntry])
async def moq_tax_ledger(supplier_id: str) -> list[MOQTaxEntry]:
    row = next((s for s in mock_data.SUPPLIERS if s["supplier_id"] == supplier_id), None)
    if not row:
        raise HTTPException(404, f"supplier {supplier_id} not found")
    now = datetime.utcnow()
    quarter = f"{now.year}-Q{(now.month - 1) // 3 + 1}"
    return [
        MOQTaxEntry(
            supplier_id=supplier_id, quarter=quarter, overage_kg=350.0,
            holding_cost_usd=row["moq_tax_quarter_usd"] * 0.6,
            recorded_at=(now - timedelta(days=20)).isoformat(),
        ),
        MOQTaxEntry(
            supplier_id=supplier_id, quarter=quarter, overage_kg=180.0,
            holding_cost_usd=row["moq_tax_quarter_usd"] * 0.4,
            recorded_at=(now - timedelta(days=5)).isoformat(),
        ),
    ]
