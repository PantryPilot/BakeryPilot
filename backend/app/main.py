from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    action_cards,
    admin,
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
    version="0.1.0",
    description="Agentic operations copilot for FGF Brands.",
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
    return {"status": "ok"}


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
    admin.router,
]:
    app.include_router(_router)
