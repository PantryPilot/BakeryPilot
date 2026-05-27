import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    action_cards,
    admin,
    alerts,
    chat,
    commodity_prices,
    dashboard,
    disruptions,
    esg,
    events,
    facilities,
    forecasts,
    inventory,
    negotiations,
    notifications,
    orders,
    pallets,
    production,
    retailers,
    schedules,
    stakeholders,
    summaries,
    suppliers,
    users,
    voice,
    yield_intel,
)
from app.config import settings
from app.db.session import session_scope
from app.services import data_refresh

logger = logging.getLogger("bakery_pilot.scheduler")

# How often the auto-refresh scheduler wakes up to check whether any
# data source is due. Refreshes themselves are gated by each source's
# `interval_seconds` setting; this just bounds the worst-case lag.
_SCHEDULER_TICK_SECONDS = 60


async def _auto_refresh_loop() -> None:
    """Background task: wake every minute, refresh any source whose interval has elapsed."""
    while True:
        try:
            async with session_scope() as db:
                due = await data_refresh.find_due_sources(db)
            for source_id in due:
                logger.info("auto-refresh firing for %s", source_id)
                async with session_scope() as bg_db:
                    try:
                        await data_refresh.trigger_refresh(bg_db, source_id)
                    except Exception:
                        logger.exception("auto-refresh failed for %s", source_id)
        except Exception:
            logger.exception("scheduler tick failed; will retry next interval")
        await asyncio.sleep(_SCHEDULER_TICK_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_auto_refresh_loop(), name="data-refresh-scheduler")
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass


app = FastAPI(
    title="BakeryPilot API",
    version="0.1.0",
    description="Agentic operations copilot for FGF Brands.",
    lifespan=lifespan,
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
    inventory.ingredients_router,
    suppliers.router,
    orders.router,
    action_cards.router,
    schedules.router,
    forecasts.router,
    yield_intel.router,
    esg.router,
    pallets.router,
    production.router,
    chat.router,
    commodity_prices.router,
    voice.router,
    notifications.router,
    stakeholders.router,
    summaries.router,
    events.router,
    disruptions.router,
    negotiations.router,
    alerts.router,
    admin.router,
    users.router,
    facilities.router,
    retailers.router,
    dashboard.router,
]:
    app.include_router(_router)
