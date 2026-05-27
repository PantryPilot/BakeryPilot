from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
from app.models.chat import ChatModelInfo
from app.services import data_refresh
from app.services.app_settings import (
    COPILOT_MODEL_KEY,
    get_copilot_model,
    set_app_setting,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


class TableInfo(BaseModel):
    name: str
    row_count: int


class ColumnInfo(BaseModel):
    name: str
    type: str


class TableRowsResponse(BaseModel):
    table: str
    columns: list[ColumnInfo]
    rows: list[dict]
    total: int
    page: int
    per_page: int


class CopilotModelSettings(BaseModel):
    model_id: str
    models: list[ChatModelInfo]


class CopilotModelUpdate(BaseModel):
    model_id: str


class DataSourceMetaResponse(BaseModel):
    id: str
    label: str
    description: str
    target_tables: list[str]
    typical_runtime_seconds: int
    last_at: str | None = None
    last_status: str | None = None
    last_message: str | None = None
    last_rows: int | None = None
    interval_seconds: int
    running: bool


class DataSourceIntervalUpdate(BaseModel):
    interval_seconds: int = Field(ge=0, description="0 disables auto-refresh.")


def _sync_llm_env() -> None:
    import os

    os.environ.setdefault("ANTHROPIC_API_KEY", settings.anthropic_api_key)
    if settings.openai_api_key:
        os.environ["OPENAI_API_KEY"] = settings.openai_api_key
    if settings.google_api_key:
        os.environ["GOOGLE_API_KEY"] = settings.google_api_key
    if settings.groq_api_key:
        os.environ["GROQ_API_KEY"] = settings.groq_api_key


@router.get("/copilot-model", response_model=CopilotModelSettings)
async def get_copilot_model_settings(db: AsyncSession = Depends(get_db)) -> CopilotModelSettings:
    _sync_llm_env()
    from agent.llm import list_available_models

    model_id = await get_copilot_model(db)
    return CopilotModelSettings(
        model_id=model_id,
        models=list_available_models(),
    )


@router.put("/copilot-model", response_model=CopilotModelSettings)
async def update_copilot_model_settings(
    req: CopilotModelUpdate,
    db: AsyncSession = Depends(get_db),
) -> CopilotModelSettings:
    _sync_llm_env()
    from agent.llm import MODEL_CATALOG, is_model_available, list_available_models

    if req.model_id not in MODEL_CATALOG:
        raise HTTPException(status_code=400, detail=f"Unknown model '{req.model_id}'")
    if not is_model_available(req.model_id):
        raise HTTPException(
            status_code=400,
            detail=f"Model '{req.model_id}' is not available. Add the provider API key in .env.",
        )

    try:
        await set_app_setting(db, COPILOT_MODEL_KEY, req.model_id)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="app_settings table not initialised. Run `make schema.migrate && make schema.seed`.",
        ) from exc

    return CopilotModelSettings(
        model_id=req.model_id,
        models=list_available_models(),
    )


async def _public_table_names(db: AsyncSession) -> list[str]:
    result = await db.execute(
        text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
            "ORDER BY table_name"
        )
    )
    return [row[0] for row in result.fetchall()]


@router.get("/tables", response_model=list[TableInfo])
async def list_tables(db: AsyncSession = Depends(get_db)) -> list[TableInfo]:
    tables = await _public_table_names(db)
    out: list[TableInfo] = []
    for t in tables:
        count_result = await db.execute(
            text(f"SELECT COUNT(*) FROM \"{t}\"")  # noqa: S608
        )
        out.append(TableInfo(name=t, row_count=count_result.scalar_one()))
    return out


async def _table_columns(db: AsyncSession, table_name: str) -> list[ColumnInfo]:
    result = await db.execute(
        text(
            "SELECT column_name, data_type "
            "FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :table "
            "ORDER BY ordinal_position"
        ),
        {"table": table_name},
    )
    return [ColumnInfo(name=r[0], type=r[1]) for r in result.fetchall()]


@router.get("/tables/{table_name}/rows", response_model=TableRowsResponse)
async def list_table_rows(
    table_name: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=500),
    sort: str | None = Query(None),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
) -> TableRowsResponse:
    valid_tables = await _public_table_names(db)
    if table_name not in valid_tables:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    columns = await _table_columns(db, table_name)
    column_names = {c.name for c in columns}

    count_result = await db.execute(text(f"SELECT COUNT(*) FROM \"{table_name}\""))  # noqa: S608
    total = count_result.scalar_one()

    order_clause = ""
    if sort:
        if sort not in column_names:
            raise HTTPException(
                status_code=400, detail=f"Column '{sort}' does not exist on '{table_name}'"
            )
        direction = "DESC" if order == "desc" else "ASC"
        order_clause = f" ORDER BY \"{sort}\" {direction}"

    offset = (page - 1) * per_page
    result = await db.execute(
        text(f"SELECT * FROM \"{table_name}\"{order_clause} LIMIT :lim OFFSET :off"),  # noqa: S608
        {"lim": per_page, "off": offset},
    )
    raw_rows = result.fetchall()
    col_keys = list(result.keys())

    rows: list[dict] = []
    for row in raw_rows:
        rows.append({col_keys[i]: _serialize(row[i]) for i in range(len(col_keys))})

    return TableRowsResponse(
        table=table_name,
        columns=columns,
        rows=rows,
        total=total,
        page=page,
        per_page=per_page,
    )


def _serialize(value: object) -> object:
    """Convert non-JSON-serializable values to strings."""
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, dict)):
        return value
    return str(value)


# --- Data sources (manual refresh + auto-refresh interval) --------------

def _meta_to_response(m: data_refresh.DataSourceMeta) -> DataSourceMetaResponse:
    return DataSourceMetaResponse(
        id=m.id,
        label=m.label,
        description=m.description,
        target_tables=m.target_tables,
        typical_runtime_seconds=m.typical_runtime_seconds,
        last_at=m.last_at,
        last_status=m.last_status,
        last_message=m.last_message,
        last_rows=m.last_rows,
        interval_seconds=m.interval_seconds,
        running=m.running,
    )


@router.get("/data-sources", response_model=list[DataSourceMetaResponse])
async def list_data_sources(db: AsyncSession = Depends(get_db)) -> list[DataSourceMetaResponse]:
    metas = await data_refresh.list_meta(db)
    return [_meta_to_response(m) for m in metas]


@router.post("/data-sources/{source_id}/refresh", response_model=DataSourceMetaResponse)
async def refresh_data_source(
    source_id: str,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> DataSourceMetaResponse:
    if source_id not in data_refresh.DATA_SOURCES:
        raise HTTPException(status_code=404, detail=f"Unknown data source '{source_id}'")
    if data_refresh.is_running(source_id):
        meta = await data_refresh.get_meta(db, data_refresh.DATA_SOURCES[source_id])
        return _meta_to_response(meta)

    # Fire-and-forget the long-running subprocess. The endpoint returns
    # immediately with `running=True` so the UI can poll status.
    background.add_task(_run_refresh_task, source_id)

    meta = await data_refresh.get_meta(db, data_refresh.DATA_SOURCES[source_id])
    # Force the running flag in the immediate response — the BackgroundTask
    # hasn't actually started yet but logically the refresh has been queued.
    response = _meta_to_response(meta)
    response.running = True
    return response


async def _run_refresh_task(source_id: str) -> None:
    """Background task: open its own DB session so the request-scoped one is freed."""
    from app.db.session import session_scope

    async with session_scope() as bg_db:
        try:
            await data_refresh.trigger_refresh(bg_db, source_id)
        except Exception:  # pragma: no cover — surfaced via last_status in meta
            pass


@router.put("/data-sources/{source_id}/interval", response_model=DataSourceMetaResponse)
async def update_data_source_interval(
    source_id: str,
    req: DataSourceIntervalUpdate,
    db: AsyncSession = Depends(get_db),
) -> DataSourceMetaResponse:
    if source_id not in data_refresh.DATA_SOURCES:
        raise HTTPException(status_code=404, detail=f"Unknown data source '{source_id}'")
    await data_refresh.set_interval(db, source_id, req.interval_seconds)
    meta = await data_refresh.get_meta(db, data_refresh.DATA_SOURCES[source_id])
    return _meta_to_response(meta)
