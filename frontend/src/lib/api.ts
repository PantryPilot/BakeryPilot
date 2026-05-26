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
  lot_id: string;
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
