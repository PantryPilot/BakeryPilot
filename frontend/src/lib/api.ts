// Typed HTTP client for the BakeryPilot backend.
//
// Every function returns frontend-shaped data (the types in lib/data.ts)
// via an internal adapter layer, so existing components don't change.
// Calls fall back to the static seed in lib/data.ts when the backend is unreachable
// or NEXT_PUBLIC_BACKEND_URL is unset.

import type {
  Supplier,
  Lot,
  Disruption,
  StorageType,
  LotStatus,
  SupplierStatus,
  Kpis,
} from "./data";
import type { ChatModelOption } from "./chatModels";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") || "http://localhost:8000";

// ---------- Backend response shapes ----------

interface BackendSupplier {
  supplier_id: string;
  name: string;
  personality: string;
  contact_email: string;
  payment_terms: string;
  moq_kg: number;
  lead_time_mean_days: number;
  lead_time_std_days: number;
  window_earliest_day: number;
  window_latest_day: number;
  contract_expiry_date: string;
  on_time_rate: number;
  fill_rate: number;
  window_compliance_rate: number;
  price_variance_vs_benchmark: number;
  moq_tax_quarter_usd: number;
  contact_name?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  notes?: string | null;
}

interface BackendLot {
  lot_id: string;
  facility_id: string;
  ingredient_id: string;
  ingredient_name: string;
  quantity_kg: number;
  expiry_date: string;
  storage_zone: string;
  received_date: string;
  supplier_id: string | null;
  spoilage_risk_score: number;
}

interface BackendDisruption {
  signal_id: string;
  supplier_id: string | null;
  ingredient_id: string | null;
  kind: string;
  severity: number;
  source: string;
  message: string;
  observed_at: string;
}

interface BackendWasteCounter {
  kg_avoided: number;
  dollars_saved: number;
  co2e_avoided_kg: number;
  period_start: string;
  period_end: string;
  moq_tax_ytd?: number;
  disruptions_caught?: number;
}

export interface BackendWasteEvent {
  event_id: string;
  ts: string;
  lot_id: string | null;
  ingredient_name: string;
  quantity_kg: number;
  value_usd: number;
  reason: string;
  avoided: boolean;
  facility_id: string;
}

export interface BackendYieldTelemetryPoint {
  date: string;
  line_id: string;
  facility_id: string;
  actual_pct: number;
  target_pct: number;
}

interface BackendActionCard {
  card_id: string;
  kind: string;
  payload: Record<string, unknown>;
  state: "pending" | "confirmed" | "rejected";
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

export interface BackendScheduleDiffRun {
  run_id: string;
  sku_id: string;
  start_at: string;
  end_at: string;
  quantity: number;
  lot_assignments: string[];
}

export interface BackendScheduleDiff {
  before: BackendScheduleDiffRun[];
  after: BackendScheduleDiffRun[];
  changes: { kind: string; narration: string; affected_run_ids: string[] }[];
}

// ---------- Adapters: backend -> frontend shapes ----------

const FACILITY_MAP: Record<string, string> = {
  "plant-toronto": "p1",
  "plant-mississauga": "p2",
  "plant-hamilton": "p3",
  "plant-montreal": "p4",
  plant_1: "p1",
  plant_2: "p2",
  plant_3: "p3",
  plant_4: "p4",
};

function deriveSupplierStatus(b: BackendSupplier): SupplierStatus {
  if (b.window_compliance_rate < 0.65 || b.on_time_rate < 0.82) return "disrupt";
  if (b.on_time_rate < 0.92 || b.moq_tax_quarter_usd > 3000) return "warn";
  return "ok";
}

function adaptSupplier(b: BackendSupplier): Supplier {
  return {
    id: b.supplier_id.replace(/^sup_/, "s-"),
    name: b.name,
    tier: b.moq_kg >= 1500 ? 1 : 2,
    onTime: b.on_time_rate,
    fill: b.fill_rate,
    window: b.window_compliance_rate,
    priceVsBench: b.price_variance_vs_benchmark,
    moqTaxQtd: b.moq_tax_quarter_usd,
    contractExpiry: b.contract_expiry_date,
    status: deriveSupplierStatus(b),
    contactEmail: b.contact_email || undefined,
    contactName: b.contact_name || undefined,
    phone: b.phone || undefined,
    website: b.website || undefined,
    address: b.address || undefined,
    notes: b.notes || undefined,
    paymentTerms: b.payment_terms || undefined,
    moqKg: b.moq_kg,
    leadTimeMean: b.lead_time_mean_days,
  };
}

function adaptLot(b: BackendLot): Lot {
  // Use date-only math to avoid timezone/rounding drift between UI status and risk.
  const [y, m, d] = b.expiry_date.split("-").map((v) => parseInt(v, 10));
  const expiryDayUtc = Date.UTC(y, m - 1, d);
  const now = new Date();
  const todayDayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDelta = Math.floor((expiryDayUtc - todayDayUtc) / 86_400_000);
  const daysLeft = Math.max(0, dayDelta);
  const risk = Math.min(1, Math.max(0, b.spoilage_risk_score));
  const status: LotStatus =
    dayDelta < 0
      ? "expired"
      : risk >= 0.85
      ? "critical"
      : risk >= 0.55
      ? "warn"
      : "ok";
  return {
    id: b.lot_id.toUpperCase(),
    ingredient: b.ingredient_name,
    facility: FACILITY_MAP[b.facility_id] ?? b.facility_id,
    qty: b.quantity_kg,
    unit: "kg",
    expiry: b.expiry_date,
    daysLeft,
    storage: b.storage_zone as StorageType,
    risk,
    status,
  };
}

function adaptDisruption(b: BackendDisruption): Disruption {
  const sev =
    b.severity >= 0.6 ? "red" : b.severity >= 0.35 ? "amber" : "info";
  return {
    id: b.signal_id,
    ts: b.observed_at.replace("T", " ").slice(0, 16),
    severity: sev,
    src: b.supplier_id ?? b.source,
    text: b.message,
  };
}

// ---------- Generic fetch helper ----------

async function safeFetch<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 4000,
): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ---------- Public API: each returns frontend-shaped data ----------

export async function fetchLots(): Promise<Lot[] | null> {
  const data = await safeFetch<BackendLot[]>("/api/lots");
  return data?.map(adaptLot) ?? null;
}

export async function fetchSuppliers(): Promise<Supplier[] | null> {
  const data = await safeFetch<BackendSupplier[]>("/api/suppliers");
  return data?.map(adaptSupplier) ?? null;
}

export async function fetchDisruptions(): Promise<Disruption[] | null> {
  const data = await safeFetch<BackendDisruption[]>("/api/disruptions");
  return data?.map(adaptDisruption) ?? null;
}

export async function fetchEsgCounter(): Promise<Partial<Kpis> | null> {
  const data = await safeFetch<BackendWasteCounter>("/api/esg/counter");
  if (!data) return null;
  return {
    wasteAvoided: Math.round(data.dollars_saved),
    co2eSaved: Number((data.co2e_avoided_kg / 1000).toFixed(1)),
    moqTaxYtd: data.moq_tax_ytd,
    disruptionsCaught: data.disruptions_caught,
  };
}

export async function fetchWasteEvents(facilityId?: string): Promise<BackendWasteEvent[] | null> {
  const qs = facilityId ? `?facility_id=${encodeURIComponent(facilityId)}` : "";
  return safeFetch<BackendWasteEvent[]>(`/api/esg/waste_events${qs}`);
}

export async function fetchYieldTelemetry(lineId?: string): Promise<BackendYieldTelemetryPoint[] | null> {
  const qs = lineId ? `?line_id=${encodeURIComponent(lineId)}` : "";
  return safeFetch<BackendYieldTelemetryPoint[]>(`/api/yield/telemetry${qs}`);
}

export async function fetchDemandForecasts(skuId?: string, days = 14): Promise<import("./data").DemandForecast[] | null> {
  const qs = new URLSearchParams();
  if (skuId) qs.set("sku_id", skuId);
  qs.set("days", String(days));
  const rows = await safeFetch<{
    sku_id: string; forecast_date: string; quantity_expected: number;
    quantity_low: number; quantity_high: number;
  }[]>(`/api/forecasts?${qs.toString()}`);
  if (!rows) return null;
  return rows.map(r => ({
    skuId: r.sku_id,
    date: r.forecast_date,
    expected: r.quantity_expected,
    low: r.quantity_low,
    high: r.quantity_high,
  }));
}

// ---------- Additional backend response shapes ----------

export interface BackendSubstitutionCandidate {
  sku_id: string;
  sku_name: string;
  achievable_quantity: number;
  margin_score: number;
  reason: string;
  facility_id?: string | null;
  facility_name?: string | null;
  allergens?: string[];
}

export interface BackendFormulaUsage {
  sku_id: string;
  sku_name: string;
  category: string | null;
  kg_per_unit: number;
  allergen_tags: string[];
}

export interface BackendScheduleRun {
  run_id: string;
  sku_id: string;
  start_at: string;
  end_at: string;
  quantity: number;
  lot_assignments: string[];
}

export interface BackendSchedule {
  schedule_id: string;
  version: number;
  facility_id: string;
  line_id: string;
  runs: BackendScheduleRun[];
  waste_avoided_kg: number;
  status: string;
}

export interface BackendMoqTaxEntry {
  supplier_id: string;
  quarter: string;
  overage_kg: number;
  holding_cost_usd: number;
  recorded_at: string;
}

export interface BackendEsgPattern {
  pattern_id: string;
  description: string;
  occurrences: number;
  root_cause: string;
  proposed_rule: string;
}

export interface BackendOrder {
  order_id: string;
  supplier_id: string;
  items: { ingredient_id: string; quantity_kg: number; unit_price: number }[];
  delivery_date: string;
  status: string;
  confirmed_at: string | null;
  action_card_id: string | null;
}

// ---------- Additional fetch functions ----------

export async function fetchLotSubstitutions(
  lotId: string,
): Promise<BackendSubstitutionCandidate[] | null> {
  return safeFetch<BackendSubstitutionCandidate[]>(
    `/api/lots/${encodeURIComponent(lotId)}/substitutions`,
  );
}

export async function fetchLotUsedIn(
  lotId: string,
): Promise<BackendFormulaUsage[] | null> {
  return safeFetch<BackendFormulaUsage[]>(
    `/api/lots/${encodeURIComponent(lotId)}/used_in`,
  );
}

export async function fetchSchedules(): Promise<BackendSchedule[] | null> {
  return safeFetch<BackendSchedule[]>("/api/schedules");
}

export interface CreateScheduleInput {
  facility_id: string;
  line_id: string;
  sku_id: string;
  start_at: string;
  end_at: string;
  quantity_units: number;
  status?: string;
  waste_avoided_kg?: number;
}

export async function createSchedule(
  input: CreateScheduleInput,
): Promise<BackendSchedule | null> {
  return safeFetch<BackendSchedule>("/api/schedules", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchMoqTax(
  supplierId: string,
): Promise<BackendMoqTaxEntry[] | null> {
  return safeFetch<BackendMoqTaxEntry[]>(
    `/api/suppliers/${encodeURIComponent(supplierId)}/moq_tax`,
  );
}

export async function fetchEsgPatterns(): Promise<BackendEsgPattern[] | null> {
  return safeFetch<BackendEsgPattern[]>("/api/esg/patterns");
}

/** Fetch supplier orders. Optionally filter by frontend-format supplier id (e.g. "s-northstar_mills"). */
export async function fetchOrders(supplierId?: string): Promise<BackendOrder[] | null> {
  const all = await safeFetch<BackendOrder[]>("/api/orders");
  if (!all) return null;
  if (!supplierId) return all;
  const backendId = supplierId.replace(/^s-/, "sup_");
  return all.filter((o) => o.supplier_id === backendId);
}

// ---------- Action cards ----------

export function formatScheduleWindow(startIso: unknown, endIso: unknown): string {
  if (!startIso || !endIso) return "—";
  const start = new Date(String(startIso));
  const end = new Date(String(endIso));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";
  const fmtDate = (d: Date) =>
    d.toLocaleString("en-CA", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    });
  const fmtTime = (d: Date) =>
    d.toLocaleString("en-CA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    });
  return `${fmtDate(start)} – ${fmtTime(end)} UTC`;
}

const ACTION_CARD_ICONS: Record<string, string> = {
  supplier_order: "truck",
  schedule_change: "calendar",
  work_order: "bars",
  transfer: "diff",
  notify: "bell",
};

/** Adapt a backend action card to the frontend ActionCardData shape for <ActionCard/>. */
export function adaptActionCard(b: BackendActionCard) {
  const p = (b.payload || {}) as Record<string, unknown>;
  const shortSku = (id: unknown) => String(id ?? "—").replace(/^sku-/, "").replace(/-/g, " ");

  if (b.kind === "schedule_change") {
    const beforeWindow =
      String(p.before_window ?? "") ||
      formatScheduleWindow(p.before_start_at, p.before_end_at);
    const afterWindow =
      String(p.after_window ?? "") ||
      formatScheduleWindow(p.start_at, p.end_at);
    const beforeName = String(
      p.before_sku_name ?? shortSku(p.requested_by_sku_id),
    );
    const afterName = String(
      p.after_sku_name ?? shortSku(p.substitute_sku_id),
    );
    const changeSummary = String(
      p.change_summary ?? p.rationale ?? "",
    );
    return {
      kind: "Schedule Change",
      agent: String(p.agent ?? "SchedulerAgent"),
      icon: ACTION_CARD_ICONS.schedule_change,
      title: String(p.title ?? `${beforeName} → ${afterName}`),
      summary: [
        { label: "Before", value: beforeWindow },
        { label: "After", value: afterWindow },
        {
          label: "Product",
          value: beforeName === afterName ? beforeName : `${beforeName} → ${afterName}`,
        },
      ],
      details: [
        { label: "Plant", value: String(p.facility_name ?? p.facility_id ?? "—") },
        { label: "Line", value: String(p.line_name ?? p.line_id ?? "—") },
        { label: "Units", value: String(p.requested_units ?? "—") },
      ],
      flags: changeSummary
        ? [{ text: changeSummary, tone: "amber" as const }]
        : undefined,
      state: b.state,
      cardId: b.card_id,
    };
  }

  const summary = Object.entries(p)
    .filter(([k]) => !["title", "sub", "agent", "rationale"].includes(k))
    .slice(0, 3)
    .map(([k, v]) => ({ label: k.replace(/_/g, " "), value: String(v) }));
  if (summary.length === 0) {
    summary.push({ label: "created", value: b.created_at.slice(0, 10) });
  }
  return {
    kind: b.kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    agent: String(p.agent ?? "Agent"),
    icon: ACTION_CARD_ICONS[b.kind] ?? "zap",
    title: String(p.title ?? b.kind.replace(/_/g, " ")),
    summary,
    state: b.state,
    cardId: b.card_id,
  };
}

export async function fetchActionCards(
  state?: "pending" | "confirmed" | "rejected",
): Promise<BackendActionCard[] | null> {
  const q = state ? `?state=${encodeURIComponent(state)}` : "";
  return safeFetch<BackendActionCard[]>(`/api/action_cards${q}`);
}

export async function fetchPendingScheduleChangeCard(): Promise<BackendActionCard | null> {
  const cards = await fetchActionCards("pending");
  if (!cards) return null;
  return cards.find((c) => c.kind === "schedule_change") ?? null;
}

export async function fetchScheduleDiff(
  scheduleId = "current",
): Promise<BackendScheduleDiff | null> {
  return safeFetch<BackendScheduleDiff>(
    `/api/schedules/${encodeURIComponent(scheduleId)}/diff`,
  );
}

export async function fetchActionCard(
  cardId: string,
): Promise<BackendActionCard | null> {
  return safeFetch<BackendActionCard>(`/api/action_cards/${cardId}`);
}

export async function confirmActionCard(
  cardId: string,
): Promise<BackendActionCard | null> {
  return safeFetch<BackendActionCard>(`/api/action_cards/${cardId}/confirm`, {
    method: "POST",
  });
}

export async function rejectActionCard(
  cardId: string,
): Promise<BackendActionCard | null> {
  return safeFetch<BackendActionCard>(`/api/action_cards/${cardId}/reject`, {
    method: "POST",
  });
}

// ---------- Admin ----------

export interface AdminTableInfo {
  name: string;
  row_count: number;
}

export interface AdminColumnInfo {
  name: string;
  type: string;
}

export interface AdminTableRowsResponse {
  table: string;
  columns: AdminColumnInfo[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  per_page: number;
  active_filters?: Record<string, string>;
}

export interface AdminTableFilterOption {
  value: string;
  label: string;
  count: number;
}

export interface AdminTableFilter {
  column: string;
  label: string;
  options: AdminTableFilterOption[];
}

export interface AdminTableFiltersResponse {
  table: string;
  filters: AdminTableFilter[];
}

export async function fetchAdminTables(): Promise<AdminTableInfo[] | null> {
  return safeFetch<AdminTableInfo[]>("/api/admin/tables", undefined, 10000);
}

export async function fetchAdminTableFilters(
  table: string,
): Promise<AdminTableFiltersResponse | null> {
  return safeFetch<AdminTableFiltersResponse>(
    `/api/admin/tables/${encodeURIComponent(table)}/filters`,
    undefined,
    10000,
  );
}

export async function fetchAdminTableRows(
  table: string,
  page = 1,
  perPage = 50,
  sort?: string,
  order?: "asc" | "desc",
  filters?: Record<string, string>,
): Promise<AdminTableRowsResponse | null> {
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("per_page", String(perPage));
  if (sort) qs.set("sort", sort);
  if (order) qs.set("order", order);
  if (filters) {
    for (const [column, value] of Object.entries(filters)) {
      if (value) qs.set(`filter_${column}`, value);
    }
  }
  return safeFetch<AdminTableRowsResponse>(
    `/api/admin/tables/${encodeURIComponent(table)}/rows?${qs.toString()}`,
    undefined,
    10000,
  );
}

export interface AdminCopilotModelSettings {
  model_id: string;
  models: ChatModelOption[];
}

export async function fetchAdminCopilotModel(): Promise<AdminCopilotModelSettings | null> {
  return safeFetch<AdminCopilotModelSettings>("/api/admin/copilot-model");
}

export async function updateAdminCopilotModel(
  modelId: string,
): Promise<AdminCopilotModelSettings | null> {
  return safeFetch<AdminCopilotModelSettings>("/api/admin/copilot-model", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: modelId }),
  });
}

export interface AdminDataSource {
  id: string;
  label: string;
  description: string;
  target_tables: string[];
  typical_runtime_seconds: number;
  last_at: string | null;
  last_status: "ok" | "failed" | null;
  last_message: string | null;
  last_rows: number | null;
  interval_seconds: number;
  running: boolean;
}

export async function fetchAdminDataSources(): Promise<AdminDataSource[] | null> {
  return safeFetch<AdminDataSource[]>("/api/admin/data-sources", undefined, 10000);
}

export async function refreshAdminDataSource(
  sourceId: string,
): Promise<AdminDataSource | null> {
  return safeFetch<AdminDataSource>(
    `/api/admin/data-sources/${encodeURIComponent(sourceId)}/refresh`,
    { method: "POST" },
    10000,
  );
}

export async function setAdminDataSourceInterval(
  sourceId: string,
  intervalSeconds: number,
): Promise<AdminDataSource | null> {
  return safeFetch<AdminDataSource>(
    `/api/admin/data-sources/${encodeURIComponent(sourceId)}/interval`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval_seconds: intervalSeconds }),
    },
    10000,
  );
}

// ---------- Users + settings ----------

export interface BackendUser {
  user_id: string;
  display_name: string;
  role: string;
  email: string;
  default_facility_id: string | null;
}

export interface BackendUserSettings {
  user_id: string;
  theme: "dark" | "light";
  accent: "blue" | "emerald" | "violet" | "amber" | "teal" | "indigo";
  notif_toast: boolean;
  notif_auto_dismiss: boolean;
  notif_expiring_lots: boolean;
  notif_supplier_risk: boolean;
  notif_yield_anomaly: boolean;
}

export async function fetchCurrentUser(): Promise<BackendUser | null> {
  return safeFetch<BackendUser>("/api/users/me");
}

export async function updateCurrentUser(
  patch: Partial<Pick<BackendUser, "display_name" | "role" | "default_facility_id">>,
): Promise<BackendUser | null> {
  return safeFetch<BackendUser>("/api/users/me", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export async function fetchUserSettings(): Promise<BackendUserSettings | null> {
  return safeFetch<BackendUserSettings>("/api/users/me/settings");
}

export async function updateUserSettings(
  patch: Partial<Omit<BackendUserSettings, "user_id">>,
): Promise<BackendUserSettings | null> {
  return safeFetch<BackendUserSettings>("/api/users/me/settings", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

// ---------- Facilities ----------

export interface BackendFacility {
  facility_id: string;
  short_code: string;
  name: string;
  city: string | null;
  province: string | null;
  timezone: string;
  cold_capacity_kg: number | null;
  dry_capacity_kg: number | null;
  line_count: number;
}

export interface BackendFacilityZone {
  zone: "frozen" | "refrigerated" | "dry";
  used_kg: number;
  capacity_kg: number;
  pct: number;
}

export interface BackendFacilityUtilization {
  facility_id: string;
  short_code: string;
  zones: BackendFacilityZone[];
  overall_pct: number;
}

export interface BackendActiveRun {
  run_id: string;
  line_id: string;
  line_number: number;
  sku_id: string;
  sku_name: string;
  started_at: string;
  ended_at: string | null;
  planned_kg: number | null;
  actual_kg: number | null;
  status: string;
}

export async function fetchFacilities(): Promise<BackendFacility[] | null> {
  return safeFetch<BackendFacility[]>("/api/facilities");
}

export async function fetchFacility(id: string): Promise<BackendFacility | null> {
  return safeFetch<BackendFacility>(`/api/facilities/${encodeURIComponent(id)}`);
}

export async function fetchFacilityUtilization(
  id: string,
): Promise<BackendFacilityUtilization | null> {
  return safeFetch<BackendFacilityUtilization>(
    `/api/facilities/${encodeURIComponent(id)}/utilization`,
  );
}

export async function fetchActiveRuns(id: string): Promise<BackendActiveRun[] | null> {
  return safeFetch<BackendActiveRun[]>(
    `/api/facilities/${encodeURIComponent(id)}/active_runs`,
  );
}

// ---------- Retailers ----------

export interface BackendRetailer {
  retailer_id: string;
  name: string;
  po_ratio: number;
  shelf_risk: "green" | "amber" | "red";
  open_orders: number;
  forecast_units: number;
}

export async function fetchRetailers(): Promise<BackendRetailer[] | null> {
  return safeFetch<BackendRetailer[]>("/api/retailers");
}

// ---------- Dashboard loops + network ----------

export interface BackendLoopStat {
  k: string;
  v: string;
}

export interface BackendLoopCard {
  id: string;
  label: string;
  stats: BackendLoopStat[];
}

export interface BackendNetworkSummary {
  supplier_count: number;
  plant_count: number;
  retailer_count: number;
  active_transfers: number;
}

export async function fetchDashboardLoops(): Promise<BackendLoopCard[] | null> {
  return safeFetch<BackendLoopCard[]>("/api/dashboard/loops");
}

export async function fetchDashboardNetwork(): Promise<BackendNetworkSummary | null> {
  return safeFetch<BackendNetworkSummary>("/api/dashboard/network");
}

// ---------- Scorecard summary + supplier performance history ----------

export interface BackendScorecardSummary {
  supplier_count: number;
  tier_a: number;
  tier_b: number;
  tier_c: number;
  pending_drafts: number;
  contracts_expiring_60d: number;
  avg_on_time_rate: number;
  avg_fill_rate: number;
}

export interface BackendSupplierPerformancePoint {
  week_start: string;
  on_time_rate: number;
  fill_rate: number;
  window_compliance_rate: number;
}

export interface BackendSupplierPerformance {
  supplier_id: string;
  points: BackendSupplierPerformancePoint[];
}

export async function fetchScorecardSummary(): Promise<BackendScorecardSummary | null> {
  return safeFetch<BackendScorecardSummary>("/api/suppliers/_meta/scorecard_summary");
}

export async function fetchSupplierPerformance(
  supplierId: string,
): Promise<BackendSupplierPerformance | null> {
  const backendId = supplierId.replace(/^s-/, "sup_");
  return safeFetch<BackendSupplierPerformance>(
    `/api/suppliers/${encodeURIComponent(backendId)}/performance`,
  );
}

// ---------- Ingredients ----------

export interface BackendIngredient {
  ingredient_id: string;
  name: string;
  category: string | null;
  default_storage_zone: string;
}

export async function fetchIngredients(): Promise<BackendIngredient[] | null> {
  return safeFetch<BackendIngredient[]>("/api/ingredients");
}

// ---------- Inventory actions ----------

export interface LotWriteOffRequest {
  reason: string;
  quantity_kg?: number;
}

export async function writeOffLot(
  lotId: string,
  req: LotWriteOffRequest,
): Promise<Lot | null> {
  const data = await safeFetch<BackendLot>(
    `/api/lots/${encodeURIComponent(lotId)}/write_off`,
    { method: "POST", body: JSON.stringify(req) },
  );
  return data ? adaptLot(data) : null;
}

export interface LotTransferRequest {
  destination_facility_id: string;
  quantity_kg?: number;
}

export async function transferLot(
  lotId: string,
  req: LotTransferRequest,
): Promise<Lot | null> {
  const data = await safeFetch<BackendLot>(
    `/api/lots/${encodeURIComponent(lotId)}/transfer`,
    { method: "POST", body: JSON.stringify(req) },
  );
  return data ? adaptLot(data) : null;
}

export interface LotSubstituteRequest {
  substitute_sku_id: string;
  quantity_kg: number;
}

export async function applySubstitution(
  lotId: string,
  req: LotSubstituteRequest,
): Promise<{ action_card_id: string } | null> {
  return safeFetch<{ action_card_id: string }>(
    `/api/lots/${encodeURIComponent(lotId)}/substitute`,
    { method: "POST", body: JSON.stringify(req) },
  );
}

// ---------- Lot CRUD ----------

export interface CreateLotRequest {
  facility_id: string;
  ingredient_id: string;
  supplier_id?: string;
  quantity_kg: number;
  received_date: string;
  expiry_date: string;
  storage_zone?: string;
  unit_cost?: number;
  lot_code?: string;
}

export async function createLot(req: CreateLotRequest): Promise<Lot | null> {
  const data = await safeFetch<BackendLot>("/api/lots", {
    method: "POST",
    body: JSON.stringify(req),
  });
  return data ? adaptLot(data) : null;
}

export async function deleteLot(lotId: string): Promise<boolean> {
  const data = await safeFetch<{ deleted: string }>(
    `/api/lots/${encodeURIComponent(lotId)}`,
    { method: "DELETE" },
  );
  return data !== null;
}

// ---------- Supplier CRUD ----------

export interface CreateSupplierRequest {
  supplier_id: string;
  name: string;
  contact_email?: string;
  payment_terms?: string;
  moq_kg?: number;
  lead_time_mean_days?: number;
  lead_time_std_days?: number;
  on_time_rate?: number;
  fill_rate?: number;
  window_compliance_rate?: number;
}

export interface UpdateSupplierRequest {
  name?: string;
  contact_email?: string;
  payment_terms?: string;
  moq_kg?: number;
  lead_time_mean_days?: number;
  on_time_rate?: number;
  fill_rate?: number;
  window_compliance_rate?: number;
}

export async function createSupplier(
  req: CreateSupplierRequest,
): Promise<Supplier | null> {
  const data = await safeFetch<BackendSupplier>("/api/suppliers", {
    method: "POST",
    body: JSON.stringify(req),
  });
  return data ? adaptSupplier(data) : null;
}

export async function updateSupplier(
  supplierId: string,
  req: UpdateSupplierRequest,
): Promise<Supplier | null> {
  const backendId = supplierId.replace(/^s-/, "sup_");
  const data = await safeFetch<BackendSupplier>(
    `/api/suppliers/${encodeURIComponent(backendId)}`,
    { method: "PATCH", body: JSON.stringify(req) },
  );
  return data ? adaptSupplier(data) : null;
}

export async function deleteSupplier(supplierId: string): Promise<boolean> {
  const backendId = supplierId.replace(/^s-/, "sup_");
  const data = await safeFetch<{ deleted: string }>(
    `/api/suppliers/${encodeURIComponent(backendId)}`,
    { method: "DELETE" },
  );
  return data !== null;
}

// ---------- Ingredient CRUD ----------

export interface CreateIngredientRequest {
  ingredient_id: string;
  name: string;
  category?: string;
  default_storage_zone?: string;
  shelf_life_days_default?: number;
  unit_of_measure?: string;
}

export interface UpdateIngredientRequest {
  name?: string;
  category?: string;
  default_storage_zone?: string;
  shelf_life_days_default?: number;
}

export async function createIngredient(
  req: CreateIngredientRequest,
): Promise<BackendIngredient | null> {
  return safeFetch<BackendIngredient>("/api/ingredients", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function updateIngredient(
  ingredientId: string,
  req: UpdateIngredientRequest,
): Promise<BackendIngredient | null> {
  return safeFetch<BackendIngredient>(
    `/api/ingredients/${encodeURIComponent(ingredientId)}`,
    { method: "PATCH", body: JSON.stringify(req) },
  );
}

export async function deleteIngredient(ingredientId: string): Promise<boolean> {
  const data = await safeFetch<{ deleted: string }>(
    `/api/ingredients/${encodeURIComponent(ingredientId)}`,
    { method: "DELETE" },
  );
  return data !== null;
}

// ---------- Supplier orders / PO ----------

export interface OrderDraftItem {
  ingredient_id: string;
  quantity_kg: number;
  unit_price: number;
}

export interface OrderDraftRequest {
  supplier_id: string;
  items: OrderDraftItem[];
  delivery_date: string;
  facility_id?: string;
}

export interface OrderDraftResponse {
  action_card_id: string;
  landed_cost_breakdown: {
    unit_price: number;
    quantity_kg: number;
    base_cost: number;
    overage_cost: number;
    holding_cost: number;
    total: number;
  };
}

export async function createOrderDraft(
  req: OrderDraftRequest,
): Promise<OrderDraftResponse | null> {
  return safeFetch<OrderDraftResponse>("/api/orders/draft", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ---------- Negotiations ----------

export interface BackendNegotiationDraft {
  draft_id: string;
  supplier_id: string;
  trigger_kind: string;
  body_md: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  action_card_id: string | null;
}

export async function fetchNegotiations(
  supplierId?: string,
  status?: string,
): Promise<BackendNegotiationDraft[] | null> {
  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  const all = await safeFetch<BackendNegotiationDraft[]>(
    `/api/negotiations?${qs.toString()}`,
  );
  if (!all) return null;
  if (supplierId) {
    const backendId = supplierId.replace(/^s-/, "sup_");
    return all.filter((d) => d.supplier_id === backendId);
  }
  return all;
}

export async function markNegotiationSent(
  draftId: string,
): Promise<BackendNegotiationDraft | null> {
  return safeFetch<BackendNegotiationDraft>(
    `/api/negotiations/${encodeURIComponent(draftId)}/mark_sent`,
    { method: "POST" },
  );
}

export async function discardNegotiationDraft(
  draftId: string,
): Promise<BackendNegotiationDraft | null> {
  return safeFetch<BackendNegotiationDraft>(
    `/api/negotiations/${encodeURIComponent(draftId)}/discard`,
    { method: "POST" },
  );
}

// ---------- Production module ----------

export interface BackendRecipeItem {
  ingredient_id: string;
  ingredient_name: string;
  kg_per_unit: number;
  total_kg: number;
}

export interface BackendProduct {
  sku_id: string;
  name: string;
  category: string | null;
  shelf_life_days: number;
  allergen_tags: string[];
  recipe: BackendRecipeItem[];
}

export interface BackendProductionOrder {
  order_id: string;
  facility_id: string;
  line_id: string;
  sku_id: string;
  sku_name: string;
  quantity_units: number;
  status: string;
  planned_start_at: string | null;
  actual_start_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackendProductionLine {
  line_id: string;
  facility_id: string;
  name: string;
  capacity_kg_per_hour: number;
  supported_allergen_tags: string[];
  status: string;
  current_order: BackendProductionOrder | null;
}

export interface BackendTransferPlanSource {
  from_facility_id: string;
  from_facility_name: string;
  transfer_kg: number;
}

export interface BackendTransferPlanItem {
  ingredient_id: string;
  ingredient_name: string;
  shortfall_kg: number;
  covered_kg: number;
  uncovered_kg: number;
  sources: BackendTransferPlanSource[];
}

export interface BackendTransferPlan {
  fully_covers: boolean;
  total_shortfall_kg: number;
  total_covered_kg: number;
  total_uncovered_kg: number;
  items: BackendTransferPlanItem[];
}

export interface BackendSubstituteSku {
  sku_id: string;
  sku_name: string;
  achievable_quantity: number;
  covers_requested_units: boolean;
  reason: string;
}

export interface BackendValidationResult {
  feasible: boolean;
  ingredients: {
    ingredient_id: string;
    name: string;
    needed_kg: number;
    available_kg: number;
    shortfall_kg: number;
    transfer_options?: {
      from_facility_id: string;
      from_facility_name: string;
      available_kg: number;
      transferable_kg: number;
    }[];
  }[];
  transfer_plan?: BackendTransferPlan | null;
  substitute_skus?: BackendSubstituteSku[];
}

export interface BackendProduceResult {
  order: BackendProductionOrder;
  line: BackendProductionLine;
  pallet_id: string;
  ingredients_consumed: { ingredient_id: string; name: string; consumed_kg: number }[];
}

export interface BackendFinishedPallet {
  pallet_id: string;
  sku_id: string;
  sku_name: string;
  facility_id: string;
  produced_at: string;
  shelf_life_days: number;
  days_remaining: number;
  quantity: number;
  status: string;
}

export async function fetchProductionLines(
  facilityId?: string,
): Promise<BackendProductionLine[] | null> {
  const qs = facilityId ? `?facility_id=${encodeURIComponent(facilityId)}` : "";
  return safeFetch<BackendProductionLine[]>(`/api/production/lines${qs}`, undefined, 6000);
}

export async function fetchProducts(): Promise<BackendProduct[] | null> {
  return safeFetch<BackendProduct[]>("/api/production/products", undefined, 6000);
}

export async function fetchProduct(skuId: string): Promise<BackendProduct | null> {
  return safeFetch<BackendProduct>(`/api/production/products/${encodeURIComponent(skuId)}`);
}

export async function fetchProductionOrders(params?: {
  facilityId?: string;
  lineId?: string;
  status?: string;
}): Promise<BackendProductionOrder[] | null> {
  const qs = new URLSearchParams();
  if (params?.facilityId) qs.set("facility_id", params.facilityId);
  if (params?.lineId) qs.set("line_id", params.lineId);
  if (params?.status) qs.set("status", params.status);
  const q = qs.toString() ? `?${qs.toString()}` : "";
  return safeFetch<BackendProductionOrder[]>(`/api/production/orders${q}`, undefined, 6000);
}

export interface CreateOrderRequest {
  facility_id: string;
  line_id: string;
  sku_id: string;
  quantity_units: number;
  planned_start_at?: string;
  notes?: string;
}

export async function createProductionOrder(
  req: CreateOrderRequest,
): Promise<BackendProductionOrder | null> {
  return safeFetch<BackendProductionOrder>("/api/production/orders", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function updateOrderStatus(
  orderId: string,
  status: string,
): Promise<BackendProductionOrder | null> {
  return safeFetch<BackendProductionOrder>(
    `/api/production/orders/${encodeURIComponent(orderId)}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
}

export async function cancelProductionOrder(
  orderId: string,
): Promise<BackendProductionOrder | null> {
  return safeFetch<BackendProductionOrder>(
    `/api/production/orders/${encodeURIComponent(orderId)}/cancel`,
    { method: "POST" },
  );
}

export async function validateProduction(params: {
  skuId: string;
  quantityUnits: number;
  facilityId: string;
}): Promise<BackendValidationResult | null> {
  const qs = new URLSearchParams({
    sku_id: params.skuId,
    quantity_units: String(params.quantityUnits),
    facility_id: params.facilityId,
  });
  return safeFetch<BackendValidationResult>(`/api/production/validate?${qs.toString()}`);
}

export async function markOrderProduced(
  orderId: string,
): Promise<BackendProduceResult | null> {
  return safeFetch<BackendProduceResult>(
    `/api/production/orders/${encodeURIComponent(orderId)}/produce`,
    { method: "POST" },
    10000,
  );
}

export async function requestShortfallTransfer(req: {
  facility_id: string;
  ingredient_id: string;
  from_facility_id: string;
  quantity_kg: number;
  requested_by_sku_id: string;
  requested_units: number;
}): Promise<{ action_card_id: string } | null> {
  return safeFetch<{ action_card_id: string }>(
    "/api/production/shortfalls/request_transfer",
    { method: "POST", body: JSON.stringify(req) },
  );
}

export async function requestShortfallTransferPlan(req: {
  facility_id: string;
  requested_by_sku_id: string;
  requested_units: number;
  items: { ingredient_id: string; from_facility_id: string; quantity_kg: number }[];
}): Promise<{ action_card_id: string } | null> {
  return safeFetch<{ action_card_id: string }>(
    "/api/production/shortfalls/request_transfer_plan",
    { method: "POST", body: JSON.stringify(req) },
  );
}

export async function requestShortfallSubstitution(req: {
  facility_id: string;
  substitute_sku_id: string;
  requested_by_sku_id: string;
  requested_units: number;
  blocked_ingredient_ids?: string[];
}): Promise<{ action_card_id: string } | null> {
  return safeFetch<{ action_card_id: string }>(
    "/api/production/shortfalls/request_substitution",
    { method: "POST", body: JSON.stringify(req) },
  );
}

export async function fetchFinishedGoods(
  facilityId?: string,
): Promise<BackendFinishedPallet[] | null> {
  const qs = facilityId ? `?facility_id=${encodeURIComponent(facilityId)}` : "";
  return safeFetch<BackendFinishedPallet[]>(`/api/production/finished${qs}`, undefined, 6000);
}

// ---------- SSE: chat + events ----------

export interface ChatStreamHandlers {
  onMessage: (chunk: string) => void;
  onStatus?: (text: string) => void;
  onSubstitutions?: (
    candidates: { sku_id: string; sku_name: string; achievable_quantity: number }[],
  ) => void;
  onActionCard?: (cardId: string) => void;
  onDone?: () => void;
  onError?: (err: unknown) => void;
}

/** Open a POST + SSE chat stream. Returns a cleanup function. */
export async function streamChat(
  message: string,
  history: { role: "user" | "assistant"; content: string }[],
  handlers: ChatStreamHandlers,
): Promise<() => void> {
  const ctrl = new AbortController();
  try {
    const body: Record<string, unknown> = { message, history };
    const res = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      handlers.onError?.(new Error(`chat http ${res.status}`));
      return () => ctrl.abort();
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let sseEvent = "message";
    let sseData = "";
    (async () => {
      try {
        outer: while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
          let newline: number;
          while ((newline = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, newline);
            buf = buf.slice(newline + 1);
            if (line === "") {
              if (sseData) {
                let payload: Record<string, unknown> = {};
                try { payload = JSON.parse(sseData); } catch { /* ignore */ }
                if (sseEvent === "message") {
                  handlers.onMessage(String(payload.content || ""));
                } else if (sseEvent === "status") {
                  handlers.onStatus?.(String(payload.text || ""));
                } else if (sseEvent === "substitutions") {
                  const cands = (payload.candidates as
                    | { sku_id: string; sku_name: string; achievable_quantity: number }[]
                    | undefined) ?? [];
                  handlers.onSubstitutions?.(cands);
                } else if (sseEvent === "action_card") {
                  handlers.onActionCard?.(String(payload.action_card_id || ""));
                } else if (sseEvent === "done") {
                  handlers.onDone?.();
                  break outer;
                }
              }
              sseEvent = "message";
              sseData = "";
            } else if (line.startsWith("event:")) {
              sseEvent = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              sseData = line.slice(5).trim();
            }
          }
        }
      } catch (err) {
        handlers.onError?.(err);
      }
    })();
  } catch (err) {
    handlers.onError?.(err);
  }
  return () => ctrl.abort();
}

export type LiveEventKind = "yield" | "risk" | "shelf_life" | "forecast";
export interface LiveEvent {
  kind: LiveEventKind | string;
  data: Record<string, unknown>;
}

/** Open the FlowSight events SSE. Returns a cleanup function. */
export function openEventStream(
  onEvent: (e: LiveEvent) => void,
  onError?: (err: unknown) => void,
): () => void {
  let es: EventSource | null = null;
  try {
    es = new EventSource(`${BACKEND_URL}/api/events`);
    const kinds: LiveEventKind[] = ["yield", "risk", "shelf_life", "forecast"];
    for (const k of kinds) {
      es.addEventListener(k, (ev: MessageEvent) => {
        try {
          onEvent({ kind: k, data: JSON.parse(ev.data) });
        } catch {
          /* ignore */
        }
      });
    }
    es.onerror = (err) => onError?.(err);
  } catch (err) {
    onError?.(err);
  }
  return () => es?.close();
}

// ---------- Supplier messages + agent negotiation ----------

export interface BackendSupplierMessage {
  message_id: string;
  supplier_id: string;
  direction: "inbound" | "outbound";
  channel: "email" | "phone" | "chat" | "agent" | "system";
  subject: string | null;
  body: string;
  author: string | null;
  related_order_id: string | null;
  related_negotiation_id: string | null;
  sent_at: string;
  read_at: string | null;
}

export async function fetchSupplierMessages(
  supplierId: string
): Promise<BackendSupplierMessage[] | null> {
  return safeFetch<BackendSupplierMessage[]>(
    `/api/suppliers/${encodeURIComponent(supplierId)}/messages`
  );
}

export async function sendSupplierMessage(
  supplierId: string,
  body: string,
  opts?: {
    subject?: string;
    channel?: BackendSupplierMessage["channel"];
    direction?: BackendSupplierMessage["direction"];
    author?: string;
    related_order_id?: string;
    related_negotiation_id?: string;
  }
): Promise<BackendSupplierMessage | null> {
  return safeFetch<BackendSupplierMessage>(
    `/api/suppliers/${encodeURIComponent(supplierId)}/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body,
        subject: opts?.subject,
        channel: opts?.channel ?? "email",
        direction: opts?.direction ?? "outbound",
        author: opts?.author,
        related_order_id: opts?.related_order_id,
        related_negotiation_id: opts?.related_negotiation_id,
      }),
    }
  );
}

export interface AgentNegotiationResponse {
  draft_id: string;
  supplier_id: string;
  trigger_kind: string;
  body_md: string;
  proposed_subject: string;
  message_id: string | null;
}

export async function agentNegotiateSupplier(
  supplierId: string,
  goal: string,
  opts?: { tone?: string; record_outbound?: boolean }
): Promise<AgentNegotiationResponse | null> {
  return safeFetch<AgentNegotiationResponse>(
    `/api/suppliers/${encodeURIComponent(supplierId)}/negotiate`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        goal,
        tone: opts?.tone ?? "firm-but-friendly",
        record_outbound: opts?.record_outbound ?? false,
      }),
    },
    90000,
  );
}

export interface NegotiationStreamHandlers {
  onTrigger?: (trigger_kind: string) => void;
  onChunk: (text: string) => void;
  onDone: (result: AgentNegotiationResponse & { body_md: string }) => void;
  onError?: (err: unknown) => void;
}

/** Open a POST + SSE stream for an agent-drafted negotiation. Returns a cleanup fn. */
export async function streamNegotiationDraft(
  supplierId: string,
  goal: string,
  opts: { tone?: string; record_outbound?: boolean },
  handlers: NegotiationStreamHandlers,
): Promise<() => void> {
  const ctrl = new AbortController();
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/suppliers/${encodeURIComponent(supplierId)}/negotiate/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          tone: opts.tone ?? "firm-but-friendly",
          record_outbound: opts.record_outbound ?? false,
        }),
        signal: ctrl.signal,
      },
    );
    if (!res.ok || !res.body) {
      handlers.onError?.(new Error(`negotiate stream http ${res.status}`));
      return () => ctrl.abort();
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let sseEvent = "message";
    let sseData = "";
    (async () => {
      try {
        outer: while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder
            .decode(value, { stream: true })
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");
          let newline: number;
          while ((newline = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, newline);
            buf = buf.slice(newline + 1);
            if (line === "") {
              if (sseData) {
                let payload: Record<string, unknown> = {};
                try {
                  payload = JSON.parse(sseData);
                } catch {
                  /* ignore */
                }
                if (sseEvent === "chunk") {
                  handlers.onChunk(String(payload.text || ""));
                } else if (sseEvent === "trigger") {
                  handlers.onTrigger?.(String(payload.trigger_kind || ""));
                } else if (sseEvent === "done") {
                  handlers.onDone({
                    draft_id: String(payload.draft_id || ""),
                    supplier_id: supplierId,
                    trigger_kind: String(payload.trigger_kind || ""),
                    body_md: String(payload.body_md || ""),
                    proposed_subject: String(payload.proposed_subject || ""),
                    message_id: (payload.message_id as string | null) ?? null,
                  });
                  break outer;
                } else if (sseEvent === "error") {
                  handlers.onError?.(new Error(String(payload.message || "stream error")));
                  break outer;
                }
              }
              sseEvent = "message";
              sseData = "";
            } else if (line.startsWith("event:")) {
              sseEvent = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              sseData = line.slice(5).trim();
            }
          }
        }
      } catch (err) {
        handlers.onError?.(err);
      }
    })();
  } catch (err) {
    handlers.onError?.(err);
  }
  return () => ctrl.abort();
}

export interface BackendSupplierOrderDetail {
  order_id: string;
  supplier_id: string;
  items: { ingredient_id: string; quantity_kg: number; unit_price: number }[];
  delivery_date: string;
  status: string;
  confirmed_at: string | null;
  action_card_id: string | null;
}

export async function receiveSupplierOrder(
  orderId: string
): Promise<BackendSupplierOrderDetail | null> {
  return safeFetch<BackendSupplierOrderDetail>(
    `/api/orders/${encodeURIComponent(orderId)}/receive`,
    { method: "POST" }
  );
}
