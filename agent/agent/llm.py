"""Multi-provider LLM factory with per-request model selection."""

from __future__ import annotations

import os
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel

from agent.config import get_model

_request_model_id: ContextVar[str | None] = ContextVar("request_model_id", default=None)


@dataclass(frozen=True)
class ModelSpec:
    id: str
    label: str
    provider: str
    model: str
    tier: str
    key_env: str
    description: str = ""


MODEL_CATALOG: dict[str, ModelSpec] = {
    "claude-sonnet-4-6": ModelSpec(
        id="claude-sonnet-4-6",
        label="Claude Sonnet 4.6",
        provider="anthropic",
        model="claude-sonnet-4-6",
        tier="premium",
        key_env="ANTHROPIC_API_KEY",
        description="Default agent model — strong tool use and reasoning",
    ),
    "gpt-4o": ModelSpec(
        id="gpt-4o",
        label="GPT-4o",
        provider="openai",
        model="gpt-4o",
        tier="premium",
        key_env="OPENAI_API_KEY",
        description="OpenAI flagship — strong tool use and reasoning",
    ),
    "gpt-4o-mini": ModelSpec(
        id="gpt-4o-mini",
        label="GPT-4o Mini",
        provider="openai",
        model="gpt-4o-mini",
        tier="free",
        key_env="OPENAI_API_KEY",
        description="Cheap OpenAI model — good default for everyday calls",
    ),
    "gemini-2.0-flash": ModelSpec(
        id="gemini-2.0-flash",
        label="Gemini 2.0 Flash",
        provider="google",
        model="gemini-2.0-flash",
        tier="free",
        key_env="GOOGLE_API_KEY",
        description="Fast Google model — free tier via AI Studio",
    ),
    "gemini-2.0-flash-lite": ModelSpec(
        id="gemini-2.0-flash-lite",
        label="Gemini 2.0 Flash Lite",
        provider="google",
        model="gemini-2.0-flash-lite",
        tier="free",
        key_env="GOOGLE_API_KEY",
        description="Lightweight Gemini — lower latency, free tier",
    ),
    "llama-3.3-70b-versatile": ModelSpec(
        id="llama-3.3-70b-versatile",
        label="Meta Llama 3.3 70B",
        provider="meta",
        model="llama-3.3-70b-versatile",
        tier="free",
        key_env="GROQ_API_KEY",
        description="Meta Llama 3.3 — free tier",
    ),
    "llama-3.1-8b-instant": ModelSpec(
        id="llama-3.1-8b-instant",
        label="Meta Llama 3.1 8B",
        provider="meta",
        model="llama-3.1-8b-instant",
        tier="free",
        key_env="GROQ_API_KEY",
        description="Fast Meta Llama model — free tier",
    ),
    "gemma2-9b-it": ModelSpec(
        id="gemma2-9b-it",
        label="Gemma 2 9B",
        provider="meta",
        model="gemma2-9b-it",
        tier="free",
        key_env="GROQ_API_KEY",
        description="Google Gemma 2 — free tier",
    ),
}

_KEY_ENVS = ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "GROQ_API_KEY")

_react_agent_cache: dict[tuple[str, str, str], Any] = {}


def _key_values() -> dict[str, str]:
    return {name: os.getenv(name, "") for name in _KEY_ENVS}


def _catalog_id_for_name(name: str) -> str | None:
    if name in MODEL_CATALOG:
        return name
    for spec in MODEL_CATALOG.values():
        if spec.model == name:
            return spec.id
    return None


def set_request_model(model_id: str | None) -> None:
    _request_model_id.set(model_id)


def get_request_model() -> str | None:
    return _request_model_id.get()


def is_model_available(model_id: str) -> bool:
    spec = MODEL_CATALOG.get(model_id)
    if spec is None:
        return False
    return bool(_key_values().get(spec.key_env, ""))


def list_available_models() -> list[dict[str, str | bool]]:
    default_id = _catalog_id_for_name(get_model("default")) or "claude-sonnet-4-6"
    models: list[dict[str, str | bool]] = []
    for spec in MODEL_CATALOG.values():
        available = is_model_available(spec.id)
        models.append(
            {
                "id": spec.id,
                "label": spec.label,
                "provider": spec.provider,
                "tier": spec.tier,
                "description": spec.description,
                "available": available,
                "is_default": spec.id == default_id,
            }
        )
    return models


def get_effective_model_id(purpose: str = "default") -> str:
    selected = _request_model_id.get()
    if selected:
        normalized = _catalog_id_for_name(selected)
        if normalized and is_model_available(normalized):
            return normalized

    purpose_name = get_model(purpose)
    normalized = _catalog_id_for_name(purpose_name)
    if normalized and is_model_available(normalized):
        return normalized

    for fallback in ("claude-sonnet-4-6", "gpt-4o-mini", "gemini-2.0-flash", "llama-3.3-70b-versatile"):
        if is_model_available(fallback):
            return fallback

    return normalized or "claude-sonnet-4-6"


def make_chat_llm(*, purpose: str = "default", temperature: float = 0) -> BaseChatModel:
    model_id = get_effective_model_id(purpose)
    spec = MODEL_CATALOG[model_id]

    if spec.provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(model=spec.model, temperature=temperature)

    if spec.provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(model=spec.model, temperature=temperature)

    if spec.provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(model=spec.model, temperature=temperature)

    if spec.provider in ("groq", "meta"):
        from langchain_groq import ChatGroq

        return ChatGroq(model=spec.model, temperature=temperature)

    raise ValueError(f"Unsupported provider: {spec.provider}")


def cached_react_agent(
    agent_key: str,
    *,
    tools: list,
    prompt: Any,
    temperature: float = 0,
    purpose: str = "default",
):
    from langgraph.prebuilt import create_react_agent

    model_id = get_effective_model_id(purpose)
    cache_key = (agent_key, model_id, f"{purpose}:{temperature}")
    if cache_key not in _react_agent_cache:
        _react_agent_cache[cache_key] = create_react_agent(
            model=make_chat_llm(purpose=purpose, temperature=temperature),
            tools=tools,
            prompt=prompt,
        )
    return _react_agent_cache[cache_key]
