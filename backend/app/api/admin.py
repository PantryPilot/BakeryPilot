from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

import json

from app.config import settings
from app.db.session import get_db
from app.models.chat import ChatModelInfo
from app.services import data_refresh
from app.services.admin_filters import TABLE_FILTER_DEFS, filter_columns_for_table, option_label
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
    active_filters: dict[str, str] = {}
    primary_keys: list[str] = []


class RowUpdateRequest(BaseModel):
    key: dict[str, object]
    values: dict[str, object]


class RowInsertRequest(BaseModel):
    values: dict[str, object]


class RowUpdateResponse(BaseModel):
    row: dict


class TableFilterOption(BaseModel):
    value: str
    label: str
    count: int


class TableFilterSpec(BaseModel):
    column: str
    label: str
    options: list[TableFilterOption]


class TableFiltersResponse(BaseModel):
    table: str
    filters: list[TableFilterSpec]


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


async def _table_primary_keys(db: AsyncSession, table_name: str) -> list[str]:
    result = await db.execute(
        text(
            """
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema = 'public'
              AND tc.table_name = :table
            ORDER BY kcu.ordinal_position
            """
        ),
        {"table": table_name},
    )
    return [r[0] for r in result.fetchall()]


def _parse_table_filters(table_name: str, query_params) -> dict[str, str]:
    allowed = filter_columns_for_table(table_name)
    if not allowed:
        return {}
    out: dict[str, str] = {}
    for key, val in query_params.multi_items():
        if not key.startswith("filter_") or not val:
            continue
        column = key.removeprefix("filter_")
        if column in allowed:
            out[column] = val
    return out


def _where_clause(table_name: str, filters: dict[str, str]) -> tuple[str, dict[str, object]]:
    allowed = filter_columns_for_table(table_name)
    parts: list[str] = []
    params: dict[str, object] = {}
    for i, (column, value) in enumerate(filters.items()):
        if column not in allowed:
            continue
        param = f"filter_{i}"
        parts.append(f"\"{column}\" = :{param}")
        params[param] = value
    if not parts:
        return "", params
    return " WHERE " + " AND ".join(parts), params


@router.get("/tables/{table_name}/filters", response_model=TableFiltersResponse)
async def list_table_filters(
    table_name: str,
    db: AsyncSession = Depends(get_db),
) -> TableFiltersResponse:
    valid_tables = await _public_table_names(db)
    if table_name not in valid_tables:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    defs = TABLE_FILTER_DEFS.get(table_name, ())
    filters_out: list[TableFilterSpec] = []
    for fdef in defs:
        result = await db.execute(
            text(
                f"SELECT \"{fdef.column}\", COUNT(*) "
                f"FROM \"{table_name}\" "
                f"GROUP BY 1 ORDER BY 1 NULLS LAST"  # noqa: S608
            )
        )
        options: list[TableFilterOption] = []
        for row in result.fetchall():
            if row[0] is None:
                continue
            val = str(row[0])
            options.append(
                TableFilterOption(
                    value=val,
                    label=option_label(table_name, fdef.column, val),
                    count=int(row[1]),
                )
            )
        filters_out.append(
            TableFilterSpec(column=fdef.column, label=fdef.label, options=options)
        )

    return TableFiltersResponse(table=table_name, filters=filters_out)


@router.get("/tables/{table_name}/rows", response_model=TableRowsResponse)
async def list_table_rows(
    table_name: str,
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=500),
    sort: str | None = Query(None),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
) -> TableRowsResponse:
    valid_tables = await _public_table_names(db)
    if table_name not in valid_tables:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    active_filters = _parse_table_filters(table_name, request.query_params)
    where_sql, filter_params = _where_clause(table_name, active_filters)

    columns = await _table_columns(db, table_name)
    column_names = {c.name for c in columns}

    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM \"{table_name}\"{where_sql}"),  # noqa: S608
        filter_params,
    )
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
    query_params = {**filter_params, "lim": per_page, "off": offset}
    result = await db.execute(
        text(
            f'SELECT t.*, t.ctid::text AS "__row_ctid" '
            f'FROM "{table_name}" t{where_sql}{order_clause} LIMIT :lim OFFSET :off'
        ),  # noqa: S608
        query_params,
    )
    raw_rows = result.fetchall()
    col_keys = list(result.keys())

    rows: list[dict] = []
    for row in raw_rows:
        rows.append({col_keys[i]: _serialize(row[i]) for i in range(len(col_keys))})

    primary_keys = await _table_primary_keys(db, table_name)

    return TableRowsResponse(
        table=table_name,
        columns=columns,
        rows=rows,
        total=total,
        page=page,
        per_page=per_page,
        active_filters=active_filters,
        primary_keys=primary_keys,
    )


def _parse_input(value: object, pg_type: str) -> object:
    if value is None:
        return None
    if isinstance(value, str) and value.strip() == "":
        return None
    if pg_type == "boolean":
        if isinstance(value, bool):
            return value
        return str(value).lower() in ("true", "t", "1", "yes")
    if pg_type in ("integer", "bigint", "smallint"):
        return int(value)  # type: ignore[arg-type]
    if pg_type in ("double precision", "numeric", "real"):
        return float(value)  # type: ignore[arg-type]
    if pg_type in ("json", "jsonb"):
        if isinstance(value, (dict, list)):
            return json.dumps(value)
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return value


def _set_expr(column: str, pg_type: str, param: str) -> str:
    if pg_type in ("json", "jsonb"):
        return f'"{column}" = CAST(:{param} AS jsonb)'
    if pg_type == "uuid":
        return f'"{column}" = CAST(:{param} AS uuid)'
    if pg_type in ("timestamp with time zone", "timestamp without time zone", "date"):
        return f'"{column}" = CAST(:{param} AS {pg_type})'
    return f'"{column}" = :{param}'


def _insert_value_expr(pg_type: str, param: str) -> str:
    if pg_type in ("json", "jsonb"):
        return f"CAST(:{param} AS jsonb)"
    if pg_type == "uuid":
        return f"CAST(:{param} AS uuid)"
    if pg_type in ("timestamp with time zone", "timestamp without time zone", "date"):
        return f"CAST(:{param} AS {pg_type})"
    return f":{param}"


def _row_where_clause(
    pk_cols: list[str], key: dict[str, object]
) -> tuple[str, dict[str, object]]:
    if pk_cols:
        missing = [c for c in pk_cols if c not in key]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Missing primary key fields in key: {', '.join(missing)}",
            )
        parts = [f'"{c}" = :key_{c}' for c in pk_cols]
        params = {f"key_{c}": key[c] for c in pk_cols}
        return " AND ".join(parts), params
    if "__row_ctid" not in key:
        raise HTTPException(
            status_code=400,
            detail="Table has no primary key; include __row_ctid in key",
        )
    return 'ctid = CAST(:__row_ctid AS tid)', {"__row_ctid": key["__row_ctid"]}


@router.patch("/tables/{table_name}/rows", response_model=RowUpdateResponse)
async def update_table_row(
    table_name: str,
    req: RowUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> RowUpdateResponse:
    valid_tables = await _public_table_names(db)
    if table_name not in valid_tables:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    if not req.values:
        raise HTTPException(status_code=400, detail="No fields to update")

    columns = await _table_columns(db, table_name)
    column_types = {c.name: c.type for c in columns}
    column_names = set(column_types)

    pk_cols = await _table_primary_keys(db, table_name)
    where_sql, where_params = _row_where_clause(pk_cols, req.key)

    set_parts: list[str] = []
    set_params: dict[str, object] = {}
    for i, (column, raw_val) in enumerate(req.values.items()):
        if column not in column_names or column == "__row_ctid":
            raise HTTPException(
                status_code=400, detail=f"Unknown column '{column}' on '{table_name}'"
            )
        param = f"set_{i}"
        pg_type = column_types[column]
        parsed = _parse_input(raw_val, pg_type)
        set_parts.append(_set_expr(column, pg_type, param))
        set_params[param] = parsed

    sql = (
        f'UPDATE "{table_name}" SET {", ".join(set_parts)} '
        f"WHERE {where_sql} "
        f'RETURNING *, ctid::text AS "__row_ctid"'
    )
    try:
        result = await db.execute(text(sql), {**set_params, **where_params})  # noqa: S608
        updated = result.fetchone()
        if updated is None:
            raise HTTPException(status_code=404, detail="Row not found")
        await db.commit()
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    col_keys = list(result.keys())
    row = {col_keys[i]: _serialize(updated[i]) for i in range(len(col_keys))}
    return RowUpdateResponse(row=row)


@router.post("/tables/{table_name}/rows", response_model=RowUpdateResponse)
async def insert_table_row(
    table_name: str,
    req: RowInsertRequest,
    db: AsyncSession = Depends(get_db),
) -> RowUpdateResponse:
    valid_tables = await _public_table_names(db)
    if table_name not in valid_tables:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    if not req.values:
        raise HTTPException(status_code=400, detail="No fields to insert")

    columns = await _table_columns(db, table_name)
    column_types = {c.name: c.type for c in columns}
    column_names = set(column_types)

    insert_cols: list[str] = []
    value_exprs: list[str] = []
    insert_params: dict[str, object] = {}
    param_idx = 0
    for column, raw_val in req.values.items():
        if column not in column_names or column == "__row_ctid":
            raise HTTPException(
                status_code=400, detail=f"Unknown column '{column}' on '{table_name}'"
            )
        pg_type = column_types[column]
        parsed = _parse_input(raw_val, pg_type)
        if parsed is None:
            continue
        param = f"ins_{param_idx}"
        param_idx += 1
        insert_cols.append(f'"{column}"')
        value_exprs.append(_insert_value_expr(pg_type, param))
        insert_params[param] = parsed

    if not insert_cols:
        raise HTTPException(
            status_code=400,
            detail="At least one non-empty field is required (empty fields use DB defaults)",
        )

    sql = (
        f'INSERT INTO "{table_name}" ({", ".join(insert_cols)}) '
        f"VALUES ({', '.join(value_exprs)}) "
        f'RETURNING *, ctid::text AS "__row_ctid"'
    )
    try:
        result = await db.execute(text(sql), insert_params)  # noqa: S608
        inserted = result.fetchone()
        if inserted is None:
            raise HTTPException(status_code=500, detail="Insert failed")
        await db.commit()
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    col_keys = list(result.keys())
    row = {col_keys[i]: _serialize(inserted[i]) for i in range(len(col_keys))}
    return RowUpdateResponse(row=row)


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
    import logging

    from app.db.session import session_scope

    log = logging.getLogger("uvicorn.error")  # uses uvicorn's configured handler
    try:
        async with session_scope() as bg_db:
            await data_refresh.trigger_refresh(bg_db, source_id)
    except Exception:
        log.exception("background refresh failed for %s", source_id)


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
