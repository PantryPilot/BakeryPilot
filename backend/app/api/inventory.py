"""Inventory router: lots, spoilage score, substitution candidates, transfers."""

from fastapi import APIRouter, HTTPException, Query

from app import mock_data
from app.models.inventory import IngredientLot, SubstitutionCandidate

router = APIRouter(prefix="/api/lots", tags=["inventory"])


@router.get("", response_model=list[IngredientLot])
async def list_lots(
    facility_id: str | None = Query(None),
    sort_by_risk: bool = Query(True),
) -> list[IngredientLot]:
    """List ingredient lots with computed spoilage risk score."""
    rows = mock_data.INGREDIENT_LOTS
    if facility_id:
        rows = [r for r in rows if r["facility_id"] == facility_id]
    if sort_by_risk:
        rows = sorted(rows, key=lambda r: r["spoilage_risk_score"], reverse=True)
    return [IngredientLot(**r) for r in rows]


@router.get("/{lot_id}", response_model=IngredientLot)
async def get_lot(lot_id: str) -> IngredientLot:
    row = next((r for r in mock_data.INGREDIENT_LOTS if r["lot_id"] == lot_id), None)
    if not row:
        raise HTTPException(404, f"lot {lot_id} not found")
    return IngredientLot(**row)


@router.get("/{lot_id}/substitutions", response_model=list[SubstitutionCandidate])
async def substitution_candidates(lot_id: str) -> list[SubstitutionCandidate]:
    """Mock substitution candidates when a target SKU is blocked."""
    if not any(r["lot_id"] == lot_id for r in mock_data.INGREDIENT_LOTS):
        raise HTTPException(404, f"lot {lot_id} not found")
    return [
        SubstitutionCandidate(
            sku_id="sku_lemon_poppy", sku_name="Lemon Poppy Seed Muffin",
            achievable_quantity=5000, margin_score=0.92,
            reason="Full capacity on Line 1; flour + sugar in stock; allergen compatible",
        ),
        SubstitutionCandidate(
            sku_id="sku_chocolate_chip", sku_name="Chocolate Chip Muffin",
            achievable_quantity=4500, margin_score=0.88,
            reason="Full capacity on Line 2; choc chips and flour in stock",
        ),
    ]
