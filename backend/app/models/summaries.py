"""Weekly summary models."""

from pydantic import BaseModel


class WeeklySummary(BaseModel):
    summary_id: str
    week_start: str
    week_end: str
    stats: dict
    narration_md: str
    gmail_draft_url: str | None
    created_at: str
