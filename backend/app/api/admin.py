from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

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
