"""Data-source refresh service.

Catalogs the live-fetched data sources backed by `infra/seed_*.py` scripts,
runs them on demand (manual refresh button) or on a schedule (auto refresh
interval), and persists last-run metadata to `app_settings` so the admin
UI can show last-refreshed time / status / row count.

Each refresh shells out to `python -m uv run infra/<script>.py` via
`asyncio.create_subprocess_exec` so the event loop isn't blocked. The
seed scripts are PEP 723 inline-deps scripts and own their own venvs;
the backend's venv lacks psycopg v3 + faker so in-process import isn't
viable.

Concurrency: an in-memory `asyncio.Lock` keyed by source_id prevents two
refreshes of the same source from running concurrently. (Different
sources can refresh in parallel.)
"""

from __future__ import annotations

import asyncio
import os
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.app_settings import get_app_setting, set_app_setting

# --- Catalog --------------------------------------------------------------

@dataclass(frozen=True)
class DataSource:
    id: str
    label: str
    description: str
    script_relpath: str               # relative to project root
    target_tables: tuple[str, ...]    # tables refreshed by this script
    default_interval_seconds: int     # 0 = off
    typical_runtime_seconds: int      # rough hint for UI


DATA_SOURCES: dict[str, DataSource] = {
    "commodity_prices": DataSource(
        id="commodity_prices",
        label="Commodity Prices",
        description="Daily OHLCV for CBOT wheat, ICE sugar, CBOT corn, soybean oil, "
                    "NYMEX natural gas, and WTI crude futures from Yahoo Finance.",
        script_relpath="infra/seed_commodity_prices.py",
        target_tables=("commodity_prices",),
        default_interval_seconds=0,
        typical_runtime_seconds=15,
    ),
    "fx_rates": DataSource(
        id="fx_rates",
        label="FX Rates (Bank of Canada)",
        description="Daily CAD/USD and CAD/EUR reference rates from the Bank of "
                    "Canada Valet API. Lands in commodity_prices with FX-shaped "
                    "commodity_ids.",
        script_relpath="infra/seed_fx_rates.py",
        target_tables=("commodity_prices",),
        default_interval_seconds=0,
        typical_runtime_seconds=10,
    ),
    "weather_signals": DataSource(
        id="weather_signals",
        label="Weather Risk Signals",
        description="21-day forecast per facility from Open-Meteo, classified "
                    "into heat/frost/heavy_rain/wind disruption_signals rows.",
        script_relpath="infra/seed_weather_signals.py",
        target_tables=("disruption_signals",),
        default_interval_seconds=0,
        typical_runtime_seconds=15,
    ),
    "news_signals": DataSource(
        id="news_signals",
        label="News Risk Signals (GDELT)",
        description="Negative-tone news articles for supply-chain keywords from "
                    "GDELT 2.0 DOC API. Lands as 'news' kind disruption_signals.",
        script_relpath="infra/seed_news_signals.py",
        target_tables=("disruption_signals",),
        default_interval_seconds=0,
        typical_runtime_seconds=70,  # 8s pacing × 7 keywords + retries
    ),
    "fx_world": DataSource(
        id="fx_world",
        label="FX Rates (ECB / Frankfurter)",
        description="Daily ECB reference rates for 8 USD pairs (EUR, GBP, JPY, CHF, "
                    "CAD, MXN, CNY, AUD) via Frankfurter.app. Documented public API, "
                    "no auth. Lands in commodity_prices with fx-usd-* commodity_ids.",
        script_relpath="infra/seed_fx_world.py",
        target_tables=("commodity_prices",),
        default_interval_seconds=0,
        typical_runtime_seconds=8,
    ),
    "fred_prices": DataSource(
        id="fred_prices",
        label="FRED (St. Louis Fed)",
        description="Official US Federal Reserve commodity + macro series (WTI crude, "
                    "Henry Hub natgas, gasoline, IMF wheat/sugar, US food CPI, CAD/USD). "
                    "Requires FRED_API_KEY in .env (free signup).",
        script_relpath="infra/seed_fred_prices.py",
        target_tables=("commodity_prices",),
        default_interval_seconds=0,
        typical_runtime_seconds=20,
    ),
}


# --- Settings keys --------------------------------------------------------

def _key(source_id: str, field: str) -> str:
    return f"refresh.{source_id}.{field}"


# --- In-memory concurrency control ----------------------------------------

_locks: dict[str, asyncio.Lock] = {source_id: asyncio.Lock() for source_id in DATA_SOURCES}
_running: set[str] = set()


def is_running(source_id: str) -> bool:
    return source_id in _running


# --- Project root ---------------------------------------------------------

def _project_root() -> Path:
    # backend/app/services/data_refresh.py -> project root is 3 levels up.
    return Path(__file__).resolve().parents[3]


# --- Subprocess runner ----------------------------------------------------

def _resolve_uv_command() -> list[str] | None:
    """Find a usable uv invocation. Returns the argv prefix, e.g. ['uv', 'run']
    or ['python', '-m', 'uv', 'run'], or None if uv is not available anywhere.

    Resolution order:
      1. `uv` binary on PATH (cleanest).
      2. System `python` on PATH with the `uv` module installed (common when
         uv was `pip install`-ed into the base interpreter).
      3. Backend venv's own python with `uv` (rare — backend's pyproject.toml
         doesn't list uv as a dep — but checked as a last resort).
    """
    if uv_bin := shutil.which("uv"):
        return [uv_bin, "run"]

    # Probe each candidate Python with `-m uv --version` (subprocess, not import,
    # so a mis-installed `uv` in one venv doesn't break us). Fast (under 200 ms).
    import subprocess

    candidates = [shutil.which("python"), shutil.which("python3"), sys.executable]
    seen: set[str] = set()
    for py in candidates:
        if not py or py in seen:
            continue
        seen.add(py)
        try:
            r = subprocess.run(
                [py, "-m", "uv", "--version"],
                capture_output=True,
                timeout=5,
            )
        except (OSError, subprocess.TimeoutExpired):
            continue
        if r.returncode == 0:
            return [py, "-m", "uv", "run"]
    return None


_uv_cmd: list[str] | None = _resolve_uv_command()


async def _run_script(script_relpath: str) -> tuple[int, str, str]:
    """Run `<uv> run <script>` from project root. Returns (returncode, stdout_tail, stderr_tail).

    Uses `asyncio.to_thread(subprocess.run, ...)` rather than
    `asyncio.create_subprocess_exec` because uvicorn on Windows often runs
    on a SelectorEventLoop which doesn't support `subprocess_exec` (raises
    NotImplementedError). Threading the blocking call keeps the subprocess
    portable across all event loop variants without forcing a loop policy
    on the caller.
    """
    import subprocess  # local import — only needed here

    root = _project_root()
    script = root / script_relpath
    if not script.exists():
        return 127, "", f"script not found: {script}"

    if _uv_cmd is None:
        return 127, "", (
            "Could not find `uv` — neither on PATH nor as a module in any Python on PATH. "
            "Install uv (https://github.com/astral-sh/uv) so refreshes can shell out to PEP 723 scripts."
        )

    cmd = [*_uv_cmd, str(script)]

    def _run_blocking() -> tuple[int, str, str]:
        result = subprocess.run(
            cmd,
            cwd=str(root),
            capture_output=True,
            env={**os.environ},
            text=True,
            encoding="utf-8",
            errors="replace",
            # No timeout on the parent — the seed scripts have their own bounds
            # and the admin UI shows `running…` until completion.
        )
        # Keep the last 2 KB of each — full output isn't needed for the admin badge.
        return result.returncode or 0, (result.stdout or "")[-2048:], (result.stderr or "")[-2048:]

    return await asyncio.to_thread(_run_blocking)


# --- Row count helper -----------------------------------------------------

async def _row_count(db: AsyncSession, tables: tuple[str, ...]) -> int:
    total = 0
    for t in tables:
        result = await db.execute(text(f'SELECT COUNT(*) FROM "{t}"'))  # noqa: S608
        total += result.scalar_one() or 0
    return total


# --- Public API -----------------------------------------------------------

@dataclass
class DataSourceMeta:
    id: str
    label: str
    description: str
    target_tables: list[str]
    typical_runtime_seconds: int
    last_at: str | None
    last_status: str | None      # "ok" | "failed" | None
    last_message: str | None
    last_rows: int | None
    interval_seconds: int
    running: bool


async def get_meta(db: AsyncSession, source: DataSource) -> DataSourceMeta:
    last_at = await get_app_setting(db, _key(source.id, "last_at"), "")
    last_status = await get_app_setting(db, _key(source.id, "last_status"), "")
    last_message = await get_app_setting(db, _key(source.id, "last_message"), "")
    last_rows_str = await get_app_setting(db, _key(source.id, "last_rows"), "")
    interval_str = await get_app_setting(
        db, _key(source.id, "interval_seconds"), str(source.default_interval_seconds)
    )

    try:
        last_rows = int(last_rows_str) if last_rows_str else None
    except ValueError:
        last_rows = None
    try:
        interval_seconds = int(interval_str) if interval_str else source.default_interval_seconds
    except ValueError:
        interval_seconds = source.default_interval_seconds

    return DataSourceMeta(
        id=source.id,
        label=source.label,
        description=source.description,
        target_tables=list(source.target_tables),
        typical_runtime_seconds=source.typical_runtime_seconds,
        last_at=last_at or None,
        last_status=last_status or None,
        last_message=last_message or None,
        last_rows=last_rows,
        interval_seconds=interval_seconds,
        running=is_running(source.id),
    )


async def set_interval(db: AsyncSession, source_id: str, interval_seconds: int) -> None:
    if source_id not in DATA_SOURCES:
        raise KeyError(source_id)
    if interval_seconds < 0:
        raise ValueError("interval_seconds must be >= 0 (0 = off)")
    await set_app_setting(db, _key(source_id, "interval_seconds"), str(interval_seconds))


async def trigger_refresh(db: AsyncSession, source_id: str) -> DataSourceMeta:
    """Run a refresh now. Blocks until the subprocess completes, then writes meta.

    Caller is responsible for handling the long-running nature — typically
    invoke from a background task (BackgroundTasks) so the HTTP request
    returns immediately.
    """
    source = DATA_SOURCES.get(source_id)
    if source is None:
        raise KeyError(source_id)

    lock = _locks[source_id]
    if lock.locked():
        return await get_meta(db, source)

    async with lock:
        _running.add(source_id)
        try:
            returncode, stdout, stderr = await _run_script(source.script_relpath)
            now_iso = datetime.now(timezone.utc).isoformat(timespec="seconds")
            await set_app_setting(db, _key(source_id, "last_at"), now_iso)

            if returncode == 0:
                rows = await _row_count(db, source.target_tables)
                # Summary line from stdout — last non-empty line is usually the row count summary.
                lines = [ln for ln in stdout.splitlines() if ln.strip()]
                summary = lines[-1] if lines else f"exit 0 in {source.id}"
                await set_app_setting(db, _key(source_id, "last_status"), "ok")
                await set_app_setting(db, _key(source_id, "last_message"), summary[:500])
                await set_app_setting(db, _key(source_id, "last_rows"), str(rows))
            else:
                err_tail = (stderr or stdout).strip().splitlines()
                msg = err_tail[-1] if err_tail else f"exit {returncode}"
                await set_app_setting(db, _key(source_id, "last_status"), "failed")
                await set_app_setting(db, _key(source_id, "last_message"), msg[:500])

            return await get_meta(db, source)
        finally:
            _running.discard(source_id)


async def list_meta(db: AsyncSession) -> list[DataSourceMeta]:
    return [await get_meta(db, src) for src in DATA_SOURCES.values()]


async def find_due_sources(db: AsyncSession) -> list[str]:
    """Return source_ids whose auto-refresh interval has elapsed since last_at."""
    now = datetime.now(timezone.utc)
    due: list[str] = []
    for source in DATA_SOURCES.values():
        meta = await get_meta(db, source)
        if meta.running or meta.interval_seconds <= 0:
            continue
        if meta.last_at is None:
            due.append(source.id)
            continue
        try:
            last = datetime.fromisoformat(meta.last_at)
        except ValueError:
            due.append(source.id)
            continue
        elapsed = (now - last).total_seconds()
        if elapsed >= meta.interval_seconds:
            due.append(source.id)
    return due
