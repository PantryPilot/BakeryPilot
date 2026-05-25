"""ESG router: waste counter, pattern analysis, Scope 3 PDF download."""

from fastapi import APIRouter
from fastapi.responses import Response

from app import mock_data
from app.models.esg import ESGPattern, WasteCounter

router = APIRouter(prefix="/api/esg", tags=["esg"])


@router.get("/counter", response_model=WasteCounter)
async def waste_counter() -> WasteCounter:
    return WasteCounter(**mock_data.WASTE_COUNTER)


@router.get("/patterns", response_model=list[ESGPattern])
async def list_patterns() -> list[ESGPattern]:
    return [ESGPattern(**p) for p in mock_data.ESG_PATTERNS]


@router.get("/scope3.pdf")
async def scope_3_pdf(facility_id: str | None = None) -> Response:
    """Mock Scope 3 PDF -- returns a tiny placeholder bytes payload."""
    placeholder = (
        b"%PDF-1.4\n"
        b"% Scope 3 placeholder. Replace with WeasyPrint/ReportLab output.\n"
    )
    headers = {"Content-Disposition": "attachment; filename=scope3.pdf"}
    return Response(content=placeholder, media_type="application/pdf", headers=headers)
