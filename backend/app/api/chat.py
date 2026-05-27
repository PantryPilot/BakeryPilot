import asyncio
import json
import uuid

from fastapi import APIRouter, HTTPException
from langchain_core.messages import AIMessage, HumanMessage
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.models.chat import ChatModelInfo, ChatRequest

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _sync_llm_env() -> None:
    import os

    os.environ.setdefault("ANTHROPIC_API_KEY", settings.anthropic_api_key)
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
async def chat(req: ChatRequest):
    _sync_llm_env()
    from agent.graph import _graph
    from agent.llm import is_model_available, set_request_model

    if req.model and not is_model_available(req.model):
        raise HTTPException(
            status_code=400,
            detail=f"Model '{req.model}' is not available. Check API keys and GET /api/chat/models.",
        )

    set_request_model(req.model)

    async def stream():
        thread_id = str(uuid.uuid4())
        config = {"configurable": {"thread_id": thread_id}}
        initial = {"messages": [HumanMessage(content=req.message)]}

        final_state: dict = {}
        try:
            async for state in _graph.astream(initial, config, stream_mode="values"):
                final_state = state
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
