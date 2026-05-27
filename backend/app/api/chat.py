import asyncio
import json
import re
import uuid

from fastapi import APIRouter, Depends
from langchain_core.messages import AIMessage, HumanMessage
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.db.session import get_db
from app.models.chat import ChatModelInfo, ChatRequest
from app.services.app_settings import get_copilot_model

router = APIRouter(prefix="/api/chat", tags=["chat"])

_INTENT_STATUS = {
    "inventory":       "InventoryAgent · checking lots & stock levels",
    "procurement":     "ProcurementAgent · analyzing suppliers & costs",
    "scheduler":       "SchedulerAgent · reviewing production schedule",
    "yield":           "YieldAgent · pulling yield telemetry",
    "esg":             "ESGAgent · computing waste & CO₂e",
    "weekly_plan":     "WeeklyPlanAgent · composing weekly plan",
    "weekly_summary":  "SummaryAgent · generating report",
}


def _status(text: str) -> dict:
    return {"event": "status", "data": json.dumps({"text": text})}


def _sync_llm_env() -> None:
    import os

    os.environ.setdefault("ANTHROPIC_API_KEY", settings.anthropic_api_key)
    if settings.openai_api_key:
        os.environ["OPENAI_API_KEY"] = settings.openai_api_key
    if settings.google_api_key:
        os.environ["GOOGLE_API_KEY"] = settings.google_api_key
    if settings.groq_api_key:
        os.environ["GROQ_API_KEY"] = settings.groq_api_key


@router.get("/models", response_model=list[ChatModelInfo])
async def list_chat_models():
    _sync_llm_env()
    from agent.llm import list_available_models

    return list_available_models()


@router.get("/ping")
async def chat_ping():
    async def stream():
        for word in ["pong ", "from ", "backend!"]:
            yield {"event": "message", "data": json.dumps({"content": word})}
            await asyncio.sleep(0.1)
        yield {"event": "done", "data": "{}"}
    return EventSourceResponse(stream())


@router.post("")
async def chat(req: ChatRequest, db: AsyncSession = Depends(get_db)):
    _sync_llm_env()
    from agent.graph import _graph
    from agent.llm import set_request_model

    model_id = await get_copilot_model(db)
    set_request_model(model_id)

    async def stream():
        thread_id = str(uuid.uuid4())
        config = {"configurable": {"thread_id": thread_id}}
        initial = {"messages": [HumanMessage(content=req.message)]}

        yield _status("Thinking…")

        final_state: dict = {}
        emission_count = 0
        try:
            async for state in _graph.astream(initial, config, stream_mode="values"):
                final_state = state
                emission_count += 1

                intent = state.get("intent", "general")

                if emission_count == 1:
                    # classify_intent just finished — report which agent will run
                    status_text = _INTENT_STATUS.get(intent, "Consulting copilot…")
                    yield _status(status_text)
                elif emission_count == 2 and intent != "general":
                    # Specialist agent finished, respond node is next
                    yield _status("Drafting response…")

        except Exception as exc:
            yield {
                "event": "message",
                "data": json.dumps({"content": f"[agent error: {exc}]"}),
            }
            yield {"event": "done", "data": "{}"}
            return

        messages = final_state.get("messages", [])
        last = messages[-1] if messages else None
        if isinstance(last, AIMessage) and last.content:
            for token in re.findall(r"\S+|\s+", last.content):
                yield {
                    "event": "message",
                    "data": json.dumps({"content": token}),
                }
                await asyncio.sleep(0.012)

        action_cards = final_state.get("action_cards", [])
        if action_cards:
            card = action_cards[-1]
            yield {
                "event": "action_card",
                "data": json.dumps({"action_card_id": card.get("action_card_id", "")}),
            }

        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(stream())
