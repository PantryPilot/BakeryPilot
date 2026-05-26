"""ESG router: waste counter, pattern analysis, Scope 3 PDF download."""

from fastapi import APIRouter, Query
from fastapi.responses import Response

from app import mock_data
from app.models.esg import ESGPattern, WasteCounter, WasteEvent

router = APIRouter(prefix="/api/esg", tags=["esg"])


@router.get("/counter", response_model=WasteCounter)
async def waste_counter() -> WasteCounter:
    return WasteCounter(**mock_data.WASTE_COUNTER)


@router.get("/patterns", response_model=list[ESGPattern])
async def list_patterns() -> list[ESGPattern]:
    return [ESGPattern(**p) for p in mock_data.ESG_PATTERNS]


@router.get("/waste_events", response_model=list[WasteEvent])
async def list_waste_events(
    facility_id: str | None = Query(None),
    avoided: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
) -> list[WasteEvent]:
    rows = mock_data.WASTE_EVENTS
    if facility_id:
        rows = [r for r in rows if r["facility_id"] == facility_id]
    if avoided is not None:
        rows = [r for r in rows if r["avoided"] == avoided]
    return [WasteEvent(**r) for r in rows[:limit]]


@router.get("/scope3.pdf")
async def scope_3_pdf(facility_id: str | None = None) -> Response:
    """Mock Scope 3 PDF -- returns a tiny placeholder bytes payload."""
    placeholder = (
        b"%PDF-1.4\n"
        b"% Scope 3 placeholder. Replace with WeasyPrint/ReportLab output.\n"
    )
    headers = {"Content-Disposition": "attachment; filename=scope3.pdf"}
    return Response(content=placeholder, media_type="application/pdf", headers=headers)
