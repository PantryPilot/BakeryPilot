"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon } from "../../components/Icon";
import { SectionHeader } from "../../components/atoms";
import { useApp } from "../../lib/context";
import { ModelSelector } from "../../components/ModelSelector";
import { providerBadge, type ChatModelOption } from "../../lib/chatModels";
import {
  fetchAdminTables,
  fetchAdminTableRows,
  fetchAdminTableFilters,
  fetchAdminCopilotModel,
  updateAdminCopilotModel,
  updateAdminTableRow,
  createAdminTableRow,
  fetchAdminDataSources,
  refreshAdminDataSource,
  setAdminDataSourceInterval,
  type AdminTableInfo,
  type AdminColumnInfo,
  type AdminTableRowsResponse,
  type AdminTableFilter,
  type AdminTableFilterOption,
  type AdminDataSource,
} from "../../lib/api";

type SortState = { column: string; order: "asc" | "desc" } | null;
type AdminView = "copilot" | "data-sources" | "tables";

type RowModalState =
  | { mode: "edit"; row: Record<string, unknown> }
  | { mode: "add" }
  | null;

export default function AdminPage() {
  const { t } = useApp();
  const [view, setView] = useState<AdminView>("data-sources");
  const [tables, setTables] = useState<AdminTableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<AdminTableRowsResponse | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>(null);
  const [expandedCell, setExpandedCell] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tableFilterSpecs, setTableFilterSpecs] = useState<AdminTableFilter[]>([]);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [rowSearch, setRowSearch] = useState("");
  const [rowModal, setRowModal] = useState<RowModalState>(null);
  const [savingRow, setSavingRow] = useState(false);

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
    async (
      table: string,
      p: number,
      s: SortState,
      filters: Record<string, string>,
    ) => {
      setDataLoading(true);
      const data = await fetchAdminTableRows(
        table,
        p,
        perPage,
        s?.column,
        s?.order,
        filters,
      );
      setTableData(data);
      setDataLoading(false);
    },
    [],
  );

  const loadTableFilters = useCallback(async (table: string) => {
    const data = await fetchAdminTableFilters(table);
    setTableFilterSpecs(data?.filters ?? []);
  }, []);

  const selectTable = (name: string) => {
    setView("tables");
    setActiveTable(name);
    setPage(1);
    setSort(null);
    setExpandedCell(null);
    setRowModal(null);
    setSearch("");
    setActiveFilters({});
    setTableFilterSpecs([]);
    setRowSearch("");
    loadTableFilters(name);
    loadRows(name, 1, null, {});
  };

  const applyFilter = (column: string, value: string) => {
    if (!activeTable) return;
    const next = { ...activeFilters };
    if (value) next[column] = value;
    else delete next[column];
    setActiveFilters(next);
    setPage(1);
    setExpandedCell(null);
    loadRows(activeTable, 1, sort, next);
  };

  const clearFilters = () => {
    if (!activeTable) return;
    setActiveFilters({});
    setPage(1);
    setExpandedCell(null);
    loadRows(activeTable, 1, sort, {});
  };

  const changePage = (newPage: number) => {
    if (!activeTable) return;
    setPage(newPage);
    setExpandedCell(null);
    loadRows(activeTable, newPage, sort, activeFilters);
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
    loadRows(activeTable, 1, newSort, activeFilters);
  };

  const handleSaveRow = async (values: Record<string, unknown>) => {
    if (!activeTable || !tableData || !rowModal) return;
    setSavingRow(true);
    let result;
    if (rowModal.mode === "add") {
      result = await createAdminTableRow(activeTable, values);
    } else {
      const pk = tableData.primary_keys ?? [];
      const key =
        pk.length > 0
          ? Object.fromEntries(pk.map(col => [col, rowModal.row[col]]))
          : { __row_ctid: rowModal.row.__row_ctid };
      result = await updateAdminTableRow(activeTable, key, values);
    }
    setSavingRow(false);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    setRowModal(null);
    await loadRows(activeTable, page, sort, activeFilters);
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
          <SectionHeader title={t("admin.title")} sub={t("admin.subtitle")}/>
        </div>

        <div className="py-1 border-b border-slate-800/80">
          <button
            onClick={() => setView("data-sources")}
            className={`w-full text-left flex items-center gap-2 px-3 py-2.5 transition relative ${
              view === "data-sources"
                ? "text-slate-100 bg-slate-800/50"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"
            }`}
          >
            {view === "data-sources" && (
              <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-blue-500" />
            )}
            <Icon name="download" size={14} className={view === "data-sources" ? "text-blue-400" : "text-slate-600"} />
            <span className="text-[12px] font-medium">Data Sources</span>
          </button>
          <button
            onClick={() => setView("copilot")}
            className={`w-full text-left flex items-center gap-2 px-3 py-2.5 transition relative ${
              view === "copilot"
                ? "text-slate-100 bg-slate-800/50"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"
            }`}
          >
            {view === "copilot" && (
              <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-blue-500" />
            )}
            <Icon name="zap" size={14} className={view === "copilot" ? "text-blue-400" : "text-slate-600"} />
            <span className="text-[12px] font-medium">Copilot LLM</span>
          </button>
        </div>

        <div className="p-3 border-b border-slate-800/80">
          <SectionHeader title="Tables" sub={`${tables.length} total`}/>
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
        {view === "copilot" ? (
          <CopilotModelPanel />
        ) : view === "data-sources" ? (
          <DataSourcesPanel />
        ) : !activeTable ? (
          <EmptyState />
        ) : (
          <>
            <TableHeader
              table={activeTable}
              total={tableData?.total ?? 0}
              loading={dataLoading}
              onAddRow={() => setRowModal({ mode: "add" })}
            />
            <TableFilterBar
              filters={tableFilterSpecs}
              active={activeFilters}
              onChange={applyFilter}
              onClear={clearFilters}
              rowSearch={rowSearch}
              onRowSearch={setRowSearch}
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
                  rowSearch={rowSearch}
                  activeFilters={activeFilters}
                  onEditRow={row => setRowModal({ mode: "edit", row })}
                />
              ) : null}
            </div>
            {rowModal && tableData && (
              <RowFormModal
                mode={rowModal.mode}
                table={activeTable!}
                columns={tableData.columns}
                row={rowModal.mode === "edit" ? rowModal.row : undefined}
                primaryKeys={tableData.primary_keys ?? []}
                saving={savingRow}
                onClose={() => setRowModal(null)}
                onSave={handleSaveRow}
              />
            )}
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

function CopilotModelPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelId, setModelId] = useState("claude-sonnet-4-6");
  const [models, setModels] = useState<ChatModelOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const data = await fetchAdminCopilotModel();
    if (!data) {
      setError("Could not load copilot settings. Is the backend running?");
      setLoading(false);
      return;
    }
    setModelId(data.model_id);
    setModels(data.models);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleChange = async (nextId: string) => {
    setModelId(nextId);
    setSaving(true);
    setError(null);
    const data = await updateAdminCopilotModel(nextId);
    setSaving(false);
    if (!data) {
      setError("Failed to save model selection.");
      return;
    }
    setModelId(data.model_id);
    setModels(data.models);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const active = models.find((m) => m.id === modelId);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[640px] mx-auto p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Icon name="zap" size={20} className="text-blue-400" />
          <div>
            <h1 className="text-[16px] font-semibold text-slate-100">Copilot LLM</h1>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Choose the backend model for all copilot chat requests. End users do not see this setting.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-slate-200 uppercase tracking-wider">
              Active model
            </h3>
            {saving && <span className="text-[11px] text-blue-400 animate-pulse">Saving…</span>}
            {saved && !saving && (
              <span className="text-[11px] text-emerald-400">Saved</span>
            )}
          </div>

          <div className="p-5 space-y-4">
            {loading ? (
              <div className="text-[13px] text-slate-500">Loading models…</div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <ModelSelector
                    models={models}
                    value={modelId}
                    onChange={handleChange}
                    disabled={saving}
                  />
                  {active && (
                    <span className="rounded px-2 py-1 text-[10px] font-mono bg-slate-800 text-slate-400">
                      {providerBadge(active.provider)}
                    </span>
                  )}
                </div>
                {active && (
                  <p className="text-[13px] text-slate-400 leading-relaxed">
                    {active.description}
                  </p>
                )}
                {error && (
                  <p className="text-[12px] text-red-400">{error}</p>
                )}
                <p className="text-[11px] text-slate-600 font-mono">
                  Provider API keys are configured in <code className="text-slate-500">.env</code>.
                  Models without a key appear as disabled.
                </p>
              </>
            )}
          </div>
        </div>
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

function TableFilterBar({
  filters,
  active,
  onChange,
  onClear,
  rowSearch,
  onRowSearch,
}: {
  filters: AdminTableFilter[];
  active: Record<string, string>;
  onChange: (column: string, value: string) => void;
  onClear: () => void;
  rowSearch: string;
  onRowSearch: (v: string) => void;
}) {
  const hasActive = Object.keys(active).length > 0 || rowSearch.length > 0;

  return (
    <div className="shrink-0 flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-800/80 bg-[#0b0e16]/80">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold shrink-0">
        Filters
      </span>
      {/* Column-level dropdown filters (API-provided) */}
      {filters.map((f) => {
        const isActive = !!active[f.column];
        return (
          <label
            key={f.column}
            className={`flex items-center gap-2 rounded px-2 py-1 transition ${isActive ? "bg-amber-500/10" : ""}`}
          >
            <span className={`text-[11px] shrink-0 ${isActive ? "text-amber-300" : "text-slate-400"}`}>{f.label}</span>
            <select
              value={active[f.column] ?? ""}
              onChange={(e) => onChange(f.column, e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 text-slate-200 text-[12px] pl-2 pr-7 py-1.5 outline-none focus:border-blue-500/60 max-w-[220px]"
            >
              <option value="">All</option>
              {f.options.map((opt: AdminTableFilterOption) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({opt.count.toLocaleString()})
                </option>
              ))}
            </select>
          </label>
        );
      })}
      {/* Generic row text search */}
      <label className={`flex items-center gap-2 rounded px-2 py-1 transition ${rowSearch ? "bg-amber-500/10" : ""}`}>
        <span className={`text-[11px] shrink-0 ${rowSearch ? "text-amber-300" : "text-slate-400"}`}>Search</span>
        <input
          type="text"
          value={rowSearch}
          onChange={(e) => onRowSearch(e.target.value)}
          placeholder="Filter visible rows…"
          className="rounded-md border border-slate-700 bg-slate-900 text-slate-200 text-[12px] pl-2 pr-3 py-1.5 outline-none focus:border-blue-500/60 w-[180px]"
        />
      </label>
      {hasActive && (
        <button
          type="button"
          onClick={() => { onClear(); onRowSearch(""); }}
          className="text-[11px] text-slate-500 hover:text-slate-200 transition"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

function TableHeader({
  table,
  total,
  loading,
  onAddRow,
}: {
  table: string;
  total: number;
  loading: boolean;
  onAddRow: () => void;
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
      <div className="flex-1" />
      <button
        type="button"
        onClick={onAddRow}
        className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-semibold"
      >
        Add row
      </button>
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
  rowSearch,
  activeFilters,
  onEditRow,
}: {
  columns: AdminColumnInfo[];
  rows: Record<string, unknown>[];
  sort: SortState;
  onSort: (col: string) => void;
  expandedCell: string | null;
  onExpandCell: (key: string | null) => void;
  rowSearch?: string;
  activeFilters?: Record<string, string>;
  onEditRow: (row: Record<string, unknown>) => void;
}) {
  const visibleRows = rowSearch
    ? rows.filter((row) =>
        Object.values(row).some((v) =>
          String(v ?? "").toLowerCase().includes(rowSearch.toLowerCase()),
        ),
      )
    : rows;

  if (visibleRows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-[13px]">
        No rows in this table
      </div>
    );
  }

  return (
    <table className="bp-admin-table bp-data-table w-full text-[12px] border-collapse">
      <thead className="sticky top-0 z-10">
        <tr className="bg-[#0a0d14] border-b border-slate-700/80 shadow-[0_1px_0_0_rgba(15,23,42,0.6)]">
          <th className="text-left px-2 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 w-16 border-r border-slate-700/50">
            Edit
          </th>
          {columns.map((col) => {
            const sortActive = sort?.column === col.name;
            const filterActive = !!(activeFilters?.[col.name]);
            return (
              <th
                key={col.name}
                onClick={() => onSort(col.name)}
                className={`text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider cursor-pointer hover:text-white hover:bg-slate-800/40 select-none whitespace-nowrap border-r border-slate-700/50 last:border-r-0 ${filterActive ? "bg-amber-500/10 text-amber-300" : "text-slate-200"}`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {col.name}
                  <span className={`text-[9px] font-medium lowercase ${filterActive ? "text-amber-500/70" : "text-slate-500"}`}>
                    {col.type}
                  </span>
                  {sortActive && (
                    <span className="text-blue-400 font-bold">
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
        {visibleRows.map((row, rowIdx) => (
          <tr
            key={rowIdx}
            className={`border-b border-slate-800/40 transition-colors ${
              rowIdx % 2 === 0
                ? "bg-[#0c111c] hover:bg-slate-800/35"
                : "bg-slate-900/45 hover:bg-slate-800/50"
            }`}
          >
            <td className="px-2 py-2 border-r border-slate-800/25 align-top">
              <button
                type="button"
                onClick={() => onEditRow(row)}
                className="px-2 py-1 rounded-md text-[11px] font-medium border border-slate-700 text-slate-300 hover:border-blue-500/50 hover:text-blue-300 hover:bg-blue-500/10 transition"
              >
                Edit
              </button>
            </td>
            {columns.map((col) => {
              const cellKey = `${rowIdx}-${col.name}`;
              const val = row[col.name];
              const isExpanded = expandedCell === cellKey;
              return (
                <td
                  key={col.name}
                  className="px-3 py-2 text-slate-300 font-mono border-r border-slate-800/25 last:border-r-0 align-top bp-admin-cell"
                >
                  <CellValue
                    column={col.name}
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
  column,
  value,
  type,
  expanded,
  onToggle,
}: {
  column: string;
  value: unknown;
  type: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (value === null || value === undefined) {
    return <span className="text-slate-400 italic">null</span>;
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

  const isUrl =
    column === "source_url" ||
    (typeof value === "string" && /^https?:\/\//i.test(str));

  if (isUrl) {
    return (
      <a
        href={str}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 font-medium underline underline-offset-2 decoration-blue-500/40 hover:text-blue-300 break-all"
        title={str}
      >
        {str}
      </a>
    );
  }

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
        className="text-left max-w-[400px] break-all text-slate-300 hover:text-blue-300 transition"
      >
        {expanded ? (
          <pre className="whitespace-pre-wrap text-[11px] text-slate-200 bg-slate-800 rounded p-2 mt-1 max-h-[300px] overflow-auto border border-slate-700">
            {display}
          </pre>
        ) : (
          <span className="text-slate-300">{display}</span>
        )}
      </button>
    );
  }

  if (type === "uuid") {
    return <span className="text-slate-500">{str.slice(0, 8)}…</span>;
  }

  return <span className="text-slate-300">{str}</span>;
}

function valueToEditString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function parseDraftValues(
  draft: Record<string, string>,
  columns: AdminColumnInfo[],
  originalRow?: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const col of columns) {
    const next = draft[col.name];
    if (originalRow !== undefined) {
      const orig = valueToEditString(originalRow[col.name]);
      if (next === orig) continue;
    } else if (next.trim() === "") {
      continue;
    }
    if (next.trim() === "") {
      values[col.name] = null;
    } else if (
      col.type === "json" ||
      col.type === "jsonb" ||
      next.trim().startsWith("{") ||
      next.trim().startsWith("[")
    ) {
      try {
        values[col.name] = JSON.parse(next);
      } catch {
        values[col.name] = next;
      }
    } else if (col.type === "boolean") {
      values[col.name] = next.toLowerCase() === "true";
    } else {
      values[col.name] = next;
    }
  }
  return values;
}

function RowFormModal({
  mode,
  table,
  columns,
  row,
  primaryKeys,
  saving,
  onClose,
  onSave,
}: {
  mode: "edit" | "add";
  table: string;
  columns: AdminColumnInfo[];
  row?: Record<string, unknown>;
  primaryKeys: string[];
  saving: boolean;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => void;
}) {
  const editableColumns = columns.filter(c => c.name !== "__row_ctid");
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      editableColumns.map(c => [
        c.name,
        row ? valueToEditString(row[c.name]) : "",
      ]),
    ),
  );

  const handleField = (name: string, value: string) => {
    setDraft(prev => ({ ...prev, [name]: value }));
  };

  const handleApply = () => {
    const values = parseDraftValues(draft, editableColumns, row);
    if (mode === "edit" && Object.keys(values).length === 0) {
      onClose();
      return;
    }
    if (mode === "add" && Object.keys(values).length === 0) {
      window.alert("Enter at least one field (leave others blank for DB defaults).");
      return;
    }
    onSave(values);
  };

  const pkLabel =
    mode === "edit" && row
      ? primaryKeys.length > 0
        ? primaryKeys.map(k => `${k}=${String(row[k] ?? "null")}`).join(", ")
        : `ctid=${String(row.__row_ctid ?? "?")}`
      : "Leave blank any column that should use a database default";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-slate-800 bg-[#0c111c] shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-slate-100 font-mono truncate">
              {mode === "add" ? "Add row" : "Edit row"} · {table}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono truncate" title={pkLabel}>
              {pkLabel}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {editableColumns.map(col => {
            const isLong =
              col.type === "json" ||
              col.type === "jsonb" ||
              col.type === "ARRAY" ||
              (draft[col.name]?.length ?? 0) > 80;
            return (
              <label key={col.name} className="block">
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-mono">
                  {col.name}
                  <span className="ml-2 lowercase text-slate-600">{col.type}</span>
                  {primaryKeys.includes(col.name) && (
                    <span className="ml-2 text-amber-500/80 normal-case">PK</span>
                  )}
                </span>
                {isLong ? (
                  <textarea
                    value={draft[col.name] ?? ""}
                    onChange={e => handleField(col.name, e.target.value)}
                    rows={4}
                    placeholder={mode === "add" ? "optional" : undefined}
                    className="mt-1 w-full bg-slate-900 border border-slate-800 rounded-md px-2.5 py-2 text-[12px] font-mono text-slate-100 focus:outline-none focus:border-blue-500/60 resize-y"
                  />
                ) : (
                  <input
                    type="text"
                    value={draft[col.name] ?? ""}
                    onChange={e => handleField(col.name, e.target.value)}
                    placeholder={mode === "add" ? "optional" : undefined}
                    className="mt-1 w-full bg-slate-900 border border-slate-800 rounded-md px-2.5 py-2 text-[12px] font-mono text-slate-100 focus:outline-none focus:border-blue-500/60"
                  />
                )}
              </label>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2 rounded-md border border-slate-700 text-slate-300 text-[13px] hover:border-slate-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={saving}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-[13px]"
          >
            {saving
              ? mode === "add"
                ? "Inserting…"
                : "Applying…"
              : mode === "add"
                ? "Insert row"
                : "Apply changes"}
          </button>
        </div>
      </div>
    </div>
  );
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

// ---------- Data Sources panel ----------

const INTERVAL_OPTIONS: { label: string; seconds: number }[] = [
  { label: "Off",          seconds: 0 },
  { label: "Every hour",   seconds: 3600 },
  { label: "Every 6 hours", seconds: 21600 },
  { label: "Every 24 hours", seconds: 86400 },
];

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const elapsedSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (elapsedSec < 60) return `${elapsedSec}s ago`;
  const m = Math.floor(elapsedSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatInterval(seconds: number): string {
  if (seconds <= 0) return "Off";
  const found = INTERVAL_OPTIONS.find((o) => o.seconds === seconds);
  if (found) return found.label;
  if (seconds >= 86400) return `Every ${Math.round(seconds / 86400)}d`;
  if (seconds >= 3600) return `Every ${Math.round(seconds / 3600)}h`;
  return `Every ${Math.round(seconds / 60)}m`;
}

function DataSourcesPanel() {
  const [sources, setSources] = useState<AdminDataSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const data = await fetchAdminDataSources();
    if (data === null) {
      setError("Could not load data sources. Is the backend running?");
      return;
    }
    setError(null);
    setSources(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while any source is running OR an interval is set, so the UI
  // reflects status flips without manual refresh.
  useEffect(() => {
    if (!sources) return;
    const anyRunning = sources.some((s) => s.running) || refreshingIds.size > 0;
    if (!anyRunning) {
      // Still refresh once a minute so the "last_at" pill ticks up.
      const t = setInterval(load, 30_000);
      return () => clearInterval(t);
    }
    const t = setInterval(load, 2_000);
    return () => clearInterval(t);
  }, [sources, refreshingIds, load]);

  const handleRefresh = async (id: string) => {
    setRefreshingIds((prev) => new Set(prev).add(id));
    const updated = await refreshAdminDataSource(id);
    if (updated) {
      setSources((prev) =>
        (prev ?? []).map((s) => (s.id === id ? updated : s)),
      );
    }
    // Backend ran the refresh in a BackgroundTask; we'll discover completion
    // via the poll loop above. Drop the local "refreshing" flag on next tick.
    setTimeout(() => {
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 500);
  };

  const handleIntervalChange = async (id: string, seconds: number) => {
    const updated = await setAdminDataSourceInterval(id, seconds);
    if (updated) {
      setSources((prev) =>
        (prev ?? []).map((s) => (s.id === id ? updated : s)),
      );
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[820px] mx-auto p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Icon name="download" size={20} className="text-blue-400" />
          <div>
            <h1 className="text-[16px] font-semibold text-slate-100">Data Sources</h1>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Refresh live-fetched data on demand or schedule background refreshes.
              No-auth APIs — running these makes outbound HTTP requests.
            </p>
          </div>
        </div>

        {error && <p className="text-[12px] text-red-400">{error}</p>}

        {!sources ? (
          <div className="text-[13px] text-slate-500">Loading data sources…</div>
        ) : (
          <div className="space-y-3">
            {sources.map((s) => {
              const isRunning = s.running || refreshingIds.has(s.id);
              const statusBadge = isRunning
                ? { text: "running…", cls: "bg-blue-500/10 text-blue-300 animate-pulse" }
                : s.last_status === "ok"
                  ? { text: "ok", cls: "bg-emerald-500/10 text-emerald-400" }
                  : s.last_status === "failed"
                    ? { text: "failed", cls: "bg-red-500/10 text-red-400" }
                    : { text: "never run", cls: "bg-slate-800 text-slate-500" };

              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden"
                >
                  <div className="p-4 border-b border-slate-800 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[13px] font-semibold text-slate-200">{s.label}</h3>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${statusBadge.cls}`}>
                          {statusBadge.text}
                        </span>
                      </div>
                      <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">
                        {s.description}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRefresh(s.id)}
                      disabled={isRunning}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 border border-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      <Icon name="download" size={12} />
                      {isRunning ? "Refreshing…" : "Refresh now"}
                    </button>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                    <Metric label="Target tables" value={s.target_tables.join(", ")} />
                    <Metric label="Last refresh" value={formatRelative(s.last_at)} title={s.last_at ?? undefined} />
                    <Metric label="Rows in table(s)" value={s.last_rows?.toLocaleString() ?? "—"} />
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono mb-1">
                        Auto-refresh
                      </div>
                      <select
                        value={s.interval_seconds}
                        onChange={(e) => handleIntervalChange(s.id, Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-blue-500/60"
                      >
                        {INTERVAL_OPTIONS.map((opt) => (
                          <option key={opt.seconds} value={opt.seconds}>
                            {opt.label}
                          </option>
                        ))}
                        {!INTERVAL_OPTIONS.some((o) => o.seconds === s.interval_seconds) && (
                          <option value={s.interval_seconds}>
                            {formatInterval(s.interval_seconds)}
                          </option>
                        )}
                      </select>
                    </div>
                  </div>
                  {s.last_message && (
                    <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950/40">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono mb-0.5">
                        Last message
                      </div>
                      <p className="text-[11px] font-mono text-slate-400 truncate" title={s.last_message}>
                        {s.last_message}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-slate-600 font-mono pt-2">
          Refreshes shell out to <code className="text-slate-500">python -m uv run infra/seed_*.py</code>.
          Each source has its own concurrency lock — a manual click during an in-flight run is a no-op.
        </p>
      </div>
    </div>
  );
}

function Metric({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono mb-1">
        {label}
      </div>
      <div className="text-slate-300 truncate" title={title ?? value}>
        {value}
      </div>
    </div>
  );
}
