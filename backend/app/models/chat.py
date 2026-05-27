"""Chat message + SSE event models."""

from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    model: str | None = None


class ChatModelInfo(BaseModel):
    id: str
    label: str
    provider: str
    tier: str
    description: str
    available: bool
    is_default: bool
