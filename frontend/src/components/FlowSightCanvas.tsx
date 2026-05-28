"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Icon } from "./Icon";
import { Dot, Pill, YieldCounter } from "./atoms";
import type { Supplier, Disruption } from "../lib/data";
import { FACILITIES } from "../lib/data";
import type {
  BackendYieldTelemetryPoint,
  BackendFacility,
  BackendFacilityUtilization,
  BackendOrder,
} from "../lib/api";
import { fetchFacilityUtilization, isActiveSupplierOrder, isActiveOutboundShipment } from "../lib/api";
import {
  useSuppliers,
  useDisruptions,
  useNewsDisruptionFeed,
  useRetailers,
  useFacilities,
  useFacilityUtilization,
  useActiveRuns,
  useYieldTelemetry,
  useEsgCounter,
  useAllSupplierOrders,
  useOutboundShipments,
} from "../lib/hooks";
import { useApp } from "../lib/context";

const SHORT_CODE_TO_FACILITY_ID: Record<string, string> = {
  p1: "plant-toronto",
  p2: "plant-mississauga",
  p3: "plant-hamilton",
  p4: "plant-montreal",
};

const CANVAS_W = 1280, CANVAS_H = 720;
const SUPPLIER_X = 200;
const PLANT_CX = 640;
const RETAILER_X = 1100;
const COL_DIVIDER_L = 320;
const COL_DIVIDER_R = 860;
const COL_LABEL_Y = 92;
const PLANT_RADIUS = 44;
const PLANT_ROW_GAP = 112;
const SUPPLIER_ROW_START = 130;
const SUPPLIER_ROW_GAP = 100;

type PlantData = {
  id: string;
  facilityId: string;
  name: string;
  city: string;
  x: number;
  y: number;
  status: string;
  util: { frozen: number; ref: number; dry: number };
};

type InboundFlow = {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  orderId: string;
  supplierName: string;
  plantName: string;
  deliveryDate: string;
  status: string;
  items: BackendOrder["items"];
  totalKg: number;
  cargo: string;
};

type OutboundFlow = {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  shipmentId: string;
  plantName: string;
  retailerName: string;
  skuName: string;
  quantityUnits: number;
  deliveryDate: string;
  status: string;
};

function formatIngredientLabel(id: string): string {
  return id.replace(/^ing_/, "").replace(/_/g, " ");
}

function OrderStatusBadge({ status }: { status: string }) {
  const pending = status === "draft" || status === "pending_confirm";
  const confirmed = status === "confirmed";
  const bg = pending ? "rgb(245 158 11 / 0.14)" : confirmed ? "rgb(59 130 246 / 0.14)" : "var(--bp-surface-muted)";
  const color = pending ? "#b45309" : confirmed ? "#2563eb" : "var(--bp-text-muted)";
  const border = pending ? "rgb(245 158 11 / 0.35)" : confirmed ? "rgb(59 130 246 / 0.35)" : "var(--bp-border-soft)";
  return (
    <span
      className="shrink-0 inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize"
      style={{ background: bg, color, border: `1px solid ${border}` }}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function FlowOrderTooltip({ flow, x, y }: { flow: InboundFlow; x: number; y: number }) {
  const pad = 14;
  const maxW = 308;
  const maxH = 240;
  const left = typeof window !== "undefined"
    ? Math.min(Math.max(x + pad, 8), window.innerWidth - maxW - 8)
    : x + pad;
  const top = typeof window !== "undefined"
    ? Math.min(Math.max(y + pad, 8), window.innerHeight - maxH - 8)
    : y + pad;
  const lineTotal = flow.items.reduce((s, it) => s + it.quantity_kg * it.unit_price, 0);
  const pending = flow.status === "draft" || flow.status === "pending_confirm";
  const accentRgb = pending ? "245 158 11" : "59 130 246";

  return (
    <div
      className="fixed z-50 pointer-events-none w-[300px] rounded-xl overflow-hidden"
      style={{
        left,
        top,
        background: "var(--bp-surface-strong)",
        border: "1px solid var(--bp-border)",
        boxShadow: "0 18px 44px rgb(var(--bp-bg-rgb) / 0.2), 0 0 0 1px var(--bp-border-soft)",
      }}
      role="tooltip"
    >
      <div
        className="h-1"
        style={{ background: `linear-gradient(90deg, rgb(${accentRgb} / 0.95), rgb(${accentRgb} / 0.15))` }}
      />
      <div className="px-4 pt-3.5 pb-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--bp-text-subtle)] mb-1">
            Supplier order
          </p>
          <p className="text-[15px] font-semibold text-[var(--bp-text-primary)] leading-snug truncate">
            {flow.supplierName}
          </p>
          <p className="text-[12px] text-[var(--bp-text-muted)] mt-1 truncate">
            Delivering to{" "}
            <span className="font-medium text-[var(--bp-text-secondary)]">{flow.plantName}</span>
          </p>
        </div>
        <OrderStatusBadge status={flow.status} />
      </div>

      <div
        className="mx-3 mb-3 rounded-lg px-3 py-2.5 space-y-2"
        style={{
          background: "var(--bp-surface-muted)",
          border: "1px solid var(--bp-border-soft)",
        }}
      >
        {flow.items.map(it => (
          <div key={it.ingredient_id} className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-[var(--bp-text-secondary)] capitalize truncate">
              {formatIngredientLabel(it.ingredient_id)}
            </span>
            <span className="text-[12px] font-mono tabular-nums font-medium text-[var(--bp-text-primary)] shrink-0">
              {it.quantity_kg.toLocaleString()} kg
            </span>
          </div>
        ))}
      </div>

      <div
        className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2.5"
        style={{
          borderTop: "1px solid var(--bp-border-soft)",
          background: "var(--bp-surface-soft)",
        }}
      >
        {([
          ["Total quantity", `${flow.totalKg.toLocaleString()} kg`],
          ["Line value", `$${lineTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`],
          ["Delivery date", flow.deliveryDate || "—"],
          ["PO reference", flow.orderId.slice(0, 8).toUpperCase()],
        ] as const).map(([label, value]) => (
          <div key={label}>
            <div className="text-[10px] uppercase tracking-wide text-[var(--bp-text-subtle)]">{label}</div>
            <div
              className="text-[12px] font-mono tabular-nums text-[var(--bp-text-primary)] mt-0.5 truncate"
              title={label === "PO reference" ? flow.orderId : undefined}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutboundFlowTooltip({ flow, x, y }: { flow: OutboundFlow; x: number; y: number }) {
  const pad = 14;
  const maxW = 300;
  const left = typeof window !== "undefined"
    ? Math.min(Math.max(x + pad, 8), window.innerWidth - maxW - 8)
    : x + pad;
  const top = typeof window !== "undefined"
    ? Math.min(Math.max(y + pad, 8), window.innerHeight - 200 - 8)
    : y + pad;
  const inTransit = flow.status === "in_transit";

  return (
    <div
      className="fixed z-50 pointer-events-none w-[288px] rounded-xl overflow-hidden"
      style={{
        left,
        top,
        background: "var(--bp-surface-strong)",
        border: "1px solid var(--bp-border)",
        boxShadow: "0 18px 44px rgb(var(--bp-bg-rgb) / 0.2), 0 0 0 1px var(--bp-border-soft)",
      }}
      role="tooltip"
    >
      <div
        className="h-1"
        style={{ background: "linear-gradient(90deg, rgb(249 115 22 / 0.95), rgb(249 115 22 / 0.15))" }}
      />
      <div className="px-4 pt-3.5 pb-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--bp-text-subtle)] mb-1">
            Outbound shipment
          </p>
          <p className="text-[15px] font-semibold text-[var(--bp-text-primary)] leading-snug truncate">
            {flow.plantName}
          </p>
          <p className="text-[12px] text-[var(--bp-text-muted)] mt-1 truncate">
            Warehouse →{" "}
            <span className="font-medium text-[var(--bp-text-secondary)]">{flow.retailerName}</span>
          </p>
        </div>
        <OrderStatusBadge status={flow.status} />
      </div>
      <div
        className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2.5"
        style={{
          borderTop: "1px solid var(--bp-border-soft)",
          background: "var(--bp-surface-soft)",
        }}
      >
        {([
          ["Product", flow.skuName],
          ["Quantity", `${flow.quantityUnits.toLocaleString()} units`],
          ["Delivery date", flow.deliveryDate || "—"],
          ["Shipment", flow.shipmentId.slice(0, 8).toUpperCase()],
        ] as const).map(([label, value]) => (
          <div key={label}>
            <div className="text-[10px] uppercase tracking-wide text-[var(--bp-text-subtle)]">{label}</div>
            <div
              className="text-[12px] font-mono tabular-nums text-[var(--bp-text-primary)] mt-0.5 truncate"
              title={label === "Shipment" ? flow.shipmentId : undefined}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
      {inTransit && (
        <div className="px-4 pb-3 text-[11px] text-orange-300/90">In transit to retailer dock</div>
      )}
    </div>
  );
}

// Retailer lane positions align with plant rows when facilities are loaded.
const RETAILER_LANES_Y = [260, 340, 420, 500];

type RetailerPos = {
  id: string;
  name: string;
  poRatio: number;
  shelfRisk: "green" | "amber" | "red";
  x: number;
  y: number;
};

function formatOrderCargo(order: BackendOrder): string {
  const totalKg = order.items.reduce((s, it) => s + it.quantity_kg, 0);
  const first = order.items[0]?.ingredient_id.replace(/_/g, " ") ?? "order";
  const extra = order.items.length > 1 ? ` +${order.items.length - 1}` : "";
  return `${first}${extra} · ${totalKg.toLocaleString()} kg`;
}

function plantStatusFromUtil(overallPct: number | undefined): string {
  if (overallPct === undefined) return "ok";
  if (overallPct >= 0.95) return "critical";
  if (overallPct >= 0.85) return "warn";
  return "ok";
}

function buildPlantPositions(
  facilities: BackendFacility[],
  utilByFacility: Map<string, BackendFacilityUtilization>,
): PlantData[] {
  const sorted = [...facilities].sort((a, b) => a.facility_id.localeCompare(b.facility_id));
  const count = sorted.length;
  const startY = count <= 1 ? CANVAS_H / 2 : (CANVAS_H - (count - 1) * PLANT_ROW_GAP) / 2;
  return sorted.map((f, i) => {
    const util = utilByFacility.get(f.facility_id);
    const zoneMap = new Map(util?.zones.map(z => [z.zone, z]) ?? []);
    const frozen = zoneMap.get("frozen")?.pct ?? 0.5;
    const ref = zoneMap.get("refrigerated")?.pct ?? 0.5;
    const dry = zoneMap.get("dry")?.pct ?? 0.5;
    const city = [f.city, f.province].filter(Boolean).join(", ");
    return {
      id: f.short_code,
      facilityId: f.facility_id,
      name: f.name.replace(/^FGF\s+/i, "").split(" · ")[0] || f.name,
      city: city || f.name,
      x: PLANT_CX,
      y: startY + i * PLANT_ROW_GAP,
      status: plantStatusFromUtil(util?.overall_pct),
      util: { frozen, ref, dry },
    };
  });
}

const LAYERS_DEF = [
  { id: "risk",     name: "Risk",        count: 0,  defaultOn: true,  desc: "Disruption signals + supplier halos" },
  { id: "yield",    name: "Yield",       count: 0,  defaultOn: false, desc: "Line variance glow on plants" },
  { id: "shelf",    name: "Shelf-life",  count: 0,  defaultOn: false, desc: "Expiry heat overlay" },
  { id: "forecast", name: "Forecast",    count: 0,  defaultOn: false, desc: "Demand bands retailer→plant" },
  { id: "procure",  name: "Procurement", count: 0,  defaultOn: true,  desc: "Open supplier PO arcs (not yet received)" },
  { id: "esg",      name: "ESG",         count: 0,  defaultOn: false, desc: "Waste-avoided per plant" },
  { id: "schedule", name: "Schedule",    count: 0,  defaultOn: true,  desc: "Outbound warehouse→retailer shipments + line runs in plants" },
  { id: "network",  name: "Network",     count: 0,  defaultOn: false, desc: "Cross-plant transfer arcs" },
];

function arcPath(from: { x: number; y: number }, to: { x: number; y: number }, bend = 0.18) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
  const px = -dy * bend, py = dx * bend;
  return `M ${from.x} ${from.y} Q ${mx + px} ${my + py} ${to.x} ${to.y}`;
}

function TruckSprite({ pathD, color, dur = 14 }: { pathD: string; color: string; dur?: number }) {
  return (
    <g pointerEvents="none">
      <g>
        <rect width="14" height="9" x="-7" y="-4.5" rx="1.5" fill={color} stroke="#f8fafc" strokeWidth="0.75"/>
        <rect width="4" height="5" x="-7" y="-2.5" rx="0.5" fill="#1e293b"/>
        <circle cx="4.5" cy="3.5" r="1.1" fill="#1e293b"/>
        <circle cx="-2.5" cy="3.5" r="1.1" fill="#1e293b"/>
        <animateMotion dur={`${dur}s`} repeatCount="indefinite" rotate="auto" path={pathD}/>
      </g>
    </g>
  );
}

function haloColor(s: Supplier) {
  return s.status === "disrupt" ? "#ef4444" : s.onTime >= 0.95 ? "#22c55e" : s.onTime >= 0.85 ? "#f59e0b" : "#ef4444";
}

function SupplierNode({ s, riskOn, onClick }: { s: Supplier & { x: number; y: number }; riskOn: boolean; onClick: () => void }) {
  const moqOver = s.moqTaxQtd > 3000;
  const moqAny  = s.moqTaxQtd > 0;
  const color = riskOn ? haloColor(s) : "#475569";
  const disrupt = s.status === "disrupt";
  const dur = disrupt ? 1.2 : 3;
  const initials = s.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2);
  return (
    <g transform={`translate(${s.x}, ${s.y})`} style={{ cursor: "pointer" }} onClick={onClick}>
      {riskOn && (
        <>
          <circle r="26" stroke={color} strokeOpacity="0.18" strokeWidth="1" fill="none">
            <animate attributeName="r" values="22;30;22" dur={`${dur}s`} repeatCount="indefinite"/>
            <animate attributeName="stroke-opacity" values="0.4;0;0.4" dur={`${dur}s`} repeatCount="indefinite"/>
          </circle>
          <circle r="22" stroke={color} strokeOpacity="0.45" strokeWidth="1.5" fill="none" strokeDasharray="60 12">
            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur={`${dur * 2}s`} repeatCount="indefinite"/>
          </circle>
        </>
      )}
      <circle r="16" fill="#0c111c" stroke={color} strokeWidth="1.5"/>
      <text textAnchor="middle" dy="3" fontSize="9" fontWeight="600" fill="#cbd5e1" fontFamily="ui-monospace, monospace">{initials}</text>
      <text textAnchor="end" x="-26" y="-2" fontSize="11" fill="#e2e8f0">{s.name}</text>
      <text textAnchor="end" x="-26" y="11" fontSize="9" fill="#64748b" fontFamily="ui-monospace, monospace">
        OT {(s.onTime * 100).toFixed(0)}% · Tier {s.tier}
      </text>
      {disrupt && (
        <g transform="translate(-26, -22)">
          <rect x="-78" y="-7" width="78" height="14" rx="7" fill="#7f1d1d" stroke="#ef4444"/>
          <text x="-39" y="3" textAnchor="middle" fontSize="9" fill="#fecaca" fontFamily="ui-monospace, monospace">At risk · 36h</text>
        </g>
      )}
      {moqAny && (
        <g transform="translate(0, 24)">
          <rect x="-30" y="0" width="60" height="14" rx="7" fill={moqOver ? "#450a0a" : "#451a03"} stroke={moqOver ? "#ef4444" : "#f59e0b"} strokeWidth="1">
            {moqOver && <animate attributeName="opacity" values="1;0.55;1" dur="1.3s" repeatCount="indefinite"/>}
          </rect>
          <text x="0" y="10" textAnchor="middle" fontSize="9" fill={moqOver ? "#fecaca" : "#fde68a"} fontFamily="ui-monospace, monospace">${s.moqTaxQtd.toLocaleString()}</text>
        </g>
      )}
    </g>
  );
}

function PlantNode({ p, onClick, scheduleOn, esgOn, yieldOn, shelfOn }: {
  p: PlantData; onClick: () => void; scheduleOn: boolean; esgOn: boolean; yieldOn: boolean; shelfOn: boolean;
}) {
  const r = PLANT_RADIUS;
  const border = p.status === "warn" ? "#f59e0b" : p.status === "critical" ? "#ef4444" : "#22c55e";
  const segs = [
    { val: p.util.frozen, color: "#3b82f6" },
    { val: p.util.ref,    color: "#14b8a6" },
    { val: p.util.dry,    color: "#94a3b8" },
  ];
  const segLen = (2 * Math.PI * r) / 3;
  const esgValue = p.id === "p1" ? "5,840" : p.id === "p3" ? "7,210" : p.id === "p4" ? "4,800" : "3,490";
  return (
    <g transform={`translate(${p.x}, ${p.y})`} style={{ cursor: "pointer" }} onClick={onClick}>
      {p.status !== "ok" && (
        <circle r={r + 18} fill={border} fillOpacity="0.08">
          <animate attributeName="r" values={`${r + 14};${r + 24};${r + 14}`} dur="1.4s" repeatCount="indefinite"/>
          <animate attributeName="fill-opacity" values="0.15;0.04;0.15" dur="1.4s" repeatCount="indefinite"/>
        </circle>
      )}
      {yieldOn && p.id === "p1" && <circle r={r + 10} fill="#ef4444" fillOpacity="0.25"/>}
      {shelfOn && (p.id === "p3" || p.id === "p1") && (
        <circle r={r + 22} fill="url(#shelfHeat)" opacity={p.id === "p3" ? 0.9 : 0.5}/>
      )}
      {segs.map((seg, i) => {
        const offset = -segLen * i - segLen * 0.05;
        const dash = `${segLen * 0.9 * seg.val} ${2 * Math.PI * r - segLen * 0.9 * seg.val}`;
        return (
          <circle key={i} r={r} fill="none" stroke={seg.color} strokeWidth="4.5"
                  strokeDasharray={dash} strokeDashoffset={offset} transform={`rotate(${i * 120 - 90})`}/>
        );
      })}
      <circle r={r} fill="#0c111c" stroke={border} strokeWidth="2.5"/>
      {p.status !== "ok" && (
        <circle r={r} fill="none" stroke={border} strokeWidth="2">
          <animate attributeName="stroke-opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite"/>
        </circle>
      )}
      {scheduleOn ? (
        <g>
          {[0, 1, 2].map(i => (
            <rect key={i} x={-30 + i * 20} y={-4} width="16" height="8" rx="1" fill="#3b82f6" fillOpacity="0.6"/>
          ))}
          <text textAnchor="middle" y="-16" fontSize="11" fill="#cbd5e1" fontFamily="ui-monospace, monospace">{p.name}</text>
        </g>
      ) : (
        <>
          <text textAnchor="middle" y="-3" fontSize="14" fontWeight="600" fill="#e2e8f0">{p.name}</text>
          <text textAnchor="middle" y="14" fontSize="10" fill="#64748b" fontFamily="ui-monospace, monospace">{Math.round((p.util.frozen + p.util.ref + p.util.dry) / 3 * 100)}%</text>
        </>
      )}
      {esgOn && (
        <g transform={`translate(0, ${r + 34})`}>
          <rect x="-36" y="0" width="72" height="16" rx="3" fill="#022c22" stroke="#22c55e" strokeWidth="0.8"/>
          <text x="0" y="11" textAnchor="middle" fontSize="10" fill="#86efac" fontFamily="ui-monospace, monospace">+${esgValue}</text>
        </g>
      )}
    </g>
  );
}

function RetailerNode({ r: rr, forecastOn }: { r: RetailerPos; forecastOn: boolean }) {
  const truncateName = (name: string, maxChars = 20) =>
    name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name;
  const label = truncateName(rr.name);
  const cardWidth = 128;
  const cardLeft = -cardWidth;
  const barLeft = cardLeft + 6;
  const barWidthMax = cardWidth - 12;
  const color = rr.shelfRisk === "red" ? "#ef4444" : rr.shelfRisk === "amber" ? "#f59e0b" : "#22c55e";
  const barWidth = Math.min(barWidthMax, barWidthMax * rr.poRatio * 0.75);
  return (
    <g transform={`translate(${rr.x}, ${rr.y})`}>
      <rect x={cardLeft} y="-14" width={cardWidth} height="28" rx="3" fill="#0c111c" stroke="#334155" strokeWidth="1.2"/>
      <text textAnchor="start" x={cardLeft + 8} y="3" fontSize="10" fontWeight="600" fill="#cbd5e1">{label}</text>
      <rect x={barLeft} y="18" width={barWidthMax} height="3" rx="1" fill="#1e293b"/>
      <rect x={barLeft} y="18" width={barWidth} height="3" rx="1" fill={rr.poRatio > 1.2 ? "#f59e0b" : "#3b82f6"}/>
      <text textAnchor="start" x={6} y="22" fontSize="9" fill="#64748b" fontFamily="ui-monospace, monospace">{(rr.poRatio * 100).toFixed(0)}%</text>
      <circle r="3" cx={-8} cy="-10" fill={color}/>
      {forecastOn && (
        <text textAnchor="start" x={cardLeft} y="-20" fontSize="9" fill="#3b82f6" fontFamily="ui-monospace, monospace">↑ 14d band</text>
      )}
    </g>
  );
}

function LayerToggles({ layers, setLayer, layerCounts }: {
  layers: Record<string, boolean>;
  setLayer: (id: string, on: boolean) => void;
  layerCounts: Record<string, number>;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const activeCount = Object.values(layers).filter(Boolean).length;
  return (
    <div className="w-[200px] sm:w-[244px] rounded-lg border border-slate-800 bg-[#0c111c]/95 backdrop-blur shadow-2xl">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-3 py-2 border-b border-slate-800 flex items-center justify-between hover:bg-slate-800/30 transition"
      >
        <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400 font-semibold">Layers</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-500">{activeCount} on</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`text-slate-500 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}><path d="M6 9l6 6 6-6"/></svg>
        </div>
      </button>
      <div
        data-testid="layers-content"
        aria-hidden={collapsed}
        className={`overflow-hidden transition-all duration-300 ease-out ${collapsed ? "max-h-0 opacity-0" : "max-h-[420px] opacity-100"}`}
      >
        <div className="py-1">
          {LAYERS_DEF.map(l => {
            const on = layers[l.id];
            return (
              <button key={l.id} onClick={() => setLayer(l.id, !on)} className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-800/50 transition">
                <div className={`w-7 h-4 rounded-full transition relative ${on ? "bg-blue-500" : "bg-slate-700"}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5"}`}/>
                </div>
                <span className={`flex-1 text-left text-[12px] ${on ? "text-slate-100" : "text-slate-400"}`}>{l.name}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${on ? "bg-blue-500/15 text-blue-300" : "bg-slate-800 text-slate-500"}`}>
                  {layerCounts[l.id] ?? l.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const NEWS_HEADLINE_MS = 12_000;

function NewsTicker({ items }: { items: Disruption[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [items[0]?.id]);

  useEffect(() => {
    if (items.length <= 1) return;
    const id = window.setInterval(
      () => setIndex(i => (i + 1) % items.length),
      NEWS_HEADLINE_MS,
    );
    return () => window.clearInterval(id);
  }, [items.length]);

  if (items.length === 0) return null;

  const d = items[index];
  return (
    <div className="absolute left-0 right-0 bottom-[75px] h-7 bg-red-950/40 border-y border-red-900/40 overflow-hidden flex items-center z-10">
      <div className="shrink-0 px-3 h-full flex items-center gap-1.5 bg-red-900/60 border-r border-red-800/60">
        <Dot tone="red" pulse/>
        <span className="text-[10px] uppercase tracking-wider text-red-200 font-mono">News feed</span>
      </div>
      <div className="flex-1 px-4 font-mono text-[12px] text-red-200 truncate transition-opacity duration-500">
        <span className="text-red-400">[{d.ts.slice(11)}]</span>{" "}
        <span className="text-red-300">{d.src}</span> · {d.text}
        {items.length > 1 && (
          <span className="ml-3 text-[10px] text-red-400/80 tabular-nums">
            {index + 1}/{items.length}
          </span>
        )}
      </div>
    </div>
  );
}

const DEMO_EVENTS = [
  { at: 0.05, t: "red" }, { at: 0.18, t: "orange" }, { at: 0.34, t: "blue" }, { at: 0.42, t: "green" },
  { at: 0.51, t: "red" }, { at: 0.66, t: "blue" },   { at: 0.78, t: "orange" }, { at: 0.88, t: "green" },
];
const WINDOW_MS = 24 * 60 * 60 * 1000;

function disruptionToEvent(d: Disruption): { at: number; t: string } | null {
  const tsMs = new Date(d.ts.replace(" ", "T")).getTime();
  if (isNaN(tsMs)) return null;
  const at = (tsMs - (Date.now() - WINDOW_MS)) / WINDOW_MS;
  if (at < 0 || at > 1) return null;
  // severity is already "red" | "amber" | "info" from the api adapter
  const t = d.severity === "red" ? "red" : d.severity === "amber" ? "orange" : "blue";
  return { at, t };
}

function TimeScrubber({ live, setLive, disruptions }: { live: boolean; setLive: (v: boolean) => void; disruptions: Disruption[] }) {
  const [pos, setPos] = useState(0.92);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const liveEvents = useMemo(
    () => disruptions.map(disruptionToEvent).filter((e): e is { at: number; t: string } => e !== null),
    [disruptions],
  );
  const events = liveEvents.length > 0 ? liveEvents : DEMO_EVENTS;

  const colorOf = (c: string) => ({ red: "#ef4444", orange: "#f97316", blue: "#3b82f6", green: "#22c55e" }[c] ?? "#94a3b8");

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setPos(p => {
        const next = p + 0.005 * speed;
        if (next >= 1) { setPlaying(false); return 1; }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [playing, speed]);

  const handlePlay = () => {
    if (!playing && pos >= 1) setPos(0);
    setPlaying(p => !p);
  };

  return (
    <div className="absolute left-0 right-0 bottom-0 h-[75px] border-t border-slate-800 bg-[#0a0d14]/95 backdrop-blur z-10">
      {/* Controls row */}
      <div className="flex items-center pl-8 pr-4 gap-3 h-[75px]">
        {/* Play + speed buttons */}
        <div className="flex items-center gap-1.5">
          <button onClick={handlePlay} className="w-8 h-8 rounded-md border border-slate-700 hover:border-slate-500 flex items-center justify-center text-slate-200">
            <Icon name={playing ? "pause" : "play"} size={14}/>
          </button>
          {[1, 2, 5].map(s => (
            <button key={s} onClick={() => setSpeed(s)} className={`px-2 h-8 rounded-md border text-[11px] font-mono transition ${speed === s ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}>{s}×</button>
          ))}
        </div>
        {/* Scrubber track */}
        <div className="flex-1 relative h-12">
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-slate-800"/>
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-blue-500/50" style={{ width: `${pos * 100}%` }}/>
          {events.map((e, i) => (
            <div key={i} className="absolute top-1/2 -translate-y-1/2 w-[2px] h-3.5 rounded-sm" style={{ left: `${e.at * 100}%`, background: colorOf(e.t) }}/>
          ))}
          {/* Time labels above the track */}
          {[0, 0.25, 0.5, 0.75, 1].map((h, i) => (
            <div key={i} className="absolute text-[10px] font-mono text-slate-500" style={{ left: `${h * 100}%`, top: "4px", transform: "translateX(-50%)" }}>
              {["-24h", "-18h", "-12h", "-6h", "now"][i]}
            </div>
          ))}
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-blue-400 ring-2 ring-blue-500/40" style={{ left: `${pos * 100}%` }}/>
        </div>
        {/* LIVE button */}
        <button onClick={() => { setPos(1); setLive(true); }} className={`flex items-center gap-1.5 px-2.5 h-8 rounded-md border ${live ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-700"} font-mono text-[11px]`}>
          <span className="relative flex w-1.5 h-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"/>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"/>
          </span>
          <span className={live ? "text-emerald-300" : "text-slate-400"}>LIVE</span>
        </button>
      </div>
    </div>
  );
}

export function FactoryView({ plant, onClose, onAskCopilot, isClosing }: { plant: PlantData; onClose: () => void; onAskCopilot: () => void; isClosing?: boolean }) {
  const { data: facilities } = useFacilities();
  const facility = facilities.find(f => f.short_code === plant.id);
  const facilityId = facility?.facility_id ?? null;
  const { data: util } = useFacilityUtilization(facilityId);
  const { data: activeRuns, status: runsStatus } = useActiveRuns(facilityId);
  const { data: yieldPoints } = useYieldTelemetry();

  const zoneMap = new Map(util?.zones.map(z => [z.zone, z]) ?? []);
  const frozen = zoneMap.get("frozen");
  const refrig = zoneMap.get("refrigerated");
  const dry = zoneMap.get("dry");

  // Storage cards prefer backend utilisation, fall back to mock util values on the plant.
  const storageCards = [
    { name: "Frozen",       pct: frozen?.pct ?? plant.util.frozen, used: frozen?.used_kg, cap: frozen?.capacity_kg ?? 18000, color: "bg-blue-500" },
    { name: "Refrigerated", pct: refrig?.pct ?? plant.util.ref,    used: refrig?.used_kg, cap: refrig?.capacity_kg ?? 12000, color: "bg-teal-500" },
    { name: "Dry",          pct: dry?.pct    ?? plant.util.dry,    used: dry?.used_kg,    cap: dry?.capacity_kg    ?? 42000, color: "bg-slate-400" },
  ];

  // Map backend active runs by line number for overlay.
  const runByLine = new Map(activeRuns.map(r => [r.line_number, r]));

  // Latest yield telemetry per line for this facility.
  const latestYieldByLine = new Map<number, BackendYieldTelemetryPoint>();
  for (const pt of yieldPoints) {
    if (facilityId && pt.facility_id !== facilityId) continue;
    const lineNum = parseInt(pt.line_id.replace("line_", ""), 10);
    if (!isNaN(lineNum)) {
      const existing = latestYieldByLine.get(lineNum);
      if (!existing || pt.date > existing.date) latestYieldByLine.set(lineNum, pt);
    }
  }

  // Fallback line snapshot for when the backend has no active runs.
  const batchByLine: Record<number, { sku: string; qty: number; expiryLot: string; expiryH: number | null; status: string }> = {
    1: { sku: "Blueberry Muffin 12pk", qty: 4800, expiryLot: "LOT-21884", expiryH: 6,   status: "amber" },
    2: { sku: "Butter Croissant 6pk",  qty: 3200, expiryLot: "—",         expiryH: null, status: "ok" },
    3: { sku: "Cinnamon Bagel 8pk",    qty: 6200, expiryLot: "—",         expiryH: null, status: "ok" },
    4: { sku: "Chocolate Cookie 24pk", qty: 7400, expiryLot: "LOT-21999", expiryH: 48,  status: "ok" },
  };
  const lineCount = facility?.line_count ?? 4;
  return (
    <div
      style={{ animation: isClosing ? "slide-out-right 280ms ease forwards" : "slide-in-right 280ms ease forwards" }}
      className="absolute top-0 right-0 bottom-[75px] w-full sm:w-[600px] bg-[#0c111c] border-l border-slate-800 z-20 flex flex-col shadow-2xl"
    >
      <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-[15px] font-semibold text-slate-100">{plant.name}</div>
            <div className="text-[11px] text-slate-500 font-mono">{plant.city}</div>
          </div>
          <Pill tone={plant.status === "warn" ? "amber" : plant.status === "critical" ? "red" : "green"}>
            <Dot tone={plant.status === "warn" ? "amber" : "green"} pulse={plant.status !== "ok"}/>
            {plant.status === "warn" ? "Attention" : plant.status === "critical" ? "Critical" : "Healthy"}
          </Pill>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Icon name="x" size={18}/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
            Storage utilisation
            {util && <span className="ml-2 text-emerald-400 normal-case font-normal">· live</span>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {storageCards.map((s, i) => (
              <div key={i} className="rounded-md border border-slate-800 bg-slate-900/40 p-2">
                <div className="text-[10px] text-slate-500">{s.name}</div>
                <div className="text-[18px] font-mono tabular-nums text-slate-100 mt-0.5">{Math.round(s.pct * 100)}%</div>
                <div className="h-1 rounded-full bg-slate-800 overflow-hidden mt-1">
                  <div className={`h-full ${s.color}`} style={{ width: `${s.pct * 100}%` }}/>
                </div>
                <div className="text-[10px] font-mono text-slate-500 mt-1 tabular-nums">
                  {Math.round(s.used ?? s.cap * s.pct).toLocaleString()} / {Math.round(s.cap).toLocaleString()} kg
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
            Active production lines · floor view
            {runsStatus === "live" && activeRuns.length > 0 && <span className="ml-2 text-emerald-400 normal-case font-normal">· live</span>}
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/30 p-3 space-y-2">
            {Array.from({ length: lineCount }, (_, i) => i + 1).map(lineNum => {
              const run = runByLine.get(lineNum);
              const b = batchByLine[lineNum];
              const sku = run?.sku_name ?? b?.sku ?? `Line ${lineNum}`;
              const qty = run?.planned_kg ?? run?.actual_kg ?? b?.qty ?? 0;
              const isLive = !!run;
              const rowStatus = b?.status ?? "ok";
              return (
                <div key={lineNum} className="flex items-center gap-2">
                  <div className="w-12 text-[10px] font-mono text-slate-500 shrink-0">Line {lineNum}</div>
                  <div className="flex-1 h-9 rounded bg-slate-800/40 relative overflow-hidden">
                    <div className={`absolute inset-y-0 left-0 px-2.5 flex items-center gap-2 rounded ${rowStatus === "amber" ? "border-l-2 border-amber-500 bg-amber-500/5" : "border-l-2 border-emerald-500/60 bg-emerald-500/5"}`} style={{ width: "92%" }}>
                      <span className="text-[12px] text-slate-100">{sku}</span>
                      <span className="text-[10px] font-mono text-slate-500">{qty.toLocaleString()} {isLive ? "kg" : "u"}</span>
                      {isLive && <span className="text-[9px] font-mono text-emerald-400 ml-auto mr-1">live</span>}
                      {!isLive && b?.expiryH !== null && b?.expiryH !== undefined && (
                        <Pill tone={b.expiryH < 12 ? "red" : b.expiryH < 24 ? "amber" : "ghost"} className="ml-auto mr-2">{b.expiryLot} · {b.expiryH}h</Pill>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
            Yield per line
            {latestYieldByLine.size > 0 && <span className="ml-2 text-emerald-400 normal-case font-normal">· live</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: Math.min(lineCount, 4) }, (_, i) => i + 1).map(lineNum => {
              const pt = latestYieldByLine.get(lineNum);
              const fallbackYield: Record<number, { actual: number; target: number; lost: number; anomaly: string | null }> = {
                1: { actual: 93.4, target: 97.1, lost: 2341, anomaly: plant.id === "p1" ? "Dough divider drift — last calibrated 47 days ago." : null },
                2: { actual: 97.8, target: 97.1, lost: 0, anomaly: null },
                3: { actual: 96.4, target: 97.1, lost: 420, anomaly: null },
                4: { actual: 97.2, target: 97.1, lost: 0, anomaly: null },
              };
              const fb = fallbackYield[lineNum] ?? { actual: 97.0, target: 97.1, lost: 0, anomaly: null };
              const actual = pt?.actual_pct ?? fb.actual;
              const target = pt?.target_pct ?? fb.target;
              const lost = pt ? (actual < target ? Math.round((target - actual) * 100) : 0) : fb.lost;
              const anomaly = actual < 95 && plant.id === "p1" ? "Dough divider drift — last calibrated 47 days ago." : null;
              return <YieldCounter key={lineNum} actual={actual} target={target} lostDollars={lost} anomaly={anomaly}/>;
            })}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Agent suggestions</div>
          <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-[12px] text-slate-500">
            No pending action cards — ask copilot to generate one.
          </div>
        </div>
      </div>
      <div className="p-3 border-t border-slate-800">
        <button onClick={onAskCopilot} className="w-full py-2.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[13px] transition flex items-center justify-center gap-2">
          <Icon name="chat" size={14} className="text-white"/> Ask copilot about {plant.name}
        </button>
      </div>
    </div>
  );
}

function FlowLegend() {
  const { data: esg, status: esgStatus } = useEsgCounter();
  const [collapsed, setCollapsed] = useState(false);
  const liveEsg = esgStatus === "live";
  const wasteVal   = liveEsg && esg.wasteAvoided   !== undefined ? esg.wasteAvoided.toLocaleString()         : "--";
  const co2Val     = liveEsg && esg.co2eSaved       !== undefined ? `${esg.co2eSaved.toFixed(1)} t`           : "--";
  const moqVal     = liveEsg && esg.moqTaxYtd       !== undefined ? `$${(esg.moqTaxYtd / 1000).toFixed(1)}k` : "--";
  const disruptVal = liveEsg && esg.disruptionsCaught !== undefined ? String(esg.disruptionsCaught)           : "--";

  return (
    <div className="w-[200px] sm:w-[244px] rounded-lg border border-slate-800 bg-[#0c111c]/95 backdrop-blur shadow-xl">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-3 py-2 border-b border-slate-800 flex items-center justify-between hover:bg-slate-800/30 transition"
      >
        <span className="text-[11px] uppercase tracking-[0.14em] text-slate-400 font-semibold">Flow & ESG</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`text-slate-500 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      <div
        data-testid="flow-legend-content"
        aria-hidden={collapsed}
        className={`overflow-hidden transition-all duration-300 ease-out ${collapsed ? "max-h-0 opacity-0" : "max-h-[320px] opacity-100"}`}
      >
        <div className="px-3 py-2.5 flex flex-col gap-1.5">
          <span className="text-[9px] uppercase tracking-[0.14em] text-slate-500 font-mono">Supplier POs</span>
          {[
            { color: "#3b82f6", label: "confirmed" },
            { color: "#f59e0b", label: "draft / pending" },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="inline-block w-3 h-[3px] rounded-sm shrink-0" style={{ background: f.color }}/>
              <span className="text-[10px] text-slate-400 font-mono">{f.label}</span>
            </div>
          ))}
          <span className="text-[9px] uppercase tracking-[0.14em] text-slate-500 font-mono mt-1">Outbound</span>
          {[
            { color: "#f97316", label: "scheduled" },
            { color: "#ea580c", label: "in transit" },
          ].map((f, i) => (
            <div key={`out-${i}`} className="flex items-center gap-2">
              <span className="inline-block w-3 h-[3px] rounded-sm shrink-0" style={{ background: f.color }}/>
              <span className="text-[10px] text-slate-400 font-mono">{f.label}</span>
            </div>
          ))}
          <div className="border-t border-slate-800 mt-0.5 pt-1.5 flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-[0.14em] text-slate-500 font-mono">ESG</span>
            {[
              { icon: "leaf", value: wasteVal,   label: "waste saved",  color: "text-emerald-400" },
              { icon: "drop", value: co2Val,     label: "CO₂e",         color: "text-emerald-400" },
              { icon: "warn", value: disruptVal, label: "disruptions",  color: "text-amber-400"   },
              { icon: "diff", value: moqVal,     label: "MOQ-tax",      color: "text-amber-400"   },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Icon name={s.icon} size={9} className={s.color}/>
                <span className="text-[10px] font-mono tabular-nums text-slate-300">{s.value}</span>
                <span className="text-[9px] text-slate-500">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface FlowSightCanvasProps {
  openChatContext?: (ctx: string) => void;
}

export function FlowSightCanvas({ openChatContext }: FlowSightCanvasProps) {
  const { facility: facilityFilter } = useApp();
  const [layers, setLayers] = useState<Record<string, boolean>>(
    Object.fromEntries(LAYERS_DEF.map(l => [l.id, l.defaultOn]))
  );
  const [live, setLive] = useState(true);
  const [activePlant, setActivePlant] = useState<PlantData | null>(null);
  const [plantClosing, setPlantClosing] = useState(false);
  const [hoveredInbound, setHoveredInbound] = useState<InboundFlow | null>(null);
  const [hoveredOutbound, setHoveredOutbound] = useState<OutboundFlow | null>(null);
  const [flowTooltipPos, setFlowTooltipPos] = useState({ x: 0, y: 0 });
  const [hoveredCol, setHoveredCol] = useState<string | null>(null);
  const setLayer = useCallback((id: string, on: boolean) => setLayers(s => ({ ...s, [id]: on })), []);

  const closePlant = useCallback(() => {
    setPlantClosing(true);
    setTimeout(() => { setActivePlant(null); setPlantClosing(false); }, 280);
  }, []);

  const activeFacilityBackendId = useMemo(
    () => (facilityFilter === "all" ? null : SHORT_CODE_TO_FACILITY_ID[facilityFilter] ?? null),
    [facilityFilter],
  );

  const { data: suppliers } = useSuppliers();
  const { data: disruptions } = useDisruptions();
  const { data: newsFeed } = useNewsDisruptionFeed();
  const { data: retailers } = useRetailers();
  const { data: facilities } = useFacilities();
  const { data: orders, status: ordersStatus } = useAllSupplierOrders();
  const { data: outboundShipments, status: outboundStatus } = useOutboundShipments();
  const [utilByFacility, setUtilByFacility] = useState<Map<string, BackendFacilityUtilization>>(new Map());

  const facilityIdsKey = useMemo(() => {
    if (activeFacilityBackendId) return activeFacilityBackendId;
    return facilities.map(f => f.facility_id).sort().join("|");
  }, [facilities, activeFacilityBackendId]);

  useEffect(() => {
    if (!facilityIdsKey) return;
    const ids = facilityIdsKey.split("|");
    let alive = true;
    Promise.all(ids.map(id => fetchFacilityUtilization(id))).then(results => {
      if (!alive) return;
      const m = new Map<string, BackendFacilityUtilization>();
      ids.forEach((id, i) => {
        const u = results[i];
        if (u) m.set(id, u);
      });
      setUtilByFacility(m);
    });
    return () => { alive = false; };
  }, [facilityIdsKey]);

  const allPlantPos = useMemo(
    () => buildPlantPositions(facilities, utilByFacility),
    [facilities, utilByFacility],
  );

  const plantPos = allPlantPos;

  useEffect(() => {
    if (facilityFilter !== "all" && activePlant && activePlant.id !== facilityFilter) {
      setActivePlant(null);
      setPlantClosing(false);
    }
  }, [facilityFilter, activePlant]);

  const activeOrders = useMemo(() => {
    const active = orders.filter(isActiveSupplierOrder);
    if (!activeFacilityBackendId) return active;
    return active.filter(o => o.facility_id === activeFacilityBackendId);
  }, [orders, activeFacilityBackendId]);

  const supplierBackendId = useCallback((frontendId: string) => frontendId.replace(/^s-/, "sup_"), []);

  const supplierPos = useMemo(
    () => suppliers.map((s, i) => ({ ...s, x: SUPPLIER_X, y: SUPPLIER_ROW_START + i * SUPPLIER_ROW_GAP })),
    [suppliers],
  );

  const inboundFlows = useMemo((): InboundFlow[] => {
    const plantByFacility = new Map(plantPos.map(p => [p.facilityId, p]));
    const supplierByBackend = new Map(
      supplierPos.map(s => [supplierBackendId(s.id), s]),
    );
    const flows: InboundFlow[] = [];
    for (const order of activeOrders) {
      const sup = supplierByBackend.get(order.supplier_id);
      const plant = plantByFacility.get(order.facility_id);
      if (!sup || !plant) continue;
      flows.push({
        id: order.order_id,
        from: { x: sup.x, y: sup.y },
        to: { x: plant.x, y: plant.y },
        orderId: order.order_id,
        supplierName: sup.name,
        plantName: plant.name,
        deliveryDate: order.delivery_date,
        status: order.status,
        items: order.items,
        totalKg: order.items.reduce((s, it) => s + it.quantity_kg, 0),
        cargo: formatOrderCargo(order),
      });
    }
    return flows;
  }, [activeOrders, plantPos, supplierPos, supplierBackendId]);

  const activeOutbound = useMemo(() => {
    const active = outboundShipments.filter(isActiveOutboundShipment);
    if (!activeFacilityBackendId) return active;
    return active.filter(s => s.facility_id === activeFacilityBackendId);
  }, [outboundShipments, activeFacilityBackendId]);

  const retailerById = useMemo(
    () => new Map(retailers.map(r => [r.retailer_id, r])),
    [retailers],
  );

  const resolveRetailerPos = useCallback(
    (retailerId: string, plant: PlantData, base: RetailerPos[]): RetailerPos => {
      const existing = base.find(r => r.id === retailerId);
      if (existing) return existing;
      const r = retailerById.get(retailerId);
      return {
        id: retailerId,
        name: r?.name ?? retailerId.replace(/_/g, " "),
        poRatio: r?.po_ratio ?? 1,
        shelfRisk: r?.shelf_risk ?? "green",
        x: RETAILER_X,
        y: plant.y,
      };
    },
    [retailerById],
  );

  const retailerPos: RetailerPos[] = useMemo(() => {
    if (retailers.length === 0) return [];
    const laneYs =
      plantPos.length === 1
        ? [plantPos[0].y]
        : plantPos.length > 1
          ? plantPos.map(p => p.y)
          : RETAILER_LANES_Y;
    const base = retailers.slice(0, laneYs.length).map((r, i) => ({
      id: r.retailer_id,
      name: r.name,
      poRatio: r.po_ratio || 1,
      shelfRisk: r.shelf_risk,
      x: RETAILER_X,
      y: laneYs[i % laneYs.length],
    }));
    const seen = new Set(base.map(r => r.id));
    for (const s of activeOutbound) {
      if (seen.has(s.retailer_id)) continue;
      const plant = plantPos.find(p => p.facilityId === s.facility_id);
      if (!plant) continue;
      base.push(resolveRetailerPos(s.retailer_id, plant, base));
      seen.add(s.retailer_id);
    }
    return base;
  }, [retailers, plantPos, activeOutbound, resolveRetailerPos]);

  const outboundFlows = useMemo((): OutboundFlow[] => {
    const plantByFacility = new Map(plantPos.map(p => [p.facilityId, p]));
    const flows: OutboundFlow[] = [];
    for (const s of activeOutbound) {
      const plant = plantByFacility.get(s.facility_id);
      if (!plant) continue;
      const retailer = resolveRetailerPos(s.retailer_id, plant, retailerPos);
      flows.push({
        id: s.shipment_id,
        from: { x: plant.x, y: plant.y },
        to: { x: retailer.x, y: retailer.y },
        shipmentId: s.shipment_id,
        plantName: s.facility_name ?? plant.name,
        retailerName: s.retailer_name ?? retailer.name,
        skuName: s.sku_name ?? s.sku_id.replace(/^sku-/, "").replace(/-/g, " "),
        quantityUnits: s.quantity_units,
        deliveryDate: s.requested_delivery_date ?? "",
        status: s.status,
      });
    }
    return flows;
  }, [activeOutbound, plantPos, retailerPos, resolveRetailerPos]);

  const layerCounts = useMemo(() => ({
    risk: disruptions.length,
    procure: inboundFlows.length,
    forecast: retailers.length,
    schedule: outboundFlows.length,
  }), [disruptions.length, inboundFlows.length, retailers.length, outboundFlows.length]);

  return (
    <div className="bp-flow-canvas relative w-full h-full bg-[var(--bp-surface-soft)] overflow-hidden">
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <Pill tone="blue">FlowSight</Pill>
        <span className="text-[11px] text-[var(--bp-text-muted)] font-mono">
          {supplierPos.length} suppliers · {plantPos.length} plant{plantPos.length === 1 ? "" : "s"} · {retailerPos.length} retailers
          {facilityFilter !== "all" && (
            <> · {FACILITIES.find(f => f.id === facilityFilter)?.name ?? facilityFilter}</>
          )}
          {ordersStatus === "live" && activeOrders.length > 0 && (
            <> · {activeOrders.length} active PO{activeOrders.length === 1 ? "" : "s"}</>
          )}
          {outboundStatus === "live" && activeOutbound.length > 0 && (
            <> · {activeOutbound.length} outbound</>
          )}
        </span>
      </div>
      <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id="shelfHeat" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.5"/>
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0"/>
          </radialGradient>
        </defs>
        <line x1={COL_DIVIDER_L} y1={COL_LABEL_Y + 18} x2={COL_DIVIDER_L} y2={600} stroke="var(--bp-border-soft)" strokeWidth="1"/>
        <line x1={COL_DIVIDER_R} y1={COL_LABEL_Y + 18} x2={COL_DIVIDER_R} y2={600} stroke="var(--bp-border-soft)" strokeWidth="1"/>
        {[
          { x: SUPPLIER_X, label: "Suppliers" },
          { x: PLANT_CX, label: "Plants" },
          { x: RETAILER_X, label: "Retailers" },
        ].map(col => {
          const hovered = hoveredCol === col.label;
          return (
            <g
              key={col.label}
              style={{ cursor: "default" }}
              onMouseEnter={() => setHoveredCol(col.label)}
              onMouseLeave={() => setHoveredCol(null)}
            >
              <rect
                x={col.x - 42} y={COL_LABEL_Y - 11}
                width="84" height="18" rx="4"
                fill={hovered ? "var(--bp-flow-node-bg)" : "none"}
                stroke={hovered ? "var(--bp-border-soft)" : "none"}
                strokeWidth="1"
                style={{ transition: "fill 0.15s ease, stroke 0.15s ease" }}
              />
              <text
                x={col.x}
                y={COL_LABEL_Y}
                textAnchor="middle"
                fontSize="10"
                fill={hovered ? "var(--bp-text-strong)" : "var(--bp-text-subtle)"}
                fontFamily="ui-monospace, monospace"
                letterSpacing="0.12em"
                style={{ transition: "fill 0.15s ease" }}
              >
                {col.label.toUpperCase()}
              </text>
            </g>
          );
        })}

        {layers.procure && inboundFlows.map((f, idx) => {
          const pending = f.status === "draft" || f.status === "pending_confirm";
          const hovered = hoveredInbound?.id === f.id;
          const pathD = arcPath(f.from, f.to, 0.12);
          const stroke = pending ? "#d97706" : "#2563eb";
          const truckDur = pending ? 18 + (idx % 3) * 2 : 12 + (idx % 4) * 2;
          return (
            <g key={f.id}>
              <path
                d={pathD}
                stroke="transparent"
                strokeWidth="32"
                fill="none"
                style={{ cursor: "pointer" }}
                onMouseEnter={e => {
                  setHoveredInbound(f);
                  setHoveredOutbound(null);
                  setFlowTooltipPos({ x: e.clientX, y: e.clientY });
                }}
                onMouseMove={e => setFlowTooltipPos({ x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHoveredInbound(prev => (prev?.id === f.id ? null : prev))}
              />
              <path
                d={pathD}
                stroke={stroke}
                strokeOpacity={hovered ? (pending ? 0.85 : 0.75) : pending ? 0.55 : 0.45}
                strokeWidth={hovered ? 2.75 : 2}
                fill="none"
                strokeDasharray={pending ? "6 4" : undefined}
                strokeLinecap="round"
                pointerEvents="none"
              />
              <TruckSprite pathD={pathD} color={stroke} dur={truckDur} />
            </g>
          );
        })}
        {layers.schedule && outboundFlows.map((f, idx) => {
          const inTransit = f.status === "in_transit";
          const hovered = hoveredOutbound?.id === f.id;
          const pathD = arcPath(f.from, f.to, 0.12);
          const stroke = inTransit ? "#ea580c" : "#f97316";
          const truckDur = 10 + (idx % 4) * 2;
          return (
            <g key={`out-${f.id}`}>
              <path
                d={pathD}
                stroke="transparent"
                strokeWidth="32"
                fill="none"
                style={{ cursor: "pointer" }}
                onMouseEnter={e => {
                  setHoveredOutbound(f);
                  setHoveredInbound(null);
                  setFlowTooltipPos({ x: e.clientX, y: e.clientY });
                }}
                onMouseMove={e => setFlowTooltipPos({ x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHoveredOutbound(prev => (prev?.id === f.id ? null : prev))}
              />
              <path
                d={pathD}
                stroke={stroke}
                strokeOpacity={hovered ? 0.85 : 0.55}
                strokeWidth={hovered ? 2.75 : 2}
                fill="none"
                strokeDasharray={inTransit ? undefined : "5 4"}
                strokeLinecap="round"
                pointerEvents="none"
              />
              <TruckSprite pathD={pathD} color={stroke} dur={truckDur} />
            </g>
          );
        })}
        {layers.forecast && plantPos.length > 0 && retailerPos.map(rr => {
          const plant = plantPos.length === 1 ? plantPos[0] : plantPos.find(p => p.y === rr.y) ?? plantPos[0];
          return (
            <path key={"fc-" + rr.id} d={arcPath(rr, plant, -0.1)} stroke="#a855f7" strokeOpacity="0.15" strokeWidth="2" fill="none"/>
          );
        })}

        {supplierPos.map(s => (
          <SupplierNode key={s.id} s={s} riskOn={layers.risk} onClick={() => openChatContext?.(`Supplier: ${s.name}`)}/>
        ))}
        {plantPos.map(p => (
          <PlantNode key={p.id} p={p} onClick={() => setActivePlant(p)}
            scheduleOn={layers.schedule} esgOn={layers.esg} yieldOn={layers.yield} shelfOn={layers.shelf}/>
        ))}
        {retailerPos.map(rr => (
          <RetailerNode key={rr.id} r={rr} forecastOn={layers.forecast}/>
        ))}
      </svg>
      {hoveredInbound && <FlowOrderTooltip flow={hoveredInbound} x={flowTooltipPos.x} y={flowTooltipPos.y} />}
      {hoveredOutbound && <OutboundFlowTooltip flow={hoveredOutbound} x={flowTooltipPos.x} y={flowTooltipPos.y} />}
      {/* Legend panel — top-left, theme-aware */}
      <div className="absolute top-4 right-2 sm:right-4 z-10 flex flex-col gap-3">
        <LayerToggles layers={layers} setLayer={setLayer} layerCounts={layerCounts}/>
        <FlowLegend />
      </div>
      {layers.risk && newsFeed.length > 0 && <NewsTicker items={newsFeed}/>}
      <TimeScrubber live={live} setLive={setLive} disruptions={disruptions}/>
      {activePlant && (
        <>
          <div className="absolute inset-0 z-[15] bg-black/20" onClick={closePlant}/>
          <FactoryView
            plant={activePlant}
            isClosing={plantClosing}
            onClose={closePlant}
            onAskCopilot={() => openChatContext?.(`Plant ${activePlant.name} · ${activePlant.city}`)}
          />
        </>
      )}
    </div>
  );
}
