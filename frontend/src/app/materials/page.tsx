"use client";
import { useState, useMemo } from "react";
import { useApp } from "../../lib/context";
import { Icon } from "../../components/Icon";
import { Pill, RiskBar, StatusBadge, SectionHeader } from "../../components/atoms";
import { FACILITIES, Lot } from "../../lib/data";
import { useLots } from "../../lib/hooks";

const FILTER_FACILITY = [
  { id: "all", label: "All" },
  ...FACILITIES.filter(f => f.id !== "all").map(f => ({ id: f.id, label: f.name })),
];
const FILTER_STORAGE = ["All", "Frozen", "Refrigerated", "Dry"];
const FILTER_RISK = ["All", "OK", "At Risk", "Critical", "Expired"];

function ChipGroup({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { id: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">{label}</span>
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`px-2 h-7 rounded-md text-[12px] border transition ${value === o.id ? "bg-blue-500/15 text-blue-200 border-blue-500/40" : "bg-transparent text-slate-400 border-slate-800 hover:border-slate-600 hover:text-slate-200"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LotSlideIn({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const substitutes = [
    { name: "Lemon zest paste",     facility: "P1", qty: 38,  compat: 0.98, allergen: "none", rank: 1 },
    { name: "Raspberries (frozen)", facility: "P3", qty: 96,  compat: 0.92, allergen: "none", rank: 2 },
    { name: "Chocolate chips",      facility: "P4", qty: 220, compat: 0.85, allergen: "milk", rank: 3 },
  ];
  return (
    <div className="fixed top-14 right-0 bottom-12 z-30 w-[640px] bg-[#0c111c] border-l border-slate-800 shadow-2xl flex flex-col">
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-800">
        <div>
          <div className="font-mono text-[11px] text-slate-500">{lot.id}</div>
          <div className="text-[15px] font-semibold text-slate-100">{lot.ingredient}</div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Icon name="x" size={18}/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Quantity",  value: `${lot.qty.toLocaleString()} kg` },
            { label: "Facility",  value: lot.facility.toUpperCase() },
            { label: "Expiry",    value: lot.expiry, tone: lot.daysLeft <= 2 ? "red" : lot.daysLeft <= 5 ? "amber" : null },
            { label: "Days left", value: `${lot.daysLeft}d`, tone: lot.daysLeft <= 2 ? "red" : lot.daysLeft <= 5 ? "amber" : null },
          ].map((c, i) => (
            <div key={i} className="rounded-md border border-slate-800 bg-slate-900/40 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{c.label}</div>
              <div className={`text-[16px] font-mono tabular-nums mt-0.5 ${c.tone === "red" ? "text-red-300" : c.tone === "amber" ? "text-amber-300" : "text-slate-100"}`}>{c.value}</div>
            </div>
          ))}
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400 font-semibold mb-2">Substitution candidates</div>
          <div className="space-y-1.5">
            {substitutes.map((s, i) => (
              <div key={i} className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-900/40 p-2.5">
                <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[11px] font-mono text-slate-300">{s.rank}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-slate-100">{s.name}</div>
                  <div className="text-[11px] font-mono text-slate-500">{s.facility} · {s.qty} kg avail · allergen {s.allergen}</div>
                </div>
                <div className="text-right">
                  <div className="text-[14px] font-mono tabular-nums text-emerald-300">{Math.round(s.compat * 100)}%</div>
                  <div className="text-[10px] text-slate-500">compat</div>
                </div>
                <button className="px-2.5 py-1.5 rounded-md bg-blue-500 hover:bg-blue-400 text-blue-950 font-semibold text-[12px]">Use</button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400 font-semibold mb-2">Lot genealogy</div>
          <div className="rounded-md border border-slate-800 bg-slate-950/40 p-4">
            <svg viewBox="0 0 600 200" className="w-full">
              {[
                { x: 50, y: 100, label: "LOT-21884", sub: "blueberries", color: "#3b82f6" },
                { x: 210, y: 60, label: "R-9412", sub: "muffin run", color: "#64748b" },
                { x: 210, y: 140, label: "R-9413", sub: "lpm run", color: "#64748b" },
                { x: 400, y: 50, label: "PLT-4421", sub: "Costco", color: "#22c55e" },
                { x: 400, y: 110, label: "PLT-4422", sub: "Walmart", color: "#22c55e" },
                { x: 400, y: 170, label: "PLT-4423", sub: "Loblaws", color: "#22c55e" },
              ].map((n, i) => {
                const w = 56;
                return (
                  <g key={i} transform={`translate(${n.x}, ${n.y})`}>
                    <rect x={-w/2} y="-18" width={w} height="36" rx="6" fill="#0c111c" stroke={n.color} strokeWidth="1.4"/>
                    <text textAnchor="middle" y="-3" fontSize="10" fontWeight="600" fill="#e2e8f0" fontFamily="ui-monospace, monospace">{n.label}</text>
                    <text textAnchor="middle" y="10" fontSize="9" fill="#64748b">{n.sub}</text>
                  </g>
                );
              })}
              {[
                { from: [78, 100], to: [182, 60], label: "0.8 kg" },
                { from: [78, 100], to: [182, 140], label: "0 kg" },
                { from: [238, 60], to: [372, 50], label: "2,400 u" },
                { from: [238, 60], to: [372, 110], label: "2,400 u" },
                { from: [238, 140], to: [372, 170], label: "5,200 u" },
              ].map((e, i) => {
                const mx = (e.from[0] + e.to[0]) / 2;
                return (
                  <g key={i}>
                    <path d={`M ${e.from[0]} ${e.from[1]} C ${mx} ${e.from[1]}, ${mx} ${e.to[1]}, ${e.to[0]} ${e.to[1]}`} fill="none" stroke="#334155" strokeWidth="1"/>
                    <text x={mx} y={(e.from[1] + e.to[1]) / 2 - 3} textAnchor="middle" fontSize="9" fill="#64748b" fontFamily="ui-monospace, monospace">{e.label}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MaterialsPage() {
  const { openChatContext } = useApp();
  const [facility, setFacility] = useState("all");
  const [storage, setStorage] = useState("All");
  const [risk, setRisk] = useState("All");
  const [sort, setSort] = useState("risk");
  const [query, setQuery] = useState("");
  const [activeLot, setActiveLot] = useState<Lot | null>(null);
  const { data: lots, status: backendStatus } = useLots();

  const filtered = useMemo(() => {
    let l = lots.slice();
    if (facility !== "all") l = l.filter(x => x.facility === facility);
    if (storage !== "All") l = l.filter(x => x.storage === storage.toLowerCase());
    if (risk !== "All") {
      const map: Record<string, string> = { "OK": "ok", "At Risk": "warn", "Critical": "critical", "Expired": "expired" };
      l = l.filter(x => x.status === map[risk]);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      l = l.filter(x => x.ingredient.toLowerCase().includes(q) || x.id.toLowerCase().includes(q));
    }
    if (sort === "risk")     l.sort((a, b) => b.risk - a.risk);
    if (sort === "expiry")   l.sort((a, b) => a.daysLeft - b.daysLeft);
    if (sort === "qty")      l.sort((a, b) => b.qty - a.qty);
    if (sort === "facility") l.sort((a, b) => a.facility.localeCompare(b.facility));
    return l;
  }, [lots, facility, storage, risk, sort, query]);

  const horizon = useMemo(() => {
    const groups: Record<string, { ingredient: string; total: number }> = {};
    lots.forEach(l => {
      if (!groups[l.ingredient]) groups[l.ingredient] = { ingredient: l.ingredient, total: 0 };
      groups[l.ingredient].total += l.qty;
    });
    return Object.values(groups).map(g => {
      const burn = Math.max(0.5, g.total * 0.1);
      const days = Math.min(60, Math.round(g.total / burn));
      const leadTime = 5;
      return { ...g, burn, days, leadTime, needReorder: days <= leadTime + 2 };
    }).sort((a, b) => a.days - b.days).slice(0, 10);
  }, [lots]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1600px] mx-auto">
        <SectionHeader
          title="Inventory"
          sub={`${lots.length} active lots · ${lots.filter(l => l.status === "critical").length} critical · ${lots.filter(l => l.status === "warn").length} at risk · ${backendStatus === "live" ? "live data" : backendStatus === "loading" ? "loading…" : "offline (seed data)"}`}
          right={
            <button onClick={() => openChatContext("Inventory · all plants")} className="px-3 py-1.5 rounded-md border border-slate-700 hover:border-blue-500 text-[12px] text-slate-200 flex items-center gap-2">
              <Icon name="chat" size={13}/> Ask copilot about inventory
            </button>
          }
        />

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <ChipGroup label="Facility" value={facility} onChange={setFacility} options={FILTER_FACILITY}/>
            <span className="w-px h-5 bg-slate-800"/>
            <ChipGroup label="Storage" value={storage} onChange={setStorage} options={FILTER_STORAGE.map(x => ({ id: x, label: x }))}/>
            <span className="w-px h-5 bg-slate-800"/>
            <ChipGroup label="Risk" value={risk} onChange={setRisk} options={FILTER_RISK.map(x => ({ id: x, label: x }))}/>
            <div className="flex-1"/>
            <div className="flex items-center gap-2 rounded-md border border-slate-800 px-2 h-8">
              <Icon name="search" size={13} className="text-slate-500"/>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search ingredient or lot ID"
                     className="bg-transparent outline-none text-[12px] text-slate-100 placeholder:text-slate-500 w-48"/>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span>Sort</span>
              <select value={sort} onChange={e => setSort(e.target.value)} className="bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-[12px] text-slate-200">
                <option value="risk">Spoilage Risk</option>
                <option value="expiry">Expiry Date</option>
                <option value="qty">Quantity</option>
                <option value="facility">Facility</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/30 overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                {["Lot ID", "Ingredient", "Facility", "Qty (kg)", "Expiry", "Days left", "Storage", "Risk score", "Status", "Actions"].map((h, i) => (
                  <th key={i} className={`px-3 py-2 text-left font-semibold ${[3, 5].includes(i) ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} onClick={() => setActiveLot(l)} className="border-t border-slate-800/80 hover:bg-slate-800/40 cursor-pointer transition">
                  <td className="px-3 py-2.5 font-mono text-slate-400">{l.id}</td>
                  <td className="px-3 py-2.5 text-slate-100">{l.ingredient}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-300">{l.facility.toUpperCase()}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">{l.qty.toLocaleString()}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-400">{l.expiry}</td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${l.daysLeft <= 2 ? "text-red-300" : l.daysLeft <= 5 ? "text-amber-300" : "text-slate-300"}`}>{l.daysLeft}d</td>
                  <td className="px-3 py-2.5">
                    <Pill tone={l.storage === "frozen" ? "blue" : l.storage === "refrigerated" ? "teal" : "ghost"}>{l.storage}</Pill>
                  </td>
                  <td className="px-3 py-2.5"><RiskBar value={l.risk}/></td>
                  <td className="px-3 py-2.5"><StatusBadge status={l.status}/></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={e => { e.stopPropagation(); setActiveLot(l); }} className="px-1.5 py-0.5 text-[11px] rounded border border-slate-700 hover:border-blue-500 text-slate-300">Substitute</button>
                      <button onClick={e => e.stopPropagation()} className="px-1.5 py-0.5 text-[11px] rounded border border-slate-700 hover:border-blue-500 text-slate-300">Transfer</button>
                      <button onClick={e => e.stopPropagation()} className="px-1.5 py-0.5 text-[11px] rounded text-red-400 hover:text-red-300">Write off</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6">
          <SectionHeader title="Stock horizon" sub="Days of stock remaining at current consumption rate. Red marker = reorder by lead time."/>
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4 space-y-2">
            {horizon.map((h, i) => (
              <div key={i} className="grid grid-cols-[200px_1fr_auto] items-center gap-3">
                <div className="text-[12px] text-slate-300 truncate">{h.ingredient}</div>
                <div className="relative h-5 rounded bg-slate-800/60 overflow-hidden">
                  <div className={`h-full ${h.needReorder ? "bg-amber-500/40" : "bg-emerald-500/30"}`} style={{ width: `${Math.min(100, (h.days / 60) * 100)}%` }}/>
                  <div className="absolute top-0 bottom-0 w-[2px] bg-red-500" style={{ left: `${(h.leadTime / 60) * 100}%` }}/>
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-300">{h.days}d · {h.burn.toFixed(1)} kg/d</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {activeLot && <LotSlideIn lot={activeLot} onClose={() => setActiveLot(null)}/>}
    </div>
  );
}
