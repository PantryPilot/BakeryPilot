"""FastAPI application entrypoint.

Mock-data mode: endpoints return deterministic stub data without touching the
database or the LangGraph agent. To switch to wired-up mode, swap the imports in
`app.api.*` to call services + agents.

Run locally:
    uv sync
    uv run uvicorn app.main:app --reload --port 8000

Then visit http://localhost:8000/docs for the auto-generated OpenAPI UI.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    action_cards,
    alerts,
    chat,
    disruptions,
    esg,
    events,
    forecasts,
    inventory,
    negotiations,
    notifications,
    orders,
    pallets,
    schedules,
    stakeholders,
    summaries,
    suppliers,
    voice,
    yield_intel,
)
from app.config import settings

app = FastAPI(
    title="BakeryPilot API",
    version="0.0.1",
    description=(
        "Agentic operations copilot for FGF Brands. "
        "Mock mode: endpoints return deterministic stub data; "
        "no DB or LangGraph agent calls yet."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz", tags=["meta"])
async def healthz() -> dict:
    """Liveness probe."""
    return {"status": "ok", "mode": "mock"}


for _router in [
    inventory.router,
    suppliers.router,
    orders.router,
    action_cards.router,
    schedules.router,
    forecasts.router,
    yield_intel.router,
    esg.router,
    pallets.router,
    chat.router,
    voice.router,
    notifications.router,
    stakeholders.router,
    summaries.router,
    events.router,
    disruptions.router,
    negotiations.router,
    alerts.router,
]:
    app.include_router(_router)
