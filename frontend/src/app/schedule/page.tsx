"use client";
import { useState, useMemo } from "react";
import { useApp } from "../../lib/context";
import { Icon } from "../../components/Icon";
import { Pill, SectionHeader } from "../../components/atoms";
import { PRODUCTION_RUNS, FACILITIES, SKUS, ProductionRun } from "../../lib/data";

const HOUR_W = 56;
const LANE_H = 44;
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

function GanttLane({ lane, hours }: { lane: { key: string; plant: string; line: number; runs: ProductionRun[] }; hours: number[] }) {
  const sku = (id: string) => SKUS.find(s => s.id === id);
  return (
    <div className="relative border-b border-slate-800/60" style={{ height: LANE_H, width: hours.length * HOUR_W }}>
      {hours.map((h, i) => (
        <div key={h} className="absolute top-0 bottom-0 border-r border-slate-800/40" style={{ left: i * HOUR_W }}/>
      ))}
      <div className="absolute top-0 bottom-0 w-[2px] bg-blue-400/70 z-10" style={{ left: (10 - hours[0]) * HOUR_W }}>
        <div className="absolute -top-2 -translate-x-1/2 text-[9px] font-mono text-blue-300 whitespace-nowrap">now · 10:00</div>
      </div>
      {lane.runs.map(r => {
        const left = (r.start - hours[0]) * HOUR_W;
        const width = (r.end - r.start) * HOUR_W;
        const tileColor = r.risk === "red" ? "border-l-red-500" : r.risk === "amber" ? "border-l-amber-500" : "border-l-emerald-500/70";
        const bg = r.risk === "red" ? "bg-red-500/[0.06]" : r.risk === "amber" ? "bg-amber-500/[0.06]" : "bg-slate-800/40";
        const allergenTone = r.allergen === "nuts" ? "red" : r.allergen === "milk" ? "amber" : "slate";
        return (
          <div key={r.id} className={`absolute top-1 bottom-1 rounded-md border border-slate-700 border-l-2 ${tileColor} ${bg} flex items-center px-2 gap-2 hover:border-slate-500 cursor-pointer group`}
               style={{ left: left + 2, width: width - 4 }}>
            <span className="text-[11px] text-slate-100 truncate">{sku(r.sku)?.name || r.sku}</span>
            <span className="text-[10px] font-mono text-slate-500 tabular-nums shrink-0">{(r.qty / 1000).toFixed(1)}k</span>
            {r.allergen !== "none" && <Pill tone={allergenTone === "red" ? "red" : allergenTone === "amber" ? "amber" : "ghost"} className="shrink-0">{r.allergen}</Pill>}
            <div className="absolute top-full mt-1 left-0 z-20 hidden group-hover:block w-64 rounded-md border border-slate-700 bg-slate-900 p-2.5 shadow-xl text-[11px]">
              <div className="font-mono text-slate-400 mb-1">{r.id}</div>
              <div className="text-slate-100 mb-1.5">{sku(r.sku)?.name}</div>
              <div className="text-slate-500">Lots consumed:</div>
              {r.lots.map(l => <div key={l} className="font-mono text-slate-300">· {l}</div>)}
              <div className="mt-1.5 pt-1.5 border-t border-slate-800 flex justify-between"><span className="text-slate-500">yield est</span><span className="text-emerald-300 font-mono">96.4%</span></div>
            </div>
          </div>
        );
      })}
      {lane.runs.length > 1 && lane.runs.slice(0, -1).map((r, i) => {
        const next = lane.runs[i + 1];
        const x = (next.start - HOURS[0]) * HOUR_W;
        if (r.allergen !== next.allergen && r.allergen !== "none" && next.allergen !== "none") {
          return (
            <div key={i} className="absolute top-0 bottom-0 border-l-2 border-dashed border-amber-500/60" style={{ left: x - 1 }}>
              <div className="absolute -top-2 left-1 text-[9px] font-mono text-amber-300 whitespace-nowrap bg-[#0a0d14] px-1">{r.allergen}→{next.allergen} · 90m</div>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function DiffMini({ runs }: { runs: { lane: string; start: number; end: number; sku: string; state: string; note?: string; risk?: boolean }[] }) {
  return (
    <div className="space-y-1.5">
      {runs.map((r, i) => {
        const left = (r.start - 6) / 18 * 100;
        const w = (r.end - r.start) / 18 * 100;
        const bg = r.state === "new" ? "border-dashed border-emerald-400 bg-emerald-500/10" : r.state === "moved" ? "border-blue-400 bg-blue-500/10" : "border-slate-700 bg-slate-800/40";
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="w-10 text-[10px] font-mono text-slate-500 shrink-0">{r.lane}</span>
            <div className="relative flex-1 h-6 rounded bg-slate-800/30">
              <div className={`absolute top-0 bottom-0 border-l-2 ${bg} rounded text-[10px] flex items-center px-1.5 gap-1`} style={{ left: `${left}%`, width: `${w}%` }}>
                <span className="text-slate-200 truncate">{r.sku}</span>
                {r.note && <span className="text-[9px] font-mono text-blue-300 ml-auto shrink-0">{r.note}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScheduleDiff() {
  return (
    <div className="mt-5 rounded-lg border border-blue-500/40 bg-blue-500/[0.04]">
      <div className="px-4 py-3 border-b border-blue-500/20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-blue-500/15 text-blue-300 flex items-center justify-center"><Icon name="diff" size={14}/></div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-blue-300 font-semibold">Agent proposal · SchedulerAgent</div>
            <div className="text-[14px] text-slate-100 font-medium">Reschedule to consume LOT-21884 before expiry + accommodate Costco PO spike</div>
          </div>
        </div>
        <Pill tone="blue" className="font-mono">v1 · 2 alternatives</Pill>
      </div>
      <div className="grid grid-cols-2 gap-px bg-slate-800">
        <div className="bg-slate-900/30 p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Before · current</div>
          <DiffMini runs={[
            { lane: "P1-L1", start: 10, end: 14, sku: "Lemon Poppy",  state: "current" },
            { lane: "P1-L1", start: 14, end: 18, sku: "Blueberry M.", state: "current", risk: true },
            { lane: "P1-L2", start: 8,  end: 14, sku: "Croissant",    state: "current" },
            { lane: "P1-L2", start: 14, end: 19, sku: "Cookie 24pk",  state: "current" },
          ]}/>
        </div>
        <div className="bg-slate-900/30 p-4">
          <div className="text-[10px] uppercase tracking-wider text-emerald-300 mb-2">After · proposed</div>
          <DiffMini runs={[
            { lane: "P1-L1", start: 10, end: 14, sku: "Blueberry M.",  state: "moved", note: "↑ 4h" },
            { lane: "P1-L1", start: 14, end: 18, sku: "Lemon Poppy",   state: "moved" },
            { lane: "P1-L2", start: 8,  end: 12, sku: "Croissant",     state: "current" },
            { lane: "P1-L2", start: 12, end: 17, sku: "Cookie 24pk",   state: "moved", note: "↑ 2h" },
            { lane: "P1-L2", start: 17, end: 20, sku: "Cookie 24pk +", state: "new" },
          ]}/>
        </div>
      </div>
      <div className="p-4 border-t border-blue-500/20 space-y-2">
        {[
          { txt: "P1-L1 blueberry muffin moved 14:00 → 10:00 — consumes LOT-21884 before tonight's expiry, saves $1,240 write-off", tone: "green" },
          { txt: "P1-L2 cookie run extended +3h (17:00 → 20:00) to fulfil Costco PO #C-882 spike (+35%) at 94% rate",               tone: "green" },
          { txt: "Walmart cookie ship moves Wed → Thu (within window) — no SLA impact",                                              tone: "slate" },
          { txt: "Adds 1 nut/nut-free changeover · +90 min idle on P4-L1 · offset by yield gain",                                    tone: "amber" },
        ].map((c, i) => (
          <div key={i} className="flex items-start gap-2 text-[12px]">
            <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${c.tone === "green" ? "bg-emerald-400" : c.tone === "amber" ? "bg-amber-400" : "bg-slate-500"}`}/>
            <span className="text-slate-200">{c.txt}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-px bg-slate-800 mx-4 mb-3 rounded-md overflow-hidden">
        {[
          { l: "Waste avoided", v: "$1,240", t: "green" },
          { l: "kg saved",      v: "0.8",    t: "green" },
          { l: "Changeover Δ",  v: "+1",     t: "amber" },
          { l: "Capacity",      v: "+2.4%",  t: "green" },
        ].map((s, i) => (
          <div key={i} className="bg-slate-900/80 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{s.l}</div>
            <div className={`text-[18px] font-mono tabular-nums ${s.t === "green" ? "text-emerald-300" : "text-amber-300"}`}>{s.v}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 pb-4 border-t border-blue-500/20 pt-3">
        <button className="py-2 rounded-md bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-semibold text-[13px]">Accept · generates ActionCard</button>
        <button className="px-3 py-2 rounded-md border border-slate-700 text-slate-200 text-[13px]">Compare alt</button>
        <button className="px-3 py-2 rounded-md text-red-400 text-[13px]">Reject</button>
      </div>
    </div>
  );
}

function WhatIfPanel({ onClose }: { onClose: () => void }) {
  const SimRun = ({ label, y, waste, cost, delta, active, risk }: { label: string; y: string; waste: string; cost: string; delta?: string; active?: boolean; risk?: boolean }) => (
    <div className={`rounded-md border p-2 flex items-center gap-2 ${active ? "border-purple-500/40 bg-purple-500/[0.06]" : risk ? "border-red-500/30 bg-red-500/[0.04]" : "border-slate-800 bg-slate-900/40"}`}>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-slate-100 truncate">{label}</div>
        <div className="text-[10px] font-mono text-slate-500 mt-0.5">y{y} · w{waste} · {cost}</div>
      </div>
      {delta && <span className={`text-[10px] font-mono ${risk ? "text-red-300" : "text-amber-300"}`}>{delta}</span>}
    </div>
  );
  return (
    <div className="fixed top-14 right-0 bottom-12 z-30 w-[420px] bg-[#0c111c] border-l border-slate-800 shadow-2xl flex flex-col">
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Icon name="spark" size={14} className="text-purple-400"/>
          <div className="text-[14px] font-semibold text-slate-100">What-if simulator</div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Icon name="x" size={16}/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {[
          { title: "Change retailer PO quantity", content: (
            <><select className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-[12px] text-slate-200"><option>Costco · SKU-BBM-12</option><option>Walmart · SKU-CCC-24</option></select><input defaultValue="16,800" className="w-full mt-2 bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-[12px] font-mono text-slate-100"/></>
          )},
          { title: "Remove a supplier lot", content: (
            <input placeholder="LOT-ID or ingredient" className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-[12px] font-mono text-slate-100"/>
          )},
          { title: "Block production line", content: (
            <div className="flex gap-2"><select className="flex-1 bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-[12px] text-slate-200"><option>P1-L2 · Plant 1 Line 2</option></select><input defaultValue="2h" className="w-16 bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-[12px] font-mono text-slate-100 text-right"/></div>
          )},
        ].map((b, i) => (
          <div key={i} className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">{b.title}</div>
            {b.content}
          </div>
        ))}
        <button className="w-full py-2.5 rounded-md bg-purple-500 hover:bg-purple-400 text-purple-950 font-semibold text-[13px] flex items-center justify-center gap-2">
          <Icon name="zap" size={14}/> Run simulation
        </button>
        <div className="pt-3 border-t border-slate-800">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Stack (compare runs)</div>
          <div className="space-y-1.5">
            <SimRun label="Baseline" y="96.2%" waste="$0" cost="$1.42M" active/>
            <SimRun label="+35% Costco" y="95.1%" waste="$420" cost="$1.46M" delta="+$36k"/>
            <SimRun label="+35% Costco · P1-L2 block 4h" y="93.4%" waste="$2,140" cost="$1.49M" delta="+$72k" risk/>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SchedulePage() {
  const { openChatContext } = useApp();
  const [plant, setPlant] = useState("all");
  const [showDiff, setShowDiff] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);

  const runs = useMemo(() => plant === "all" ? PRODUCTION_RUNS : PRODUCTION_RUNS.filter(r => r.plant === plant), [plant]);
  const lanes = useMemo(() => {
    const byKey: Record<string, { key: string; plant: string; line: number; runs: ProductionRun[] }> = {};
    runs.forEach(r => {
      const key = `${r.plant}-L${r.line}`;
      if (!byKey[key]) byKey[key] = { key, plant: r.plant, line: r.line, runs: [] };
      byKey[key].runs.push(r);
    });
    return Object.values(byKey).sort((a, b) => (a.plant + a.line).localeCompare(b.plant + b.line));
  }, [runs]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1600px] mx-auto">
        <SectionHeader
          title="Schedule"
          sub="Production runs across all plants · changeovers minimized by OR-Tools"
          right={
            <div className="flex items-center gap-2">
              <button onClick={() => openChatContext("Schedule · optimise")} className="px-3 py-1.5 rounded-md border border-slate-700 hover:border-blue-500 text-[12px] text-slate-200 flex items-center gap-2">
                <Icon name="chat" size={13}/> Ask copilot to optimise
              </button>
              <button onClick={() => setWhatIfOpen(o => !o)} className={`px-3 py-1.5 rounded-md text-[12px] flex items-center gap-2 ${whatIfOpen ? "bg-purple-500/15 text-purple-200 border border-purple-500/40" : "border border-slate-700 hover:border-blue-500 text-slate-200"}`}>
                <Icon name="spark" size={13}/> Run what-if
              </button>
            </div>
          }
        />

        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-1 p-0.5 rounded-md border border-slate-800 bg-slate-900/40">
            {[{ id: "all", label: "All" }, ...FACILITIES.filter(f => f.id !== "all").map(f => ({ id: f.id, label: f.name }))].map(t => (
              <button key={t.id} onClick={() => setPlant(t.id)} className={`px-2.5 py-1 rounded-md text-[12px] ${plant === t.id ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>{t.label}</button>
            ))}
          </div>
          <div className="text-[11px] font-mono text-slate-500">Mon 25 May · Tue 26 May · Wed 27 May</div>
          <div className="flex-1"/>
          <button onClick={() => setShowDiff(d => !d)} className={`px-2.5 py-1 rounded-md text-[12px] flex items-center gap-1.5 ${showDiff ? "bg-blue-500/15 text-blue-200 border border-blue-500/40" : "border border-slate-700 text-slate-300 hover:border-blue-500"}`}>
            <Icon name="diff" size={12}/> {showDiff ? "Hide" : "Show"} agent proposal
          </button>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/30 overflow-hidden">
          <div className="flex">
            <div className="w-40 shrink-0 border-r border-slate-800 bg-slate-900/60">
              <div className="h-8 border-b border-slate-800 px-3 flex items-center text-[10px] uppercase tracking-wider text-slate-500">Line</div>
              {lanes.map(ln => (
                <div key={ln.key} className="flex items-center px-3 border-b border-slate-800/60" style={{ height: LANE_H }}>
                  <span className="text-[11px] font-mono text-slate-400 w-10">{ln.plant.toUpperCase()}</span>
                  <span className="text-[13px] text-slate-200">Line {ln.line}</span>
                </div>
              ))}
            </div>
            <div className="flex-1 overflow-x-auto">
              <div style={{ width: HOURS.length * HOUR_W, minWidth: "100%" }}>
                <div className="h-8 flex border-b border-slate-800 bg-slate-900/60 sticky top-0">
                  {HOURS.map(h => (
                    <div key={h} className="border-r border-slate-800/60 text-[10px] font-mono text-slate-500 px-2 flex items-center" style={{ width: HOUR_W }}>
                      {String(h).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
                {lanes.map(ln => <GanttLane key={ln.key} lane={ln} hours={HOURS}/>)}
              </div>
            </div>
          </div>
        </div>

        {showDiff && <ScheduleDiff/>}
        {whatIfOpen && <WhatIfPanel onClose={() => setWhatIfOpen(false)}/>}
      </div>
    </div>
  );
}
