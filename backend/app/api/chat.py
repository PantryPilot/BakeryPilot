import asyncio
import json
import uuid

from fastapi import APIRouter
from langchain_core.messages import AIMessage, HumanMessage
from sse_starlette.sse import EventSourceResponse

from app.models.chat import ChatRequest

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


@router.get("/ping")
async def chat_ping():
    async def stream():
        for word in ["pong ", "from ", "backend!"]:
            yield {"event": "message", "data": json.dumps({"content": word})}
            await asyncio.sleep(0.1)
        yield {"event": "done", "data": "{}"}
    return EventSourceResponse(stream())


@router.post("")
async def chat(req: ChatRequest):
    import os
    from app.config import settings
    os.environ.setdefault("ANTHROPIC_API_KEY", settings.anthropic_api_key)
    from agent.graph import _graph

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
            for line in last.content.splitlines(keepends=True):
                stripped = line.strip()
                if stripped.startswith("|") or stripped.startswith("|-"):
                    # Stream table rows whole so pipes and newlines stay intact
                    yield {
                        "event": "message",
                        "data": json.dumps({"content": line}),
                    }
                    await asyncio.sleep(0.01)
                else:
                    for word in line.split(" "):
                        if word:
                            yield {
                                "event": "message",
                                "data": json.dumps({"content": word + " "}),
                            }
                            await asyncio.sleep(0.02)
                    if not line.endswith("\n"):
                        yield {
                            "event": "message",
                            "data": json.dumps({"content": "\n"}),
                        }

        action_cards = final_state.get("action_cards", [])
        if action_cards:
            card = action_cards[-1]
            yield {
                "event": "action_card",
                "data": json.dumps({"action_card_id": card.get("action_card_id", "")}),
            }

        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(stream())
