"""Alembic environment for BakeryPilot.

Reads DATABASE_URL at runtime (no hardcoded creds) and forces the SYNC
psycopg2 driver because Alembic itself is synchronous — the app's regular
asyncpg URL is rewritten transparently.

Target metadata = app.db.base.Base.metadata, so `alembic revision --autogenerate`
diffs against every SQLAlchemy model in app/db/models.py.
"""

from __future__ import annotations

import os
import re
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make the backend package importable so we can grab the model metadata.
from app.db.base import Base  # noqa: F401 — populates Base.metadata via imports
import app.db.models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _sync_url(url: str) -> str:
    """Rewrite async drivers to the sync psycopg2 dialect for Alembic.

    psycopg2-binary is the sync driver already pinned in backend/pyproject.toml.
    The app uses asyncpg for FastAPI requests; Alembic itself is synchronous.
    """
    # postgresql+asyncpg://...  -> postgresql+psycopg2://...
    # postgresql://...          -> postgresql+psycopg2://...
    return re.sub(r"^postgres(?:ql)?(?:\+\w+)?://", "postgresql+psycopg2://", url)


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://bakery:bakery@localhost:5432/bakery")
config.set_main_option("sqlalchemy.url", _sync_url(DATABASE_URL))


target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Emit SQL to stdout — `alembic upgrade head --sql`."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
