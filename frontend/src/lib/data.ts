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
  contactEmail?: string;
  contactName?: string;
  phone?: string;
  website?: string;
  address?: string;
  notes?: string;
  paymentTerms?: string;
  moqKg?: number;
  leadTimeMean?: number;
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
  { id: "all", name: "All Plants",  city: "" },
  { id: "p1", name: "Toronto",      city: "Toronto, ON",     x: 0.55, y: 0.52, lines: 3 },
  { id: "p2", name: "Mississauga",  city: "Mississauga, ON", x: 0.52, y: 0.55, lines: 2 },
  { id: "p3", name: "Hamilton",     city: "Hamilton, ON",    x: 0.50, y: 0.57, lines: 2 },
  { id: "p4", name: "Montreal",     city: "Montreal, QC",    x: 0.68, y: 0.50, lines: 2 },
];

// UI config — SKU display names for Gantt label lookup (IDs match backend DB)
export const SKUS: Sku[] = [
  { id: "sku-wonder-classic-white-loaf",      name: "Wonder Classic White Loaf" },
  { id: "sku-stonefire-mini-naan-8pk",         name: "Stonefire Mini Naan 8pk" },
  { id: "sku-stonefire-pizza-crust-2pk",       name: "Stonefire Pizza Crust 2pk" },
  { id: "sku-stonefire-original-naan-2pk",     name: "Stonefire Original Naan 2pk" },
  { id: "sku-stonefire-naan-dippers-original", name: "Stonefire Naan Dippers" },
  { id: "sku-d-italiano-hot-dog-buns-8pk",     name: "D'Italiano Hot Dog Buns 8pk" },
  { id: "sku-country-harvest-12-grain-loaf",   name: "Country Harvest 12-Grain" },
  { id: "sku-ace-rosemary-focaccia",           name: "ACE Rosemary Focaccia" },
  { id: "sku-ace-rustic-italian-oval",         name: "ACE Rustic Italian Oval" },
  { id: "sku-ace-sourdough-bistro",            name: "ACE Sourdough Bistro" },
  { id: "sku-ace-baguette-classic",            name: "ACE Baguette Classic" },
  { id: "sku-ace-ciabatta-piccolo-6pk",        name: "ACE Ciabatta Piccolo 6pk" },
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
