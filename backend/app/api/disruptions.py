"""Disruptions router: supplier risk signal feed."""

from fastapi import APIRouter, Query

from app import mock_data
from app.models.suppliers import DisruptionSignal

router = APIRouter(prefix="/api/disruptions", tags=["disruptions"])


@router.get("", response_model=list[DisruptionSignal])
async def list_disruptions(
    supplier_id: str | None = Query(None),
    min_severity: float = Query(0.0, ge=0.0, le=1.0),
) -> list[DisruptionSignal]:
    rows = mock_data.DISRUPTION_SIGNALS
    if supplier_id:
        rows = [d for d in rows if d["supplier_id"] == supplier_id]
    rows = [d for d in rows if d["severity"] >= min_severity]
    rows = sorted(rows, key=lambda d: d["observed_at"], reverse=True)
    return [DisruptionSignal(**d) for d in rows]
