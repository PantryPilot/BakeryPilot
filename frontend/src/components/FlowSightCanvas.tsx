"use client";
import { useState, useEffect, useCallback } from "react";
import { Icon } from "./Icon";
import { Dot, Pill, YieldCounter } from "./atoms";
import type { Supplier, Disruption } from "../lib/data";
import type { BackendYieldTelemetryPoint } from "../lib/api";
import { useSuppliers, useDisruptions, useRetailers, useFacilities, useFacilityUtilization, useActiveRuns, useYieldTelemetry, useEsgCounter } from "../lib/hooks";

const CANVAS_W = 1280, CANVAS_H = 720;
const SUPPLIER_X = 180;
const PLANT_CX = 690;
const RETAILER_X = 1200;

const PLANT_POS = [
  { id: "p1", name: "Toronto",     city: "Toronto, ON",     x: PLANT_CX + 30,  y: 390, status: "warn", util: { frozen: 0.74, ref: 0.62, dry: 0.81 } },
  { id: "p2", name: "Mississauga", city: "Mississauga, ON", x: PLANT_CX - 30,  y: 440, status: "ok",   util: { frozen: 0.51, ref: 0.45, dry: 0.62 } },
  { id: "p3", name: "Hamilton",    city: "Hamilton, ON",    x: PLANT_CX - 80,  y: 480, status: "warn", util: { frozen: 0.91, ref: 0.78, dry: 0.55 } },
  { id: "p4", name: "Montreal",    city: "Montreal, QC",    x: PLANT_CX + 220, y: 350, status: "ok",   util: { frozen: 0.60, ref: 0.71, dry: 0.45 } },
] as const;

type PlantData = { id: string; name: string; city: string; x: number; y: number; status: string; util: { frozen: number; ref: number; dry: number } };

// UI visual config — retailer lane positions only; po_ratio / shelf_risk come
// from the backend (see useRetailers). FALLBACK is used until the API responds
// or when the backend is unreachable.
const RETAILER_LANES_Y = [386, 434, 482, 530];
const RETAILER_POS_FALLBACK = [
  { id: "r1", name: "Costco",  poRatio: 1.28, shelfRisk: "amber" as const, x: RETAILER_X, y: 386 },
  { id: "r2", name: "Walmart", poRatio: 0.94, shelfRisk: "green" as const, x: RETAILER_X, y: 434 },
  { id: "r3", name: "Loblaws", poRatio: 0.88, shelfRisk: "green" as const, x: RETAILER_X, y: 482 },
  { id: "r4", name: "Metro",   poRatio: 1.05, shelfRisk: "red" as const,   x: RETAILER_X, y: 530 },
];
type RetailerPos = (typeof RETAILER_POS_FALLBACK)[number];

const FLOWS = [
  { id: "f1", from: { x: SUPPLIER_X, y: 130 }, to: { x: PLANT_POS[2].x, y: PLANT_POS[2].y }, kind: "inbound",  cargo: "wheat T55 · 4,200 kg" },
  { id: "f2", from: { x: SUPPLIER_X, y: 330 }, to: { x: PLANT_POS[0].x, y: PLANT_POS[0].y }, kind: "inbound",  cargo: "blueberries · 1,800 kg" },
  { id: "f3", from: { x: SUPPLIER_X, y: 530 }, to: { x: PLANT_POS[1].x, y: PLANT_POS[1].y }, kind: "inbound",  cargo: "butter · 920 kg" },
  { id: "f4", from: { x: PLANT_POS[0].x, y: PLANT_POS[0].y }, to: { x: RETAILER_X, y: 386 }, kind: "outbound", cargo: "white bread · 8.4k u" },
  { id: "f5", from: { x: PLANT_POS[0].x, y: PLANT_POS[0].y }, to: { x: RETAILER_X, y: 482 }, kind: "outbound", cargo: "naan · 12k u" },
  { id: "f6", from: { x: PLANT_POS[3].x, y: PLANT_POS[3].y }, to: { x: RETAILER_X, y: 578 }, kind: "outbound", cargo: "focaccia · 14.2k u" },
  { id: "f7", from: { x: PLANT_POS[1].x, y: PLANT_POS[1].y }, to: { x: PLANT_POS[2].x, y: PLANT_POS[2].y }, kind: "transfer", cargo: "interplant balance · 400 kg" },
];

const LAYERS_DEF = [
  { id: "risk",     name: "Risk",        count: 3,  defaultOn: true,  desc: "Disruption signals + supplier halos" },
  { id: "yield",    name: "Yield",       count: 1,  defaultOn: false, desc: "Line variance glow on plants" },
  { id: "shelf",    name: "Shelf-life",  count: 12, defaultOn: false, desc: "Expiry heat overlay" },
  { id: "forecast", name: "Forecast",    count: 5,  defaultOn: false, desc: "Demand bands retailer→plant" },
  { id: "procure",  name: "Procurement", count: 4,  defaultOn: true,  desc: "PO arcs plant→supplier" },
  { id: "esg",      name: "ESG",         count: 4,  defaultOn: false, desc: "Waste-avoided per plant" },
  { id: "schedule", name: "Schedule",    count: 9,  defaultOn: false, desc: "Active runs inside plants" },
  { id: "network",  name: "Network",     count: 2,  defaultOn: false, desc: "Cross-plant transfer arcs" },
];

function arcPath(from: { x: number; y: number }, to: { x: number; y: number }, bend = 0.18) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
  const px = -dy * bend, py = dx * bend;
  return `M ${from.x} ${from.y} Q ${mx + px} ${my + py} ${to.x} ${to.y}`;
}

function haloColor(s: Supplier) {
  return s.status === "disrupt" ? "#ef4444" : s.onTime >= 0.95 ? "#22c55e" : s.onTime >= 0.85 ? "#f59e0b" : "#ef4444";
}

function TruckSprite({ flow, dur = 14 }: { flow: typeof FLOWS[number]; dur?: number }) {
  const color = flow.kind === "inbound" ? "#3b82f6" : flow.kind === "outbound" ? "#f97316" : "#94a3b8";
  const path = arcPath(flow.from, flow.to, flow.kind === "transfer" ? 0.32 : 0.18);
  return (
    <g>
      <path d={path} stroke={color} strokeOpacity="0.18" strokeWidth="1.2" fill="none" strokeDasharray="2 4"/>
      <g>
        <rect width="14" height="9" x="-7" y="-4.5" rx="1.5" fill={color} stroke="#0a0d14" strokeWidth="0.6"/>
        <rect width="4" height="5" x="-7" y="-2.5" fill="#0a0d14"/>
        <animateMotion dur={`${dur}s`} repeatCount="indefinite" rotate="auto" path={path}/>
      </g>
    </g>
  );
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
  const r = 38;
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
        <circle r={r + 14} fill={border} fillOpacity="0.08">
          <animate attributeName="r" values={`${r + 10};${r + 18};${r + 10}`} dur="1.4s" repeatCount="indefinite"/>
          <animate attributeName="fill-opacity" values="0.15;0.04;0.15" dur="1.4s" repeatCount="indefinite"/>
        </circle>
      )}
      {yieldOn && p.id === "p1" && <circle r={r + 8} fill="#ef4444" fillOpacity="0.25"/>}
      {shelfOn && (p.id === "p3" || p.id === "p1") && (
        <circle r={r + 18} fill="url(#shelfHeat)" opacity={p.id === "p3" ? 0.9 : 0.5}/>
      )}
      {segs.map((seg, i) => {
        const offset = -segLen * i - segLen * 0.05;
        const dash = `${segLen * 0.9 * seg.val} ${2 * Math.PI * r - segLen * 0.9 * seg.val}`;
        return (
          <circle key={i} r={r} fill="none" stroke={seg.color} strokeWidth="3.5"
                  strokeDasharray={dash} strokeDashoffset={offset} transform={`rotate(${i * 120 - 90})`}/>
        );
      })}
      <circle r={r} fill="#0c111c" stroke={border} strokeWidth="2"/>
      {p.status !== "ok" && (
        <circle r={r} fill="none" stroke={border} strokeWidth="2">
          <animate attributeName="stroke-opacity" values="1;0.4;1" dur="1.2s" repeatCount="indefinite"/>
        </circle>
      )}
      {scheduleOn ? (
        <g>
          {[0, 1, 2].map(i => (
            <rect key={i} x={-22 + i * 15} y={-3} width="12" height="6" rx="1" fill="#3b82f6" fillOpacity="0.6"/>
          ))}
          <text textAnchor="middle" y="-12" fontSize="9" fill="#cbd5e1" fontFamily="ui-monospace, monospace">{p.name}</text>
        </g>
      ) : (
        <>
          <text textAnchor="middle" y="-2" fontSize="14" fontWeight="700" fill="#e2e8f0">{p.name.split(" ")[1]}</text>
          <text textAnchor="middle" y="12" fontSize="9" fill="#64748b" fontFamily="ui-monospace, monospace">{p.city}</text>
        </>
      )}
      <text textAnchor="middle" y={r + 16} fontSize="10" fill="#94a3b8" fontFamily="ui-monospace, monospace">
        {Math.round((p.util.frozen + p.util.ref + p.util.dry) / 3 * 100)}% util
      </text>
      {esgOn && (
        <g transform={`translate(0, ${r + 28})`}>
          <rect x="-32" y="0" width="64" height="14" rx="3" fill="#022c22" stroke="#22c55e" strokeWidth="0.8"/>
          <text x="0" y="10" textAnchor="middle" fontSize="9" fill="#86efac" fontFamily="ui-monospace, monospace">+${esgValue}</text>
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

function LayerToggles({ layers, setLayer }: { layers: Record<string, boolean>; setLayer: (id: string, on: boolean) => void }) {
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
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${on ? "bg-blue-500/15 text-blue-300" : "bg-slate-800 text-slate-500"}`}>{l.count}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NewsTicker({ disruptions }: { disruptions: Disruption[] }) {
  if (disruptions.length === 0) return null;
  return (
    <div className="absolute left-0 right-0 bottom-[75px] h-7 bg-red-950/40 border-y border-red-900/40 overflow-hidden flex items-center z-10">
      <div className="shrink-0 px-3 h-full flex items-center gap-1.5 bg-red-900/60 border-r border-red-800/60">
        <Dot tone="red" pulse/>
        <span className="text-[10px] uppercase tracking-wider text-red-200 font-mono">Disruption feed</span>
      </div>
      <div className="ticker-wrap flex-1">
        <div className="ticker font-mono text-[12px] text-red-200">
          {disruptions.concat(disruptions).map((d, i) => (
            <span key={i} className="mx-8">
              <span className="text-red-400">[{d.ts.slice(11)}]</span>{" "}
              <span className="text-red-300">{d.src}</span> · {d.text}
            </span>
          ))}
        </div>
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

  const liveEvents = disruptions.map(disruptionToEvent).filter((e): e is { at: number; t: string } => e !== null);
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
        <button onClick={onAskCopilot} className="w-full py-2.5 rounded-md bg-blue-500 hover:bg-blue-400 text-blue-950 font-semibold text-[13px] transition flex items-center justify-center gap-2">
          <Icon name="chat" size={14}/> Ask copilot about {plant.name}
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
          <span className="text-[9px] uppercase tracking-[0.14em] text-slate-500 font-mono">Flow</span>
          {[
            { color: "#3b82f6", label: "inbound" },
            { color: "#f97316", label: "outbound" },
            { color: "#94a3b8", label: "transfer" },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-2">
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
  const [layers, setLayers] = useState<Record<string, boolean>>(
    Object.fromEntries(LAYERS_DEF.map(l => [l.id, l.defaultOn]))
  );
  const [live, setLive] = useState(true);
  const [activePlant, setActivePlant] = useState<PlantData | null>(null);
  const [plantClosing, setPlantClosing] = useState(false);
  const setLayer = (id: string, on: boolean) => setLayers(s => ({ ...s, [id]: on }));

  const closePlant = useCallback(() => {
    setPlantClosing(true);
    setTimeout(() => { setActivePlant(null); setPlantClosing(false); }, 280);
  }, []);

  const { data: suppliers } = useSuppliers();
  const { data: disruptions } = useDisruptions();
  const { data: retailers } = useRetailers();
  const supplierPos = suppliers.map((s, i) => ({ ...s, x: SUPPLIER_X, y: 130 + i * 100 }));

  // Map backend retailers to canvas lanes, falling back to demo positions.
  const retailerPos: RetailerPos[] = retailers.length > 0
    ? retailers.slice(0, RETAILER_LANES_Y.length).map((r, i) => ({
        id: r.retailer_id,
        name: r.name,
        poRatio: r.po_ratio || 1,
        shelfRisk: r.shelf_risk,
        x: RETAILER_X,
        y: RETAILER_LANES_Y[i],
      }))
    : RETAILER_POS_FALLBACK;

  return (
    <div className="bp-flow-canvas relative w-full h-full bg-[#070a11] overflow-hidden">
      <div className="absolute inset-0 opacity-[0.18]" style={{
        backgroundImage: "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }}/>
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <Pill tone="blue">FlowSight</Pill>
        <span className="text-[11px] text-slate-500 font-mono">live · {supplierPos.length} suppliers · {PLANT_POS.length} plants · {retailerPos.length} retailers</span>
      </div>
      <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full">
        <defs>
          <radialGradient id="shelfHeat" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.5"/>
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0"/>
          </radialGradient>
          <linearGradient id="canadaTint" x1="0" x2="1">
            <stop offset="0%" stopColor="#1e293b" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="#1e293b" stopOpacity="0.6"/>
          </linearGradient>
        </defs>
        <path d="M 250 200 Q 350 170, 480 200 T 700 180 T 920 200 L 980 320 Q 940 360, 850 360 L 700 380 Q 600 380, 480 360 L 320 340 Q 240 320, 220 280 Z"
              fill="url(#canadaTint)" stroke="#334155" strokeOpacity="0.4" strokeWidth="1" strokeDasharray="3 4"/>
        <text x={PLANT_CX} y="190" textAnchor="middle" fontSize="11" fill="#475569" fontFamily="ui-monospace, monospace" letterSpacing="0.2em">CANADA</text>
        <text x={SUPPLIER_X} y="80" textAnchor="middle" fontSize="10" fill="#64748b" fontFamily="ui-monospace, monospace" letterSpacing="0.18em">SUPPLIERS ›</text>
        <text x={RETAILER_X} y="358" textAnchor="middle" fontSize="10" fill="#64748b" fontFamily="ui-monospace, monospace" letterSpacing="0.18em">‹ RETAILERS</text>

        {layers.procure && FLOWS.filter(f => f.kind === "inbound").map(f => (
          <path key={"a-" + f.id} d={arcPath(f.from, f.to, 0.18)} stroke="#3b82f6" strokeOpacity="0.25" strokeWidth="1" fill="none" strokeDasharray="3 4"/>
        ))}
        {FLOWS.filter(f => f.kind === "outbound").map(f => (
          <path key={"b-" + f.id} d={arcPath(f.from, f.to, 0.18)} stroke="#f97316" strokeOpacity="0.18" strokeWidth="1" fill="none" strokeDasharray="3 4"/>
        ))}
        {layers.network && FLOWS.filter(f => f.kind === "transfer").map(f => (
          <path key={"c-" + f.id} d={arcPath(f.from, f.to, 0.32)} stroke="#94a3b8" strokeOpacity="0.3" strokeWidth="1" fill="none" strokeDasharray="2 3"/>
        ))}
        {layers.forecast && retailerPos.map((rr, i) => (
          <path key={"fc-" + rr.id} d={arcPath(rr, PLANT_POS[i % PLANT_POS.length], -0.14)} stroke="#a855f7" strokeOpacity="0.18" strokeWidth="3" fill="none"/>
        ))}
        {layers.procure && FLOWS.filter(f => f.kind === "inbound").map((f, idx) => <TruckSprite key={"t-" + f.id} flow={f} dur={12 + idx * 2}/>)}
        {FLOWS.filter(f => f.kind === "outbound").map((f, idx) => <TruckSprite key={"to-" + f.id} flow={f} dur={14 + idx * 2}/>)}
        {layers.network && FLOWS.filter(f => f.kind === "transfer").map(f => <TruckSprite key={"tx-" + f.id} flow={f} dur={18}/>)}

        {supplierPos.map(s => (
          <SupplierNode key={s.id} s={s} riskOn={layers.risk} onClick={() => openChatContext?.(`Supplier: ${s.name}`)}/>
        ))}
        {PLANT_POS.map((p: PlantData) => (
          <PlantNode key={p.id} p={p} onClick={() => setActivePlant(p)}
            scheduleOn={layers.schedule} esgOn={layers.esg} yieldOn={layers.yield} shelfOn={layers.shelf}/>
        ))}
        {retailerPos.map(rr => (
          <RetailerNode key={rr.id} r={rr} forecastOn={layers.forecast}/>
        ))}
      </svg>
      {/* Legend panel — top-left, theme-aware */}
      <div className="absolute top-4 right-2 sm:right-4 z-10 flex flex-col gap-3">
        <LayerToggles layers={layers} setLayer={setLayer}/>
        <FlowLegend />
      </div>
      {layers.risk && disruptions.length > 0 && <NewsTicker disruptions={disruptions}/>}
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
