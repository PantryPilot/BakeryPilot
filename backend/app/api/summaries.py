from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import WeeklySummary as SummaryORM
from app.db.session import get_db
from app.models.summaries import WeeklySummary
from app.services.weekly_summary import aggregate

router = APIRouter(prefix="/api/summaries", tags=["summaries"])


def _to_model(s: SummaryORM) -> WeeklySummary:
    return WeeklySummary(
        summary_id=str(s.summary_id),
        week_start=s.week_start.isoformat(),
        week_end=s.week_end.isoformat(),
        stats=s.stats,
        narration_md=s.narration_md or "",
        gmail_draft_url=s.gmail_draft_url,
        created_at=s.created_at.isoformat(),
    )


@router.get("", response_model=list[WeeklySummary])
async def list_summaries(db: AsyncSession = Depends(get_db)) -> list[WeeklySummary]:
    rows = (
        await db.execute(select(SummaryORM).order_by(SummaryORM.week_start.desc()))
    ).scalars().all()
    return [_to_model(r) for r in rows]


@router.get("/{summary_id}", response_model=WeeklySummary)
async def get_summary(
    summary_id: str, db: AsyncSession = Depends(get_db)
) -> WeeklySummary:
    s = await db.get(SummaryORM, summary_id)
    if not s:
        raise HTTPException(404, f"summary {summary_id} not found")
    return _to_model(s)


jobs_router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@jobs_router.post("/weekly_summary/run", response_model=WeeklySummary)
async def run_weekly_summary(
    week_start: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> WeeklySummary:
    ws_date = (
        date.fromisoformat(week_start)
        if week_start
        else date.today() - timedelta(days=date.today().weekday() + 7)
    )
    existing = (
        await db.execute(
            select(SummaryORM).where(SummaryORM.week_start == ws_date)
        )
    ).scalar_one_or_none()
    if existing:
        return _to_model(existing)

    stats = await aggregate(ws_date, db)
    summary = SummaryORM(
        week_start=ws_date,
        week_end=ws_date + timedelta(days=6),
        stats=stats,
        narration_md=None,
        gmail_draft_url=None,
    )
    db.add(summary)
    await db.commit()
    await db.refresh(summary)
    return _to_model(summary)


router.include_router(jobs_router)
