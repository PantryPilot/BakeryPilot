import re
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings


def _async_url(url: str) -> str:
    return re.sub(r"^postgres(?:ql)?(?:\+\w+)?://", "postgresql+asyncpg://", url)


_engine = None
_SessionLocal = None


def _get_session_factory() -> async_sessionmaker:
    global _engine, _SessionLocal
    if _SessionLocal is None:
        _engine = create_async_engine(
            _async_url(settings.database_url),
            pool_size=5,
            max_overflow=10,
            echo=False,
        )
        _SessionLocal = async_sessionmaker(_engine, expire_on_commit=False)
    return _SessionLocal


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _get_session_factory()() as session:
        yield session


@asynccontextmanager
async def session_scope() -> AsyncGenerator[AsyncSession, None]:
    """Standalone DB session for background tasks / scheduler ticks.

    Use when you don't have a FastAPI request context to grant you a
    `Depends(get_db)` session — e.g. inside a `BackgroundTasks` callback
    or the auto-refresh scheduler loop.
    """
    async with _get_session_factory()() as session:
        yield session
