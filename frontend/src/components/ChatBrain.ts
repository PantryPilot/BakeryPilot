import { ActionCardData } from "./atoms";
import { TOOL_CHAINS } from "../lib/data";

export function pickAgent(q: string): string {
  const t = q.toLowerCase();
  if (t.includes("supplier") || t.includes("moq") || t.includes("po")) return "ProcurementAgent";
  if (t.includes("schedule") || t.includes("bake") || t.includes("line")) return "SchedulerAgent";
  if (t.includes("lot") || t.includes("inventory") || t.includes("expir")) return "InventoryAgent";
  if (t.includes("yield")) return "YieldAgent";
  return "OrchestratorAgent";
}

export function pickTools(q: string): string[] {
  const t = q.toLowerCase();
  if (t.includes("moq") || t.includes("over-order")) return TOOL_CHAINS.moq;
  if (t.includes("yield")) return TOOL_CHAINS.yield;
  return TOOL_CHAINS.shortage;
}

export function mockReply(q: string): string {
  const t = q.toLowerCase();
  if (t.includes("moq") || t.includes("over-order"))
    return "Northstar Mills MOQ-tax is $1,840 this quarter — 92% of orders triggered floor overage averaging 280 kg held 6.4 days at $0.41/kg/day. Threshold is $3,000. At current velocity you cross it in ~14 days.";
  if (t.includes("expir"))
    return "3 lots expire in the next 24 hours: LOT-21884 blueberries (Plant 1, 0.8 kg), LOT-22051 cream cheese (Plant 2, 220 kg), LOT-21971 almond meal (Plant 4, 88 kg). Combined book value $4,318. Two have viable substitution paths.";
  if (t.includes("bake"))
    return "With current on-hand, you can confidently bake: blueberry muffin (4,800 u, but blueberry lot expires tonight — recommend pulling forward), butter croissant 6pk (full capacity), chocolate chip cookie 24pk (full), lemon poppy muffin (full). Almond biscotti blocked — only 88 kg meal vs 142 kg needed.";
  if (t.includes("supplier risk") || t.includes("risk"))
    return "Two suppliers in risk band: Acadian Berries (red, cold-chain incident, 14 pallets delayed 36h) and Prairie Eggs (amber, avian flu advisory, −12% output 7d). Bridge POs drafted for both — ready for your review.";
  return "Pulling that for you. I can see across all four plants in real time — anything specific you want me to focus on?";
}

export function pickCard(q: string): ActionCardData | null {
  const t = q.toLowerCase();
  if (t.includes("substitut") || t.includes("blueberr") || t.includes("expir")) return SAMPLE_CARDS.substitute;
  if (t.includes("moq") || t.includes("draft")) return SAMPLE_CARDS.negotiation;
  if (t.includes("bridge")) return SAMPLE_CARDS.bridgePO;
  return null;
}

export const SAMPLE_CARDS: Record<string, ActionCardData> = {
  substitute: {
    kind: "Substitution",
    agent: "InventoryAgent",
    icon: "diff",
    title: "Substitute lemon poppy seed for tonight's blueberry muffin run · Line 1",
    summary: [
      { label: "Compat", value: "98%", tone: "green" },
      { label: "Waste avoided", value: "$1,240", tone: "green" },
      { label: "Capacity", value: "100%" },
    ],
    flags: [{ text: "LOT-21884 expires in 6h", tone: "red" }],
    details: [
      { label: "Original SKU", value: "SKU-BBM-12 (4,800 u)" },
      { label: "Replacement SKU", value: "SKU-LPM-12 (5,200 u)" },
      { label: "Substituted lot", value: "LOT-21910 lemon zest" },
      { label: "Yield Δ vs original", value: "+1.4 pp", tone: "green" },
      { label: "Allergen match", value: "OK (no nuts)", tone: "green" },
    ],
  },
  bridgePO: {
    kind: "Purchase Order",
    agent: "ProcurementAgent",
    icon: "truck",
    title: "Bridge PO — Northstar Mills · 4,200 kg wheat T55 · 36h delivery",
    summary: [
      { label: "Total landed", value: "$12,840" },
      { label: "MOQ overage", value: "+280 kg", tone: "amber" },
      { label: "Arrives", value: "Wed 14:00" },
    ],
    flags: [{ text: "MOQ overage holds $387 in inventory for 7 days", tone: "amber" }],
    details: [
      { label: "Unit price × qty", value: "$2.81 × 4,200 = $11,802" },
      { label: "Freight (refrigerated)", value: "$640" },
      { label: "Brokerage + duty", value: "$185" },
      { label: "MOQ holding cost", value: "280 kg × $0.41 × 7 d = $804", tone: "amber" },
      { label: "Total landed cost", value: "$12,840" },
    ],
  },
  negotiation: {
    kind: "Negotiation Draft",
    agent: "ProcurementAgent",
    icon: "send",
    title: "Draft: rebalance Northstar Mills MOQ floor 4,200 → 3,800 kg",
    summary: [
      { label: "MOQ tax YTD", value: "$1,840", tone: "amber" },
      { label: "Projected save", value: "$4,720/yr", tone: "green" },
      { label: "Tier", value: "1" },
    ],
    flags: [{ text: "Renewal window opens in 14 days", tone: "amber" }],
    details: [
      { label: "Subject", value: "Quarterly MOQ review — T55 flour" },
      { label: "Volume basis", value: "Trailing 6mo: 3,610 kg/order avg" },
      { label: "Counter-offer", value: "3,800 kg floor + 0.5% rebate" },
      { label: "Risk if rejected", value: "Status quo · $0 chg", tone: "amber" },
    ],
  },
  yieldWO: {
    kind: "Work Order",
    agent: "YieldAgent",
    icon: "wave",
    title: "CMMS WO — Dough divider, Line 2, Plant 1 · Priority HIGH",
    summary: [
      { label: "Yield loss", value: "−3.7 pp", tone: "red" },
      { label: "Lost/shift", value: "$2,341", tone: "red" },
      { label: "Last calib", value: "47 d" },
    ],
    flags: [{ text: "Within 24h or lose 2 more shifts", tone: "red" }],
    details: [
      { label: "Asset ID", value: "DD-P1-L2-001" },
      { label: "Diagnosis", value: "Divider mass drift +3.8 g/portion" },
      { label: "Action", value: "Calibrate + replace blade set" },
      { label: "Est. duration", value: "1.5 h" },
    ],
  },
  costcoSpike: {
    kind: "Schedule Change",
    agent: "SchedulerAgent",
    icon: "calendar",
    title: "Costco PO #C-882 spike (+35%) — partial fulfil + negotiate",
    summary: [
      { label: "Fulfil", value: "65%" },
      { label: "Capacity used", value: "94%" },
      { label: "Margin Δ", value: "+$3,180", tone: "green" },
    ],
    flags: [{ text: "Push Walmart SKU-CCC-24 by 4h", tone: "amber" }],
    details: [
      { label: "Original ask", value: "12,400 u" },
      { label: "Proposed fulfil", value: "8,060 u (65%)" },
      { label: "Negotiation needed", value: "Bal. 4,340 u next window" },
      { label: "Lines affected", value: "P1-L1, P1-L2, P2-L2" },
    ],
  },
};
