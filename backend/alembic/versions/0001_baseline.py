"""baseline — schema state as defined by infra/supabase/schema.sql at Alembic bolt-on.

This migration is intentionally empty. It exists to anchor the Alembic
history so future migrations have a parent. The live DB and any fresh
init-dir boot already have every table from schema.sql, so this revision
is `stamp`-ed (not applied) the first time Alembic is wired up:

    docker compose ... exec backend uv run alembic stamp head

Future schema changes go via:

    docker compose ... exec backend uv run alembic revision --autogenerate -m "add X"
    # review the generated file, then commit + push — CD applies it.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-05-27
"""

from __future__ import annotations

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Baseline: schema is established by schema.sql. No-op.
    pass


def downgrade() -> None:
    # No downgrade past baseline — that would mean dropping every table.
    pass
