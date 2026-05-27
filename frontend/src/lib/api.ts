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
  };
}

function adaptLot(b: BackendLot): Lot {
  const expiry = new Date(b.expiry_date);
  const now = new Date();
  const daysLeft = Math.max(
    0,
    Math.round((expiry.getTime() - now.getTime()) / 86_400_000),
  );
  const risk = Math.min(1, b.spoilage_risk_score);
  const status: LotStatus =
    daysLeft <= 0
      ? "expired"
      : risk >= 1.0
      ? "critical"
      : risk >= 0.5
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

export async function fetchSchedules(): Promise<BackendSchedule[] | null> {
  return safeFetch<BackendSchedule[]>("/api/schedules");
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
  const summary = Object.entries(p)
    .filter(([k]) => !["title", "sub", "agent"].includes(k))
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
}

export async function fetchAdminTables(): Promise<AdminTableInfo[] | null> {
  return safeFetch<AdminTableInfo[]>("/api/admin/tables", undefined, 10000);
}

export async function fetchAdminTableRows(
  table: string,
  page = 1,
  perPage = 50,
  sort?: string,
  order?: "asc" | "desc",
): Promise<AdminTableRowsResponse | null> {
  const qs = new URLSearchParams();
  qs.set("page", String(page));
  qs.set("per_page", String(perPage));
  if (sort) qs.set("sort", sort);
  if (order) qs.set("order", order);
  return safeFetch<AdminTableRowsResponse>(
    `/api/admin/tables/${encodeURIComponent(table)}/rows?${qs.toString()}`,
    undefined,
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

// ---------- SSE: chat + events ----------

export interface ChatStreamHandlers {
  onMessage: (chunk: string) => void;
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
    const res = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history }),
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
