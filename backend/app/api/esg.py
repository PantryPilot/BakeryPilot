from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.esg import ESGPattern, WasteCounter, WasteEvent
from app.services.esg import compute_running_counter, get_esg_patterns, list_waste_events

router = APIRouter(prefix="/api/esg", tags=["esg"])


@router.get("/counter", response_model=WasteCounter)
async def waste_counter(
    facility_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> WasteCounter:
    data = await compute_running_counter(db, facility_id)
    return WasteCounter(**data)


@router.get("/patterns", response_model=list[ESGPattern])
async def list_patterns(db: AsyncSession = Depends(get_db)) -> list[ESGPattern]:
    patterns = await get_esg_patterns(db)
    return [ESGPattern(**p) for p in patterns]


@router.get("/waste_events", response_model=list[WasteEvent])
async def waste_events(
    facility_id: str | None = Query(None),
    avoided: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[WasteEvent]:
    rows = await list_waste_events(db, facility_id, limit)
    if avoided is not None:
        rows = [r for r in rows if r["avoided"] == avoided]
    return [WasteEvent(**r) for r in rows]


@router.get("/scope3.pdf")
async def scope_3_pdf(facility_id: str | None = None) -> Response:
    placeholder = (
        b"%PDF-1.4\n"
        b"% Scope 3 placeholder. Replace with WeasyPrint/ReportLab output.\n"
    )
    headers = {"Content-Disposition": "attachment; filename=scope3.pdf"}
    return Response(content=placeholder, media_type="application/pdf", headers=headers)
