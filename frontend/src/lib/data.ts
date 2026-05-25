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

export const FACILITIES: Facility[] = [
  { id: "all", name: "All Plants", city: "" },
  { id: "p1", name: "Plant 1", city: "Brampton, ON", x: 0.52, y: 0.55, lines: 6 },
  { id: "p2", name: "Plant 2", city: "Surrey, BC", x: 0.10, y: 0.42, lines: 4 },
  { id: "p3", name: "Plant 3", city: "Calgary, AB", x: 0.28, y: 0.45, lines: 5 },
  { id: "p4", name: "Plant 4", city: "Laval, QC", x: 0.68, y: 0.50, lines: 5 },
];

export const SUPPLIERS: Supplier[] = [
  { id: "s-a", name: "Northstar Mills",   tier: 1, onTime: 0.97, fill: 0.99, window: 0.94, priceVsBench: -0.02, moqTaxQtd: 1840, contractExpiry: "2026-08-12", status: "ok" },
  { id: "s-b", name: "Heartland Dairy",   tier: 1, onTime: 0.93, fill: 0.96, window: 0.88, priceVsBench: 0.01,  moqTaxQtd: 420,  contractExpiry: "2026-07-01", status: "warn" },
  { id: "s-c", name: "Acadian Berries",   tier: 2, onTime: 0.78, fill: 0.84, window: 0.71, priceVsBench: 0.06,  moqTaxQtd: 0,    contractExpiry: "2026-06-10", status: "disrupt" },
  { id: "s-d", name: "Maple Sugar Co.",   tier: 1, onTime: 0.96, fill: 0.98, window: 0.92, priceVsBench: -0.01, moqTaxQtd: 0,    contractExpiry: "2027-01-22", status: "ok" },
  { id: "s-e", name: "Prairie Eggs Ltd.", tier: 2, onTime: 0.89, fill: 0.93, window: 0.86, priceVsBench: 0.03,  moqTaxQtd: 3210, contractExpiry: "2026-08-29", status: "warn" },
];

export const RETAILERS: Retailer[] = [
  { id: "r-cc", name: "Costco",      poRatio: 1.34, shelfRisk: "amber" },
  { id: "r-wm", name: "Walmart",     poRatio: 0.98, shelfRisk: "green" },
  { id: "r-lb", name: "Loblaws",     poRatio: 1.02, shelfRisk: "green" },
  { id: "r-wf", name: "Whole Foods", poRatio: 0.86, shelfRisk: "amber" },
  { id: "r-sb", name: "Sobeys",      poRatio: 1.05, shelfRisk: "green" },
];

export const LOTS: Lot[] = [
  { id: "LOT-21884", ingredient: "Blueberries (frozen IQF)", facility: "p1", qty: 0.8,  unit: "kg", expiry: "2026-05-26", daysLeft: 1,   storage: "frozen",       risk: 0.94, status: "critical" },
  { id: "LOT-21902", ingredient: "Buttermilk powder",        facility: "p1", qty: 142,  unit: "kg", expiry: "2026-06-04", daysLeft: 10,  storage: "dry",          risk: 0.22, status: "ok" },
  { id: "LOT-21910", ingredient: "Lemon zest paste",         facility: "p1", qty: 38,   unit: "kg", expiry: "2026-05-28", daysLeft: 3,   storage: "refrigerated", risk: 0.61, status: "warn" },
  { id: "LOT-21925", ingredient: "Whole eggs (liquid)",      facility: "p2", qty: 540,  unit: "kg", expiry: "2026-05-30", daysLeft: 5,   storage: "refrigerated", risk: 0.41, status: "warn" },
  { id: "LOT-21940", ingredient: "Wheat flour (T55)",        facility: "p3", qty: 9800, unit: "kg", expiry: "2026-09-15", daysLeft: 113, storage: "dry",          risk: 0.05, status: "ok" },
  { id: "LOT-21952", ingredient: "Cane sugar",               facility: "p3", qty: 4200, unit: "kg", expiry: "2027-01-12", daysLeft: 232, storage: "dry",          risk: 0.03, status: "ok" },
  { id: "LOT-21963", ingredient: "Chocolate chips (dark)",   facility: "p4", qty: 220,  unit: "kg", expiry: "2026-08-22", daysLeft: 89,  storage: "dry",          risk: 0.08, status: "ok" },
  { id: "LOT-21971", ingredient: "Almond meal",              facility: "p4", qty: 88,   unit: "kg", expiry: "2026-05-27", daysLeft: 2,   storage: "dry",          risk: 0.82, status: "critical" },
  { id: "LOT-21982", ingredient: "Cinnamon (ground)",        facility: "p2", qty: 64,   unit: "kg", expiry: "2026-11-09", daysLeft: 168, storage: "dry",          risk: 0.04, status: "ok" },
  { id: "LOT-21999", ingredient: "Butter (unsalted, AA)",    facility: "p1", qty: 410,  unit: "kg", expiry: "2026-06-02", daysLeft: 8,   storage: "refrigerated", risk: 0.31, status: "ok" },
  { id: "LOT-22010", ingredient: "Yeast (active dry)",       facility: "p1", qty: 32,   unit: "kg", expiry: "2026-07-18", daysLeft: 54,  storage: "dry",          risk: 0.10, status: "ok" },
  { id: "LOT-22025", ingredient: "Vanilla extract",          facility: "p4", qty: 18,   unit: "kg", expiry: "2027-02-01", daysLeft: 252, storage: "dry",          risk: 0.02, status: "ok" },
  { id: "LOT-22040", ingredient: "Raspberries (frozen)",     facility: "p3", qty: 96,   unit: "kg", expiry: "2026-05-29", daysLeft: 4,   storage: "frozen",       risk: 0.55, status: "warn" },
  { id: "LOT-22051", ingredient: "Cream cheese",             facility: "p2", qty: 220,  unit: "kg", expiry: "2026-05-26", daysLeft: 1,   storage: "refrigerated", risk: 0.91, status: "critical" },
  { id: "LOT-22062", ingredient: "Sea salt (fine)",          facility: "p1", qty: 540,  unit: "kg", expiry: "2028-03-01", daysLeft: 645, storage: "dry",          risk: 0.01, status: "ok" },
];

export const SKUS: Sku[] = [
  { id: "SKU-BBM-12", name: "Blueberry Muffin 12pk" },
  { id: "SKU-CRO-06", name: "Butter Croissant 6pk" },
  { id: "SKU-CCC-24", name: "Chocolate Chip Cookie 24pk" },
  { id: "SKU-LPM-12", name: "Lemon Poppy Muffin 12pk" },
  { id: "SKU-CRB-08", name: "Cinnamon Raisin Bagel 8pk" },
  { id: "SKU-ALB-08", name: "Almond Biscotti 8pk" },
];

export const PRODUCTION_RUNS: ProductionRun[] = [
  { id: "R-9412", plant: "p1", line: 1, sku: "SKU-BBM-12", qty: 4800, start: 6,  end: 10, allergen: "none", risk: "amber", lots: ["LOT-21884", "LOT-21902"] },
  { id: "R-9413", plant: "p1", line: 1, sku: "SKU-LPM-12", qty: 5200, start: 11, end: 14, allergen: "none", risk: "none",  lots: ["LOT-21910", "LOT-21902"] },
  { id: "R-9414", plant: "p1", line: 2, sku: "SKU-CRO-06", qty: 3200, start: 6,  end: 12, allergen: "milk", risk: "none",  lots: ["LOT-21999"] },
  { id: "R-9415", plant: "p1", line: 2, sku: "SKU-CCC-24", qty: 7400, start: 13, end: 18, allergen: "milk", risk: "none",  lots: ["LOT-21963", "LOT-21999"] },
  { id: "R-9416", plant: "p1", line: 3, sku: "SKU-CRB-08", qty: 6200, start: 8,  end: 13, allergen: "none", risk: "none",  lots: ["LOT-21982"] },
  { id: "R-9420", plant: "p2", line: 1, sku: "SKU-CRO-06", qty: 4100, start: 7,  end: 12, allergen: "milk", risk: "none",  lots: ["LOT-21925"] },
  { id: "R-9421", plant: "p2", line: 2, sku: "SKU-CCC-24", qty: 5300, start: 9,  end: 15, allergen: "milk", risk: "amber", lots: ["LOT-22051"] },
  { id: "R-9430", plant: "p4", line: 1, sku: "SKU-ALB-08", qty: 2200, start: 6,  end: 11, allergen: "nuts", risk: "red",   lots: ["LOT-21971", "LOT-22025"] },
  { id: "R-9431", plant: "p4", line: 2, sku: "SKU-CCC-24", qty: 4800, start: 12, end: 17, allergen: "milk", risk: "none",  lots: ["LOT-21963"] },
];

export const DISRUPTIONS: Disruption[] = [
  { id: "d1", ts: "2026-05-25 06:42", severity: "red",   src: "Acadian Berries",   text: "Cold-chain incident at QC depot — 14 pallets blueberries delayed 36h." },
  { id: "d2", ts: "2026-05-25 04:11", severity: "amber", src: "Prairie Eggs Ltd.", text: "Avian flu advisory — Manitoba region. Output likely −12% next 7d." },
  { id: "d3", ts: "2026-05-24 21:58", severity: "amber", src: "Heartland Dairy",   text: "Truck #284 reroute, ETA Plant 1 slips from 03:00 → 08:30." },
  { id: "d4", ts: "2026-05-24 19:02", severity: "info",  src: "FlowSight",         text: "Costco PO #C-882 received +35% vs forecast for SKU-BBM-12." },
];

export const SUGGESTED_PROMPTS = [
  "What can we bake?",
  "Which lots expire today?",
  "Show supplier risk",
  "Optimise tomorrow's schedule",
];

export const KPIS: Kpis = {
  wasteAvoided: 21340,
  co2eSaved: 1.9,
  moqTaxYtd: 1840,
  disruptions: 2,
  disruptionsCaught: 47,
  caughtLeadHours: 18.4,
};

export const TOOL_CHAINS: Record<string, string[]> = {
  shortage: ["query_lots", "substitution_engine", "compute_landed_cost", "optimize_delivery_window"],
  moq:      ["query_orders", "compute_moq_tax", "draft_negotiation"],
  yield:    ["read_telemetry", "diagnose_anomaly", "draft_cmms_work_order"],
};
