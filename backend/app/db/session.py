import re
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings


def _async_url(url: str) -> str:
    return re.sub(r"^postgres(?:ql)?(?:\+\w+)?://", "postgresql+asyncpg://", url)


_engine = create_async_engine(
    _async_url(settings.database_url),
    pool_size=5,
    max_overflow=10,
    echo=False,
)

_SessionLocal = async_sessionmaker(_engine, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with _SessionLocal() as session:
        yield session
