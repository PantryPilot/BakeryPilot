from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv()

BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8000")

ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB: str = os.getenv("MONGODB_DB", "bakery_pilot")

LANGCHAIN_TRACING_V2: str = os.getenv("LANGCHAIN_TRACING_V2", "false")
LANGCHAIN_PROJECT: str = os.getenv("LANGCHAIN_PROJECT", "bakery-pilot")
LANGCHAIN_API_KEY: str = os.getenv("LANGCHAIN_API_KEY", "")

OPIK_API_KEY: str = os.getenv("OPIK_API_KEY", "")
OPIK_PROJECT: str = os.getenv("OPIK_PROJECT", "bakery-pilot")

PROMPT_CACHE_TTL_SECONDS: int = int(os.getenv("PROMPT_CACHE_TTL_SECONDS", "60"))

_MODEL_MAP: dict[str, str] = {
    "default": os.getenv("DEFAULT_MODEL", "claude-sonnet-4-6"),
    "negotiation": os.getenv("NEGOTIATION_MODEL", "claude-opus-4-7"),
    "summary": os.getenv("SUMMARY_MODEL", "claude-sonnet-4-6"),
}


def get_model(purpose: str = "default") -> str:
    return _MODEL_MAP.get(purpose, _MODEL_MAP["default"])
