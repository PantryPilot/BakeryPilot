"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon } from "../../components/Icon";
import { SectionHeader } from "../../components/atoms";
import {
  fetchAdminTables,
  fetchAdminTableRows,
  type AdminTableInfo,
  type AdminColumnInfo,
  type AdminTableRowsResponse,
} from "../../lib/api";

type SortState = { column: string; order: "asc" | "desc" } | null;

export default function AdminPage() {
  const [tables, setTables] = useState<AdminTableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<AdminTableRowsResponse | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>(null);
  const [expandedCell, setExpandedCell] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const perPage = 50;

  useEffect(() => {
    let cancelled = false;
    setTablesLoading(true);
    fetchAdminTables().then((data) => {
      if (cancelled) return;
      setTables(data ?? []);
      setTablesLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const loadRows = useCallback(
    async (table: string, p: number, s: SortState) => {
      setDataLoading(true);
      const data = await fetchAdminTableRows(
        table,
        p,
        perPage,
        s?.column,
        s?.order,
      );
      setTableData(data);
      setDataLoading(false);
    },
    [],
  );

  const selectTable = (name: string) => {
    setActiveTable(name);
    setPage(1);
    setSort(null);
    setExpandedCell(null);
    setSearch("");
    loadRows(name, 1, null);
  };

  const changePage = (newPage: number) => {
    if (!activeTable) return;
    setPage(newPage);
    setExpandedCell(null);
    loadRows(activeTable, newPage, sort);
  };

  const toggleSort = (col: string) => {
    if (!activeTable) return;
    const newSort: SortState =
      sort?.column === col && sort.order === "asc"
        ? { column: col, order: "desc" }
        : { column: col, order: "asc" };
    setSort(newSort);
    setPage(1);
    setExpandedCell(null);
    loadRows(activeTable, 1, newSort);
  };

  const totalPages = tableData ? Math.max(1, Math.ceil(tableData.total / perPage)) : 1;

  const filteredTables = search
    ? tables.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : tables;

  return (
    <div className="h-full flex overflow-hidden">
      {/* Table list sidebar */}
      <div className="w-[240px] shrink-0 border-r border-slate-800/80 flex flex-col bg-[#0b0e16]">
        <div className="p-3 border-b border-slate-800/80">
          <SectionHeader title="Tables" count={tables.length} />
          <div className="mt-2 relative">
            <Icon
              name="search"
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              placeholder="Filter tables…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900/60 border border-slate-800 rounded-md pl-8 pr-3 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-600"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {tablesLoading ? (
            <div className="px-3 py-8 text-center text-[12px] text-slate-500">
              Loading tables…
            </div>
          ) : filteredTables.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12px] text-slate-500">
              No tables found
            </div>
          ) : (
            filteredTables.map((t) => (
              <button
                key={t.name}
                onClick={() => selectTable(t.name)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 transition relative ${
                  activeTable === t.name
                    ? "text-slate-100 bg-slate-800/50"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"
                }`}
              >
                {activeTable === t.name && (
                  <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-blue-500" />
                )}
                <Icon
                  name="database"
                  size={14}
                  className={activeTable === t.name ? "text-blue-400" : "text-slate-600"}
                />
                <span className="flex-1 text-[12px] font-mono truncate">
                  {t.name}
                </span>
                <span className="text-[10px] font-mono text-slate-600 tabular-nums">
                  {t.row_count.toLocaleString()}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!activeTable ? (
          <EmptyState />
        ) : (
          <>
            <TableHeader
              table={activeTable}
              total={tableData?.total ?? 0}
              loading={dataLoading}
            />
            <div className="flex-1 overflow-auto">
              {dataLoading && !tableData ? (
                <div className="flex items-center justify-center h-full text-slate-500 text-[13px]">
                  Loading…
                </div>
              ) : tableData ? (
                <DataGrid
                  columns={tableData.columns}
                  rows={tableData.rows}
                  sort={sort}
                  onSort={toggleSort}
                  expandedCell={expandedCell}
                  onExpandCell={setExpandedCell}
                />
              ) : null}
            </div>
            {tableData && (
              <Pagination
                page={page}
                totalPages={totalPages}
                total={tableData.total}
                perPage={perPage}
                onPageChange={changePage}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
      <Icon name="database" size={40} className="text-slate-700" />
      <p className="text-[14px]">Select a table to browse its data</p>
    </div>
  );
}

function TableHeader({
  table,
  total,
  loading,
}: {
  table: string;
  total: number;
  loading: boolean;
}) {
  return (
    <div className="h-14 shrink-0 flex items-center gap-3 px-5 border-b border-slate-800/80">
      <Icon name="database" size={18} className="text-blue-400" />
      <h2 className="text-[15px] font-semibold text-slate-100 font-mono">
        {table}
      </h2>
      <span className="text-[11px] font-mono text-slate-500 tabular-nums">
        {total.toLocaleString()} row{total !== 1 ? "s" : ""}
      </span>
      {loading && (
        <span className="text-[11px] text-blue-400 animate-pulse">
          refreshing…
        </span>
      )}
    </div>
  );
}

function DataGrid({
  columns,
  rows,
  sort,
  onSort,
  expandedCell,
  onExpandCell,
}: {
  columns: AdminColumnInfo[];
  rows: Record<string, unknown>[];
  sort: SortState;
  onSort: (col: string) => void;
  expandedCell: string | null;
  onExpandCell: (key: string | null) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-[13px]">
        No rows in this table
      </div>
    );
  }

  return (
    <table className="w-full text-[12px] border-collapse">
      <thead className="sticky top-0 z-10">
        <tr className="bg-[#0d1017] border-b border-slate-800">
          {columns.map((col) => {
            const active = sort?.column === col.name;
            return (
              <th
                key={col.name}
                onClick={() => onSort(col.name)}
                className="text-left px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-200 select-none whitespace-nowrap border-r border-slate-800/40 last:border-r-0"
              >
                <span className="inline-flex items-center gap-1.5">
                  {col.name}
                  <span className="text-[9px] text-slate-600 font-normal lowercase">
                    {col.type}
                  </span>
                  {active && (
                    <span className="text-blue-400">
                      {sort!.order === "asc" ? "↑" : "↓"}
                    </span>
                  )}
                </span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIdx) => (
          <tr
            key={rowIdx}
            className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors"
          >
            {columns.map((col) => {
              const cellKey = `${rowIdx}-${col.name}`;
              const val = row[col.name];
              const isExpanded = expandedCell === cellKey;
              return (
                <td
                  key={col.name}
                  className="px-3 py-2 text-slate-300 font-mono border-r border-slate-800/20 last:border-r-0 align-top"
                >
                  <CellValue
                    value={val}
                    type={col.type}
                    expanded={isExpanded}
                    onToggle={() =>
                      onExpandCell(isExpanded ? null : cellKey)
                    }
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CellValue({
  value,
  type,
  expanded,
  onToggle,
}: {
  value: unknown;
  type: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (value === null || value === undefined) {
    return <span className="text-slate-600 italic">null</span>;
  }

  if (typeof value === "boolean") {
    return (
      <span
        className={value ? "text-emerald-400" : "text-red-400"}
      >
        {String(value)}
      </span>
    );
  }

  const str = typeof value === "object" ? JSON.stringify(value) : String(value);

  const isLong = str.length > 80;
  const isJsonish = type === "json" || type === "jsonb" || type === "ARRAY" ||
    (typeof value === "object" && value !== null);

  if (isJsonish || isLong) {
    const display = expanded
      ? typeof value === "object"
        ? JSON.stringify(value, null, 2)
        : str
      : str.slice(0, 80) + (str.length > 80 ? "…" : "");

    return (
      <button
        onClick={onToggle}
        className="text-left max-w-[400px] break-all hover:text-blue-300 transition"
      >
        {expanded ? (
          <pre className="whitespace-pre-wrap text-[11px] text-blue-200 bg-slate-900/60 rounded p-2 mt-1 max-h-[300px] overflow-auto">
            {display}
          </pre>
        ) : (
          <span className="text-slate-400">{display}</span>
        )}
      </button>
    );
  }

  if (type === "uuid") {
    return <span className="text-slate-400">{str.slice(0, 8)}…</span>;
  }

  return <span>{str}</span>;
}

function Pagination({
  page,
  totalPages,
  total,
  perPage,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  onPageChange: (p: number) => void;
}) {
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div className="h-12 shrink-0 flex items-center justify-between px-5 border-t border-slate-800/80 bg-[#0b0e16]">
      <span className="text-[12px] text-slate-500 font-mono tabular-nums">
        {from}–{to} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="px-3 py-1.5 rounded-md text-[12px] border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          Prev
        </button>
        <span className="px-3 text-[12px] text-slate-400 font-mono tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="px-3 py-1.5 rounded-md text-[12px] border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          Next
        </button>
      </div>
    </div>
  );
}
