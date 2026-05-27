"""Persisted system settings (admin-controlled)."""

from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

COPILOT_MODEL_KEY = "copilot_model"
DEFAULT_COPILOT_MODEL = "claude-sonnet-4-6"


async def get_app_setting(db: AsyncSession, key: str, default: str = "") -> str:
    try:
        result = await db.execute(
            text("SELECT value FROM app_settings WHERE key = :key"),
            {"key": key},
        )
        row = result.fetchone()
        return row[0] if row else default
    except ProgrammingError:
        return default


async def set_app_setting(db: AsyncSession, key: str, value: str) -> None:
    await db.execute(
        text(
            "INSERT INTO app_settings (key, value, updated_at) "
            "VALUES (:key, :value, now()) "
            "ON CONFLICT (key) DO UPDATE "
            "SET value = EXCLUDED.value, updated_at = now()"
        ),
        {"key": key, "value": value},
    )
    await db.commit()


async def get_copilot_model(db: AsyncSession) -> str:
    from agent.llm import get_effective_model_id, is_model_available

    stored = await get_app_setting(db, COPILOT_MODEL_KEY, "")
    if stored and is_model_available(stored):
        return stored
    return get_effective_model_id()
