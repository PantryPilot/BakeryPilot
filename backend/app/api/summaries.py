"""Weekly summaries router: archive + manual trigger."""

from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException

from app import mock_data
from app.models.summaries import WeeklySummary

router = APIRouter(prefix="/api/summaries", tags=["summaries"])


@router.get("", response_model=list[WeeklySummary])
async def list_summaries() -> list[WeeklySummary]:
    rows = sorted(mock_data.WEEKLY_SUMMARIES, key=lambda s: s["week_start"], reverse=True)
    return [WeeklySummary(**s) for s in rows]


@router.get("/{summary_id}", response_model=WeeklySummary)
async def get_summary(summary_id: str) -> WeeklySummary:
    row = next((s for s in mock_data.WEEKLY_SUMMARIES if s["summary_id"] == summary_id), None)
    if not row:
        raise HTTPException(404, f"summary {summary_id} not found")
    return WeeklySummary(**row)


jobs_router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@jobs_router.post("/weekly_summary/run", response_model=WeeklySummary)
async def run_weekly_summary(week_start: str | None = None) -> WeeklySummary:
    """Manual trigger. Idempotent per week_start: returns existing if present."""
    ws = week_start or (mock_data.TODAY - timedelta(days=7)).isoformat()
    existing = next(
        (s for s in mock_data.WEEKLY_SUMMARIES if s["week_start"] == ws), None,
    )
    if existing:
        return WeeklySummary(**existing)
    summary = {
        "summary_id": mock_data.new_id("ws"),
        "week_start": ws,
        "week_end": (datetime.fromisoformat(ws) + timedelta(days=6)).date().isoformat(),
        "stats": {
            "action_cards_confirmed": 11, "dollar_waste_avoided": 18230.0,
            "moq_tax_accumulated": 720.0, "supplier_disruptions_caught": 2,
            "schedule_changes_confirmed": 4, "new_supplier_orders": 7,
            "new_retailer_orders": 5,
        },
        "narration_md": (
            "## Weekly Summary\n\nDeterministic stub. Replace with Claude narration "
            "once `agent/agent/tools/summary_tools.py` is wired up."
        ),
        "gmail_draft_url": f"https://mail.google.com/mail/u/0/#drafts/mock-{ws}",
        "created_at": datetime.utcnow().isoformat(),
    }
    mock_data.WEEKLY_SUMMARIES.append(summary)
    return WeeklySummary(**summary)


router.include_router(jobs_router)
