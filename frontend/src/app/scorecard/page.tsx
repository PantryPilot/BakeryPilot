"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "../../lib/context";
import { Icon } from "../../components/Icon";
import { Pill, Dot, ReliabilityHalo, MOQTaxBadge, Sparkline, SectionHeader } from "../../components/atoms";
import { SKUS, Supplier } from "../../lib/data";
import { useSuppliers, useEsgCounter, useSupplierOrders, useWasteEvents, useYieldTelemetry, useDemandForecasts } from "../../lib/hooks";
import type { BackendWasteEvent, BackendYieldTelemetryPoint } from "../../lib/api";
import type { DemandForecast } from "../../lib/data";
import { BACKEND_URL } from "../../lib/api";

function LineChart({ series, yMin = 0, yMax = 1, height = 140 }: {
  series: { values: number[]; color: string; label: string; dashed?: boolean }[];
  yMin?: number; yMax?: number; height?: number;
}) {
  const w = 560, h = height, pad = 24;
  return (
    <svg viewBox={`0 0 ${w} ${h + 24}`} className="w-full">
      {[0, 0.25, 0.5, 0.75, 1].map((g, i) => {
        const y = pad + (h - pad * 2) * (1 - g);
        return <line key={i} x1={pad} x2={w - pad} y1={y} y2={y} stroke="#1e293b" strokeWidth="1"/>;
      })}
      {series.map((s, si) => {
        const n = s.values.length;
        const pts = s.values.map((v, i) => {
          const x = pad + (i / (n - 1)) * (w - pad * 2);
          const y = pad + (h - pad * 2) * (1 - (v - yMin) / (yMax - yMin));
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(" ");
        return <polyline key={si} points={pts} fill="none" stroke={s.color} strokeWidth="1.8" strokeDasharray={s.dashed ? "3 3" : ""} strokeLinejoin="round" strokeLinecap="round"/>;
      })}
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <text key={i} x={pad + p * (w - pad * 2)} y={h + 16} fontSize="10" fill="#475569" fontFamily="ui-monospace" textAnchor="middle">w{Math.round(p * (series[0].values.length - 1)) + 1}</text>
      ))}
      <g transform={`translate(${pad}, ${h + 14})`}>
        {series.map((s, i) => (
          <g key={i} transform={`translate(${i * 90}, 0)`}>
            <line x1="0" y1="0" x2="14" y2="0" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "3 3" : ""}/>
            <text x="20" y="3" fontSize="10" fill="#94a3b8">{s.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function ForecastChart({ forecast, upper, lower, actual, height = 220 }: {
  forecast: number[]; upper: number[]; lower: number[]; actual: number[]; height?: number;
}) {
  const w = 1100, h = height, pad = 28;
  const max = Math.max(...upper) * 1.05, min = 0;
  const x = (i: number) => pad + (i / (forecast.length - 1)) * (w - pad * 2);
  const y = (v: number) => pad + (h - pad * 2) * (1 - (v - min) / (max - min));
  const band = [
    ...upper.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`),
    ...lower.map((v, i) => `${x(lower.length - 1 - i).toFixed(1)},${y(lower[lower.length - 1 - i]).toFixed(1)}`),
  ].join(" ");
  const fLine = forecast.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const aLine = actual.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h + 24}`} className="w-full">
      <polygon points={band} fill="#3b82f6" fillOpacity="0.08"/>
      <polyline points={fLine} fill="none" stroke="#3b82f6" strokeOpacity="0.7" strokeWidth="1.8" strokeDasharray="4 3"/>
      <polyline points={aLine} fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round"/>
      {Array.from({ length: 8 }, (_, i) => i * 2).map(i => (
        <text key={i} x={x(i)} y={h + 16} fontSize="10" fill="#475569" fontFamily="ui-monospace" textAnchor="middle">d{i + 1}</text>
      ))}
      <g transform={`translate(${pad}, ${h + 14})`}>
        <line x1="0" y1="0" x2="14" y2="0" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 3"/>
        <text x="20" y="3" fontSize="10" fill="#94a3b8">forecast</text>
        <line x1="80" y1="0" x2="94" y2="0" stroke="#22c55e" strokeWidth="2.2"/>
        <text x="100" y="3" fontSize="10" fill="#94a3b8">actual</text>
      </g>
    </svg>
  );
}

function YieldChart({ points, status }: { points: BackendYieldTelemetryPoint[]; status: string }) {
  if (status === "loading") {
    return <div className="text-[12px] text-slate-500 py-6 text-center">Loading yield telemetry…</div>;
  }
  if (points.length === 0) {
    return <div className="text-[12px] text-slate-500 py-6 text-center">No yield telemetry available.</div>;
  }
  const line1 = points.filter(p => p.line_id === "line_1");
  const target = line1[0]?.target_pct ?? 97.1;
  const w = 540, h = 200, pad = 24;
  const n = line1.length;
  const x = (i: number) => pad + (i / Math.max(n - 1, 1)) * (w - pad * 2);
  const y = (v: number) => pad + (h - pad * 2) * (1 - (v - 90) / 10);
  return (
    <svg viewBox={`0 0 ${w} ${h + 16}`} className="w-full">
      <line x1={pad} x2={w - pad} y1={y(target)} y2={y(target)} stroke="#64748b" strokeDasharray="3 3"/>
      <polyline points={line1.map((p, i) => `${x(i)},${y(p.actual_pct)}`).join(" ")} fill="none" stroke="#22c55e" strokeWidth="2"/>
      {line1.map((p, i) => p.actual_pct < 95 && (
        <circle key={i} cx={x(i)} cy={y(p.actual_pct)} r="3.5" fill="#ef4444"/>
      ))}
      <text x={pad} y={y(target) - 4} fontSize="9" fill="#64748b" fontFamily="ui-monospace">target {target}%</text>
    </svg>
  );
}

function WasteLog({ events, status }: { events: BackendWasteEvent[]; status: string }) {
  if (status === "loading") {
    return <div className="text-[12px] text-slate-500 py-6 text-center">Loading waste events…</div>;
  }
  if (events.length === 0) {
    return <div className="text-[12px] text-slate-500 py-6 text-center">No waste events recorded.</div>;
  }
  return (
    <div className="text-[12px]">
      <div className="grid grid-cols-[60px_100px_1fr_60px_70px_1fr_30px] gap-2 text-[10px] uppercase tracking-wider text-slate-500 px-1 pb-1">
        <span>Time</span><span>Lot</span><span>Ingredient</span><span className="text-right">kg</span><span className="text-right">$</span><span>Reason</span><span></span>
      </div>
      <div className="divide-y divide-slate-800/60">
        {events.slice(0, 8).map((e) => {
          const t = new Date(e.ts);
          const ts = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          return (
            <div key={e.event_id} className="grid grid-cols-[60px_100px_1fr_60px_70px_1fr_30px] gap-2 py-2 items-center">
              <span className="font-mono text-slate-500">{ts}</span>
              <span className="font-mono text-slate-400 truncate">{e.lot_id ? e.lot_id.toUpperCase() : "—"}</span>
              <span className="text-slate-200 truncate">{e.ingredient_name}</span>
              <span className={`text-right font-mono tabular-nums ${e.quantity_kg > 0 ? "text-slate-200" : "text-slate-600"}`}>{e.quantity_kg.toFixed(1)}</span>
              <span className={`text-right font-mono tabular-nums ${e.avoided ? "text-emerald-300" : "text-slate-200"}`}>${e.value_usd}</span>
              <span className="text-slate-400 truncate">{e.reason}</span>
              <span>{e.avoided && <Icon name="check" size={12} className="text-emerald-400"/>}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SupplierSlideIn({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const { data: liveOrders, status: ordersStatus } = useSupplierOrders(supplier.id);
  const weeks = Array.from({ length: 12 }, (_, i) => i + 1);
  const onTime = weeks.map((_, i) => Math.max(0.7, Math.min(1, supplier.onTime + Math.sin(i * 0.7) * 0.08 - (i === 11 ? 0.05 : 0))));
  const fill   = weeks.map((_, i) => Math.max(0.75, Math.min(1, supplier.fill + Math.cos(i * 0.6) * 0.05)));
  const win    = weeks.map((_, i) => Math.max(0.6, Math.min(1, supplier.window + Math.sin(i * 0.5 + 1) * 0.07)));
  const priceIdx = weeks.map((_, i) => 1 + Math.sin(i * 0.4) * 0.06);
  const priceSup = weeks.map((_, i) => priceIdx[i] + supplier.priceVsBench + Math.sin(i * 0.6 + 2) * 0.02);

  return (
    <div className="fixed top-14 right-0 bottom-12 z-30 w-[640px] bg-[#0c111c] border-l border-slate-800 shadow-2xl flex flex-col">
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <ReliabilityHalo score={supplier.onTime} disrupt={supplier.status === "disrupt"} size={36}>
            <span className="text-[10px] font-mono font-bold text-slate-100">{supplier.name.split(" ").map(w => w[0]).join("").slice(0, 2)}</span>
          </ReliabilityHalo>
          <div>
            <div className="text-[15px] font-semibold text-slate-100">{supplier.name}</div>
            <div className="text-[11px] text-slate-500 font-mono">Tier {supplier.tier} · contract expires {supplier.contractExpiry}</div>
          </div>
          <MOQTaxBadge amount={supplier.moqTaxQtd}/>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Icon name="x" size={18}/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Fill rate",   value: `${(supplier.fill * 100).toFixed(0)}%` },
            { label: "On-time",     value: `${(supplier.onTime * 100).toFixed(0)}%` },
            { label: "Window",      value: `${(supplier.window * 100).toFixed(0)}%` },
            { label: "Avg latency", value: `−2.4 h`, tone: "green" },
          ].map((c, i) => (
            <div key={i} className="rounded-md border border-slate-800 bg-slate-900/40 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{c.label}</div>
              <div className={`text-[18px] font-mono tabular-nums mt-0.5 ${c.tone === "green" ? "text-emerald-300" : "text-slate-100"}`}>{c.value}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400 font-semibold mb-2">Performance · last 12 weeks</div>
          <div className="rounded-md border border-slate-800 bg-slate-950/40 p-4">
            <LineChart series={[
              { values: onTime, color: "#22c55e", label: "On-time" },
              { values: fill,   color: "#3b82f6", label: "Fill" },
              { values: win,    color: "#a855f7", label: "Window" },
            ]} yMin={0.6} yMax={1}/>
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400 font-semibold mb-2">Price vs commodity benchmark</div>
          <div className="rounded-md border border-slate-800 bg-slate-950/40 p-4">
            <LineChart series={[
              { values: priceIdx, color: "#64748b", label: "Index", dashed: true },
              { values: priceSup, color: "#f59e0b", label: "Supplier" },
            ]} yMin={0.85} yMax={1.15}/>
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400 font-semibold mb-2">
            Active orders {ordersStatus === "live" && <span className="text-emerald-400 normal-case font-normal">· live</span>}
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/40 divide-y divide-slate-800/60">
            {ordersStatus === "loading" && (
              <div className="px-3 py-3 text-[12px] text-slate-500">Loading orders…</div>
            )}
            {ordersStatus !== "loading" && liveOrders.length === 0 && (
              <div className="px-3 py-3 text-[12px] text-slate-500">No active orders found.</div>
            )}
            {liveOrders.map((p, i) => {
              const totalKg = p.items.reduce((s, it) => s + it.quantity_kg, 0);
              return (
                <div key={i} className="px-3 py-2 flex items-center gap-3 text-[12px]">
                  <span className="font-mono text-slate-400 w-24">{p.order_id.toUpperCase()}</span>
                  <span className="text-slate-200 flex-1">{p.items[0]?.ingredient_id.replace(/_/g, " ") || "—"}</span>
                  <span className="font-mono tabular-nums text-slate-300 w-20 text-right">{totalKg.toLocaleString()} kg</span>
                  <span className="font-mono text-slate-500 w-44">{p.delivery_date}</span>
                  <Pill tone={p.status === "delivered" ? "green" : p.status === "in-transit" ? "blue" : "ghost"}>{p.status}</Pill>
                </div>
              );
            })}
          </div>
        </div>
        {supplier.moqTaxQtd > 3000 && (
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-amber-300 font-semibold mb-2 flex items-center gap-2"><Icon name="warn" size={12}/>Pending negotiation draft</div>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.04] p-4">
              <div className="text-[13px] text-slate-100 font-medium mb-2">Subject: Quarterly MOQ review — T55 flour</div>
              <div className="text-[12px] text-slate-400 leading-relaxed mb-3">Over the past 90 days, we&apos;ve absorbed $3,210 in MOQ overage on T55 flour orders, driven by a 4,200 kg floor against a 3,610 kg trailing average. Proposing a revised floor of 3,800 kg in exchange for a 0.5% volume rebate at quarter-end…</div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 rounded-md bg-blue-500 hover:bg-blue-400 text-blue-950 font-semibold text-[12px]">Send</button>
                <button className="px-3 py-1.5 rounded-md border border-slate-700 hover:border-slate-500 text-[12px] text-slate-200">Edit</button>
                <button className="px-3 py-1.5 rounded-md text-[12px] text-red-400">Discard</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SuppliersTab({ openChatContext }: { openChatContext?: (ctx: string) => void }) {
  const [activeSupplier, setActiveSupplier] = useState<Supplier | null>(null);
  const { data: suppliers, status: supplierStatus } = useSuppliers();
  const summary = [
    { label: "Active suppliers", value: suppliers.length, tone: "slate" },
    { label: "At risk",          value: suppliers.filter(s => s.status !== "ok").length, tone: "amber" },
    { label: "Pending drafts",   value: 2,  tone: "blue" },
    { label: "Expiring < 60d",   value: 3,  tone: "amber" },
  ];
  return (
    <>
      <div className="grid grid-cols-4 gap-3 mb-5">
        {summary.map((s, i) => (
          <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</div>
            <div className={`mt-1 text-3xl font-semibold font-mono tabular-nums ${s.tone === "amber" ? "text-amber-300" : s.tone === "blue" ? "text-blue-300" : "text-slate-100"}`}>{s.value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900/30 overflow-hidden mb-6">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              {["Supplier", "Tier", "On-time", "Fill", "Window", "Price vs bench", "MOQ-tax QTD", "Contract expiry", "Status", "Actions"].map((h, i) => (
                <th key={i} className={`px-3 py-2 text-left font-semibold ${[2,3,4,5,6].includes(i) ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suppliers.map(s => {
              const rowTone = s.status === "disrupt" ? "bg-red-500/[0.06]" : s.status === "warn" ? "bg-amber-500/[0.04]" : "";
              return (
                <tr key={s.id} onClick={() => setActiveSupplier(s)} className={`border-t border-slate-800/80 hover:bg-slate-800/40 cursor-pointer transition ${rowTone}`}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <ReliabilityHalo score={s.onTime} disrupt={s.status === "disrupt"} size={28}>
                        <span className="text-[9px] font-mono font-bold text-slate-200">{s.name.split(" ").map(w => w[0]).join("").slice(0,2)}</span>
                      </ReliabilityHalo>
                      <span className="text-slate-100">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5"><Pill tone={s.tier === 1 ? "blue" : "ghost"}>Tier {s.tier}</Pill></td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">{(s.onTime * 100).toFixed(0)}%</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">{(s.fill * 100).toFixed(0)}%</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">{(s.window * 100).toFixed(0)}%</td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${s.priceVsBench < 0 ? "text-emerald-300" : s.priceVsBench > 0.04 ? "text-red-300" : "text-amber-300"}`}>{(s.priceVsBench * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2.5 text-right">
                    {s.moqTaxQtd > 0 ? <span className={`font-mono tabular-nums ${s.moqTaxQtd > 3000 ? "text-red-300" : "text-amber-300"}`}>${s.moqTaxQtd.toLocaleString()}</span> : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-300">{s.contractExpiry}</td>
                  <td className="px-3 py-2.5">
                    {s.status === "ok" && <Pill tone="green"><Dot tone="green"/>Healthy</Pill>}
                    {s.status === "warn" && <Pill tone="amber"><Dot tone="amber"/>Watch</Pill>}
                    {s.status === "disrupt" && <Pill tone="redPulse"><Dot tone="red" pulse/>Disrupted</Pill>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      {s.moqTaxQtd > 3000 && <button onClick={e => e.stopPropagation()} className="px-1.5 py-0.5 text-[11px] rounded border border-red-500/40 bg-red-500/10 text-red-200">View draft</button>}
                      <button onClick={e => e.stopPropagation()} className="px-1.5 py-0.5 text-[11px] rounded border border-slate-700 hover:border-blue-500 text-slate-300">Place PO</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <SectionHeader title="MOQ-tax ledger" sub="Per-supplier over-ordering cost · progress toward $3K negotiation threshold"/>
      <div className="rounded-lg border border-slate-800 bg-slate-900/30 divide-y divide-slate-800/60">
        {suppliers.filter(s => s.moqTaxQtd > 0).map(s => (
          <div key={s.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[14px] text-slate-100 font-medium">{s.name}</span>
                <Pill tone="ghost">Tier {s.tier}</Pill>
              </div>
              <div className="font-mono text-[14px] tabular-nums">
                <span className={s.moqTaxQtd > 3000 ? "text-red-300" : "text-amber-300"}>${s.moqTaxQtd.toLocaleString()}</span>
                <span className="text-slate-500"> / $3,000 threshold</span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className={`h-full ${s.moqTaxQtd > 3000 ? "bg-red-500" : "bg-amber-500"}`} style={{ width: `${Math.min(100, (s.moqTaxQtd / 3000) * 100)}%` }}/>
            </div>
            <div className="mt-2 text-[11px] font-mono text-slate-500 flex gap-4">
              <span>4 orders this quarter</span>
              <span>avg overage 280 kg</span>
              <span>holding $0.41/kg/d × 6.4 d avg</span>
              {s.moqTaxQtd > 3000 && <span className="ml-auto text-red-300">▲ over threshold — draft negotiation ready</span>}
            </div>
          </div>
        ))}
      </div>
      {activeSupplier && <SupplierSlideIn supplier={activeSupplier} onClose={() => setActiveSupplier(null)}/>}
    </>
  );
}

function PerformanceTab() {
  const { data: esg, status: esgStatus } = useEsgCounter();
  const { data: wasteEvents, status: wasteStatus } = useWasteEvents();
  const { data: telemetry, status: telemetryStatus } = useYieldTelemetry();
  const [selectedSku, setSelectedSku] = useState<string | undefined>(undefined);
  const { data: forecasts, status: forecastStatus } = useDemandForecasts(selectedSku);

  const live = esgStatus === "live";
  const wasteValue = live && esg.wasteAvoided !== undefined ? `$${esg.wasteAvoided.toLocaleString()}` : "--";
  const co2Value = live && esg.co2eSaved !== undefined ? `${esg.co2eSaved} t` : "--";
  const moqValue = live && esg.moqTaxYtd !== undefined ? `$${esg.moqTaxYtd.toLocaleString()}` : "--";
  const disruptValue = live && esg.disruptionsCaught !== undefined ? String(esg.disruptionsCaught) : "--";

  const tiles = [
    { label: "Waste Avoided",      value: wasteValue,   sub: live ? "live · waste_events" : "loading…", spark: [120, 134, 142, 138, 155, 168, 175, 184], tone: "green" },
    { label: "CO2e Saved",         value: co2Value,     sub: live ? "live · esg/counter" : "loading…",  spark: [2, 4, 5, 6, 8, 9, 11, 12],              tone: "green" },
    { label: "MOQ-Tax YTD",        value: moqValue,     sub: live ? "live · esg/counter" : "loading…",  spark: [1, 2, 3, 4, 5, 6, 7, 8],               tone: "amber" },
    { label: "Disruptions Caught", value: disruptValue, sub: live ? "live · esg/counter" : "loading…",  spark: [3, 5, 7, 9, 12, 18, 28, 47],           tone: "blue"  },
  ];

  const forecastActual = forecasts.slice(0, 7).map(f => f.expected * (0.94 + Math.random() * 0.1));
  const forecastExpected = forecasts.map(f => f.expected);
  const forecastUpper = forecasts.map(f => f.high);
  const forecastLower = forecasts.map(f => f.low);

  return (
    <>
      <div className="grid grid-cols-4 gap-3 mb-6">
        {tiles.map((t, i) => (
          <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{t.label}</div>
            <div className={`mt-1 text-[34px] font-semibold font-mono tabular-nums leading-none ${t.tone === "green" ? "text-emerald-300" : t.tone === "amber" ? "text-amber-300" : "text-blue-300"}`}>{t.value}</div>
            <div className="mt-1 text-[11px] font-mono text-slate-500 flex items-center justify-between gap-2">
              <span>{t.sub}</span>
              <Sparkline values={t.spark} color={t.tone === "green" ? "#22c55e" : t.tone === "amber" ? "#f59e0b" : "#3b82f6"} width={80} height={20}/>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[14px] font-semibold text-slate-100">14-day demand forecast</div>
            <div className="text-[11px] text-slate-500 font-mono">
              {selectedSku ?? "all SKUs"} · all retailers · 80% confidence band
              {forecastStatus === "live" && <span className="text-emerald-400 ml-2">· live</span>}
            </div>
          </div>
          <select
            className="bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-[12px] text-slate-200"
            onChange={e => setSelectedSku(e.target.value || undefined)}
          >
            <option value="">All SKUs</option>
            {SKUS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {forecastStatus === "loading" ? (
          <div className="text-[12px] text-slate-500 py-6 text-center">Loading forecast…</div>
        ) : forecasts.length === 0 ? (
          <div className="text-[12px] text-slate-500 py-6 text-center">No forecast data available.</div>
        ) : (
          <ForecastChart forecast={forecastExpected} upper={forecastUpper} lower={forecastLower} actual={forecastActual}/>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[14px] font-semibold text-slate-100">Yield · actual vs theoretical</div>
              <div className="text-[11px] text-slate-500 font-mono">
                14-day · line_1
                {telemetryStatus === "live" && <span className="text-emerald-400 ml-2">· live</span>}
              </div>
            </div>
          </div>
          <YieldChart points={telemetry} status={telemetryStatus}/>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[14px] font-semibold text-slate-100">Waste events log</div>
              <div className="text-[11px] text-slate-500 font-mono">
                append-only · exportable
                {wasteStatus === "live" && <span className="text-emerald-400 ml-2">· live</span>}
              </div>
            </div>
            <button className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-slate-500 text-[11px] text-slate-200">Export CSV</button>
          </div>
          <WasteLog events={wasteEvents} status={wasteStatus}/>
        </div>
      </div>
      <div className="mt-6 rounded-lg border border-slate-800 bg-gradient-to-br from-emerald-500/[0.05] to-transparent p-5 flex items-center gap-4">
        <Icon name="leaf" size={24} className="text-emerald-400"/>
        <div className="flex-1">
          <div className="text-[14px] font-semibold text-slate-100">Scope 3 emissions report</div>
          <div className="text-[12px] text-slate-400 mt-0.5">PDF · waste avoided per SKU, CO2e saved, full methodology</div>
        </div>
        <button
          onClick={() => window.open(`${BACKEND_URL}/api/esg/scope3.pdf`, "_blank")}
          className="px-3 py-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-semibold text-[12px]"
        >Generate PDF</button>
      </div>
    </>
  );
}

function ScorecardInner() {
  const { openChatContext } = useApp();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState("performance");

  useEffect(() => {
    setTab(searchParams.get("tab") === "suppliers" ? "suppliers" : "performance");
  }, [searchParams]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1600px] mx-auto">
        <SectionHeader
          title="Scorecard"
          sub="Supplier performance · ESG · forecast vs. actuals"
          right={
            <div className="flex items-center gap-1 p-0.5 rounded-md border border-slate-800 bg-slate-900/40">
              {[{ id: "suppliers", label: "Suppliers" }, { id: "performance", label: "Performance" }].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 rounded-md text-[12px] ${tab === t.id ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>{t.label}</button>
              ))}
            </div>
          }
        />
        {tab === "suppliers" ? <SuppliersTab openChatContext={openChatContext}/> : <PerformanceTab/>}
      </div>
    </div>
  );
}

export default function ScorecardPage() {
  return (
    <Suspense fallback={<div className="h-full bg-[#0a0d14]" />}>
      <ScorecardInner />
    </Suspense>
  );
}
