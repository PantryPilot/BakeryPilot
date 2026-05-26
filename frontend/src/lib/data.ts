export type FacilityId = "all" | "p1" | "p2" | "p3" | "p4";
export type SupplierStatus = "ok" | "warn" | "disrupt";
export type LotStatus = "ok" | "warn" | "critical" | "expired";
export type StorageType = "frozen" | "refrigerated" | "dry";
export type ShelfRisk = "green" | "amber" | "red";
export type FlowKind = "inbound" | "outbound" | "transfer";

export interface Facility {
  id: FacilityId;
  name: string;
  city: string;
  x?: number;
  y?: number;
  lines?: number;
}

export interface Supplier {
  id: string;
  name: string;
  tier: number;
  onTime: number;
  fill: number;
  window: number;
  priceVsBench: number;
  moqTaxQtd: number;
  contractExpiry: string;
  status: SupplierStatus;
}

export interface Retailer {
  id: string;
  name: string;
  poRatio: number;
  shelfRisk: ShelfRisk;
}

export interface Lot {
  id: string;
  ingredient: string;
  facility: string;
  qty: number;
  unit: string;
  expiry: string;
  daysLeft: number;
  storage: StorageType;
  risk: number;
  status: LotStatus;
}

export interface Sku {
  id: string;
  name: string;
}

export interface ProductionRun {
  id: string;
  plant: string;
  line: number;
  sku: string;
  qty: number;
  start: number;
  end: number;
  allergen: string;
  risk: string;
  lots: string[];
}

export interface Disruption {
  id: string;
  ts: string;
  severity: string;
  src: string;
  text: string;
}

export interface Kpis {
  wasteAvoided: number;
  co2eSaved: number;
  moqTaxYtd: number;
  disruptions: number;
  disruptionsCaught: number;
  caughtLeadHours: number;
}

export interface DemandForecast {
  skuId: string;
  date: string;
  expected: number;
  low: number;
  high: number;
}

// UI config — plant labels and map positions (not backend data)
export const FACILITIES: Facility[] = [
  { id: "all", name: "All Plants", city: "" },
  { id: "p1", name: "Plant 1", city: "Brampton, ON", x: 0.52, y: 0.55, lines: 6 },
  { id: "p2", name: "Plant 2", city: "Surrey, BC",   x: 0.10, y: 0.42, lines: 4 },
  { id: "p3", name: "Plant 3", city: "Calgary, AB",  x: 0.28, y: 0.45, lines: 5 },
  { id: "p4", name: "Plant 4", city: "Laval, QC",    x: 0.68, y: 0.50, lines: 5 },
];

// UI config — SKU display names for Gantt label lookup
export const SKUS: Sku[] = [
  { id: "SKU-BBM-12", name: "Blueberry Muffin 12pk" },
  { id: "SKU-CRO-06", name: "Butter Croissant 6pk" },
  { id: "SKU-CCC-24", name: "Chocolate Chip Cookie 24pk" },
  { id: "SKU-LPM-12", name: "Lemon Poppy Muffin 12pk" },
  { id: "SKU-CRB-08", name: "Cinnamon Raisin Bagel 8pk" },
  { id: "SKU-ALB-08", name: "Almond Biscotti 8pk" },
];

// UI config — chat prompt suggestions
export const SUGGESTED_PROMPTS = [
  "What can we bake?",
  "Which lots expire today?",
  "Show supplier risk",
  "Optimise tomorrow's schedule",
];

// UI config — tool chain labels displayed under agent messages
export const TOOL_CHAINS: Record<string, string[]> = {
  shortage: ["query_lots", "substitution_engine", "compute_landed_cost", "optimize_delivery_window"],
  moq:      ["query_orders", "compute_moq_tax", "draft_negotiation"],
  yield:    ["read_telemetry", "diagnose_anomaly", "draft_cmms_work_order"],
};
