"use client";
import { useState, useMemo, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../lib/context";
import { Icon } from "../../components/Icon";
import { Pill, SectionHeader } from "../../components/atoms";
import { FACILITIES, SKUS, ProductionRun } from "../../lib/data";
import type { BackendSchedule } from "../../lib/api";
import { useSchedules } from "../../lib/hooks";

const FACILITY_MAP: Record<string, string> = {
  "plant-toronto": "p1", "plant-mississauga": "p2", "plant-hamilton": "p3", "plant-montreal": "p4",
  plant_1: "p1", plant_2: "p2", plant_3: "p3", plant_4: "p4",
};

// Static demo runs — shown when backend returns no data (e.g. unseeded DB in production)
const STATIC_RUNS: ProductionRun[] = [
  { id: "s-p1-l1-a", plant: "p1", line: 1, sku: "sku-wonder-classic-white-loaf",      qty: 1400, start: 6,    end: 8,    allergen: "none", risk: "ok",  lots: [] },
  { id: "s-p1-l1-b", plant: "p1", line: 1, sku: "sku-wonder-classic-white-loaf",      qty: 1200, start: 8.5,  end: 10.5, allergen: "none", risk: "ok",  lots: [] },
  { id: "s-p1-l2-a", plant: "p1", line: 2, sku: "sku-stonefire-pizza-crust-2pk",      qty: 900,  start: 9,    end: 10.5, allergen: "none", risk: "ok",  lots: [] },
  { id: "s-p1-l3-a", plant: "p1", line: 3, sku: "sku-stonefire-mini-naan-8pk",        qty: 1800, start: 9.5,  end: 13,   allergen: "none", risk: "ok",  lots: [] },
  { id: "s-p2-l1-a", plant: "p2", line: 1, sku: "sku-d-italiano-hot-dog-buns-8pk",   qty: 1500, start: 9,    end: 12,   allergen: "none", risk: "ok",  lots: [] },
  { id: "s-p2-l2-a", plant: "p2", line: 2, sku: "sku-ace-rustic-italian-oval",        qty: 1100, start: 6,    end: 9,    allergen: "none", risk: "ok",  lots: [] },
  { id: "s-p2-l2-b", plant: "p2", line: 2, sku: "sku-ace-sourdough-bistro",           qty: 1400, start: 9,    end: 11.5, allergen: "none", risk: "ok",  lots: [] },
  { id: "s-p3-l1-a", plant: "p3", line: 1, sku: "sku-country-harvest-12-grain-loaf", qty: 1100, start: 9,    end: 11,   allergen: "none", risk: "ok",  lots: [] },
  { id: "s-p3-l2-a", plant: "p3", line: 2, sku: "sku-stonefire-naan-dippers-original",qty: 1600, start: 6,    end: 8.5,  allergen: "none", risk: "ok",  lots: [] },
  { id: "s-p3-l2-b", plant: "p3", line: 2, sku: "sku-stonefire-naan-dippers-original",qty: 1600, start: 9,    end: 11.5, allergen: "none", risk: "ok",  lots: [] },
  { id: "s-p4-l1-a", plant: "p4", line: 1, sku: "sku-ace-rosemary-focaccia",          qty: 800,  start: 6,    end: 9.5,  allergen: "none", risk: "ok",  lots: [] },
  { id: "s-p4-l1-b", plant: "p4", line: 1, sku: "sku-ace-rosemary-focaccia",          qty: 800,  start: 9.5,  end: 11,   allergen: "none", risk: "ok",  lots: [] },
];

const LANE_H = 44;
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);
const GANTT_GRID_COLS = `repeat(${HOURS.length}, minmax(0, 1fr))`;

function hourLeftPct(hour: number, timelineStart: number, slotCount: number): number {
  return ((hour - timelineStart) / slotCount) * 100;
}

function hourWidthPct(start: number, end: number, slotCount: number): number {
  return ((end - start) / slotCount) * 100;
}

type ScheduledRun = ProductionRun & { dateKey: string };

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateKey(d);
}

function quickDatesAround(anchorDate: string): string[] {
  return [shiftDateKey(anchorDate, -1), anchorDate, shiftDateKey(anchorDate, 1)];
}

function laneRowBg(index: number): string {
  return index % 2 === 0 ? "bg-[var(--bp-surface-soft)]" : "bg-[var(--bp-surface-muted)]/35";
}

function runTileStyle(risk: ProductionRun["risk"]): string {
  if (risk === "red") {
    return "border-l-red-400 bg-red-950/55 border-red-500/45 hover:bg-red-950/70";
  }
  if (risk === "amber") {
    return "border-l-amber-400 bg-amber-950/45 border-amber-500/40 hover:bg-amber-950/60";
  }
  return "border-l-blue-400/90 bg-[var(--bp-surface-muted)] border-[var(--bp-border)] hover:bg-[var(--bp-surface)] hover:border-[var(--bp-border)]";
}

const GANTT_HEADER_H = 32;
const GANTT_HEADER =
  "sticky top-0 z-30 shrink-0 bg-[var(--bp-surface-muted)]/55 border-b border-[var(--bp-border-soft)] text-[11px] font-medium leading-none text-[var(--bp-text-secondary)]";
const GANTT_ROW_LABEL = "text-[11px] font-medium leading-snug text-[var(--bp-text-secondary)] truncate";
const GANTT_HOUR_LABEL = "text-[11px] font-mono leading-none text-[var(--bp-text-muted)] tabular-nums";
const GANTT_RUN_TILE =
  "absolute top-1.5 bottom-1.5 rounded-lg border border-l-[3px] bg-[var(--bp-surface)] shadow-md ring-1 ring-black/10 flex items-center gap-2 px-2.5 cursor-pointer transition-colors duration-150 hover:z-20 hover:shadow-lg hover:ring-black/15";

function formatDateLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  return d.toLocaleDateString("en-CA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function backendSchedulesToRuns(schedules: BackendSchedule[]): ScheduledRun[] {
  const runs: ScheduledRun[] = [];
  for (const s of schedules) {
    if (s.status === "complete") continue;
    const plantId = FACILITY_MAP[s.facility_id] ?? s.facility_id;
    const lineNum = parseInt(s.line_id.replace(/\D/g, "")) || 1;
    for (const r of s.runs) {
      const start = new Date(r.start_at);
      const end = new Date(r.end_at);
      runs.push({
        id: r.run_id,
        plant: plantId,
        line: lineNum,
        sku: r.sku_id,
        qty: r.quantity,
        start: start.getUTCHours() + start.getUTCMinutes() / 60,
        end: end.getUTCHours() + end.getUTCMinutes() / 60,
        allergen: "none",
        risk: "ok",
        lots: r.lot_assignments,
        dateKey: toDateKey(start),
      });
    }
  }
  return runs;
}

// Default lanes to always show, even when a line has no runs today
const ALL_LANES: Array<{ plant: string; line: number }> = [
  { plant: "p1", line: 1 }, { plant: "p1", line: 2 }, { plant: "p1", line: 3 },
  { plant: "p2", line: 1 }, { plant: "p2", line: 2 },
  { plant: "p3", line: 1 }, { plant: "p3", line: 2 },
  { plant: "p4", line: 1 }, { plant: "p4", line: 2 },
];

function RunHoverCard({
  run,
  anchorEl,
}: {
  run: ProductionRun;
  anchorEl: HTMLElement | null;
}) {
  const sku = SKUS.find(s => s.id === run.sku);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!anchorEl) return;
    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      setPos({
        left: Math.min(Math.max(8, rect.left), window.innerWidth - 264),
        top: rect.top - 8,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorEl]);

  if (!anchorEl || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed z-[9999] w-64 -translate-y-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3 shadow-2xl text-[12px] pointer-events-none ring-1 ring-white/[0.04]"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="font-mono text-[10px] text-[var(--bp-text-subtle)] mb-1">{run.id}</div>
      <div className="text-[13px] font-medium text-[var(--bp-text-primary)] mb-1.5">{sku?.name || run.sku}</div>
      <div className="text-[var(--bp-text-muted)]">Lots consumed</div>
      {run.lots.length > 0
        ? run.lots.map(l => <div key={l} className="font-mono text-[11px] text-[var(--bp-text-secondary)]">· {l}</div>)
        : <div className="font-mono text-[11px] text-[var(--bp-text-subtle)]">· none assigned</div>}
      <div className="mt-1.5 pt-1.5 border-t border-[var(--bp-border-soft)] flex justify-between">
        <span className="text-[var(--bp-text-muted)]">yield est</span>
        <span className="text-[var(--bp-text-secondary)] font-mono tabular-nums">96.4%</span>
      </div>
    </div>,
    document.body,
  );
}

function GanttLane({
  lane,
  hours,
  nowHour,
  isFirst,
  showNowLine,
  rowIndex,
}: {
  lane: { key: string; plant: string; line: number; runs: ProductionRun[] };
  hours: number[];
  nowHour: number;
  isFirst: boolean;
  showNowLine: boolean;
  rowIndex: number;
}) {
  const sku = (id: string) => SKUS.find(s => s.id === id);
  const [hoveredRun, setHoveredRun] = useState<{ run: ProductionRun; el: HTMLElement } | null>(null);
  const showNow = showNowLine && nowHour >= hours[0] && nowHour <= hours[hours.length - 1];
  const nowLabel = `${String(Math.floor(nowHour)).padStart(2, "0")}:${String(Math.round((nowHour % 1) * 60)).padStart(2, "0")}`;
  return (
    <div
      className={`relative w-full border-b border-[var(--bp-border-soft)] ${laneRowBg(rowIndex)}`}
      style={{ height: LANE_H }}
    >
      {Array.from({ length: hours.length + 1 }, (_, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 w-px opacity-70"
          style={{ left: `${(i / hours.length) * 100}%`, backgroundColor: "var(--bp-border-soft)" }}
        />
      ))}
      {showNow && (
        <div
          className="absolute top-0 bottom-0 w-px bg-blue-400 z-10 shadow-[0_0_8px_rgba(96,165,250,0.55)]"
          style={{ left: `${hourLeftPct(nowHour, hours[0], hours.length)}%` }}
        >
          {isFirst && (
            <div className="absolute -top-2.5 -translate-x-1/2 rounded-full bg-blue-500/35 px-1.5 py-0.5 text-[9px] font-mono text-blue-100 whitespace-nowrap ring-1 ring-blue-400/50">
              now · {nowLabel}
            </div>
          )}
        </div>
      )}
      {lane.runs.map(r => {
        const leftPct = hourLeftPct(r.start, hours[0], hours.length);
        const widthPct = hourWidthPct(r.start, r.end, hours.length);
        const allergenTone = r.allergen === "nuts" ? "red" : r.allergen === "milk" ? "amber" : "slate";
        return (
          <div
            key={r.id}
            className={`${GANTT_RUN_TILE} ${runTileStyle(r.risk)}`}
            style={{ left: `calc(${leftPct}% + 3px)`, width: `calc(${widthPct}% - 6px)` }}
            onMouseEnter={e => setHoveredRun({ run: r, el: e.currentTarget })}
            onMouseLeave={() => setHoveredRun(null)}
          >
            <span className="text-[12px] font-medium text-[var(--bp-text-primary)] truncate">{sku(r.sku)?.name || r.sku}</span>
            <span className="text-[11px] font-mono text-[var(--bp-text-muted)] tabular-nums shrink-0">
              {(r.qty / 1000).toFixed(1)}k
            </span>
            {r.allergen !== "none" && <Pill tone={allergenTone === "red" ? "red" : allergenTone === "amber" ? "amber" : "ghost"} className="shrink-0">{r.allergen}</Pill>}
          </div>
        );
      })}
      {hoveredRun && <RunHoverCard run={hoveredRun.run} anchorEl={hoveredRun.el} />}
      {lane.runs.length > 1 && lane.runs.slice(0, -1).map((r, i) => {
        const next = lane.runs[i + 1];
        const xPct = hourLeftPct(next.start, hours[0], hours.length);
        if (r.allergen !== next.allergen && r.allergen !== "none" && next.allergen !== "none") {
          return (
            <div key={i} className="absolute top-0 bottom-0 border-l-2 border-dashed border-amber-500/60" style={{ left: `calc(${xPct}% - 1px)` }}>
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
    <div className="fixed top-14 right-0 bottom-12 z-30 w-full sm:w-[420px] bg-[#0c111c] border-l border-slate-800 shadow-2xl flex flex-col">
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const { data: backendSchedules, status: scheduleStatus } = useSchedules();

  const todayKey = useMemo(() => toDateKey(new Date()), []);

  const nowHour = useMemo(() => {
    const n = new Date();
    return n.getUTCHours() + n.getUTCMinutes() / 60;
  }, []);

  const allRuns = useMemo<ScheduledRun[]>(() => {
    if (scheduleStatus === "loading") {
      return STATIC_RUNS.map(r => ({ ...r, dateKey: todayKey }));
    }
    if (scheduleStatus === "fallback" || backendSchedules.length === 0) {
      return STATIC_RUNS.map(r => ({ ...r, dateKey: todayKey }));
    }
    const runs = backendSchedulesToRuns(backendSchedules);
    return runs.length > 0 ? runs : STATIC_RUNS.map(r => ({ ...r, dateKey: todayKey }));
  }, [backendSchedules, scheduleStatus, todayKey]);

  const activeDate = selectedDate ?? todayKey;

  const quickDates = useMemo(
    () => quickDatesAround(activeDate),
    [activeDate],
  );

  const scheduledDates = useMemo(
    () => Array.from(new Set(allRuns.map(r => r.dateKey))).sort(),
    [allRuns],
  );

  const runCountByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of allRuns) counts[r.dateKey] = (counts[r.dateKey] ?? 0) + 1;
    return counts;
  }, [allRuns]);

  const isEmptyDate = (runCountByDate[activeDate] ?? 0) === 0;

  const runs = useMemo(() => {
    const forDate = allRuns.filter(r => r.dateKey === activeDate);
    return plant === "all" ? forDate : forDate.filter(r => r.plant === plant);
  }, [allRuns, activeDate, plant]);

  const lanes = useMemo(() => {
    const visiblePlants = new Set(plant === "all" ? ALL_LANES.map(l => l.plant) : [plant]);
    const byKey: Record<string, { key: string; plant: string; line: number; runs: ProductionRun[] }> = {};
    // Pre-populate all standard lanes so empty lines still appear
    ALL_LANES.filter(l => visiblePlants.has(l.plant)).forEach(l => {
      const key = `${l.plant}-L${l.line}`;
      byKey[key] = { key, plant: l.plant, line: l.line, runs: [] };
    });
    runs.forEach(r => {
      const key = `${r.plant}-L${r.line}`;
      if (!byKey[key]) byKey[key] = { key, plant: r.plant, line: r.line, runs: [] };
      byKey[key].runs.push(r);
    });
    return Object.values(byKey).sort((a, b) => (a.plant + a.line).localeCompare(b.plant + b.line));
  }, [runs, plant]);

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

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-1 p-0.5 rounded-md border border-slate-800 bg-slate-900/40 overflow-x-auto">
            {[{ id: "all", label: "All" }, ...FACILITIES.filter(f => f.id !== "all").map(f => ({ id: f.id, label: f.name }))].map(t => (
              <button key={t.id} onClick={() => setPlant(t.id)} className={`px-2.5 py-1 rounded-md text-[12px] whitespace-nowrap ${plant === t.id ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>{t.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-1 p-0.5 rounded-md border border-slate-800 bg-slate-900/40 overflow-x-auto">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => setSelectedDate(shiftDateKey(activeDate, -1))}
              className="px-2 py-1 rounded-md text-[14px] leading-none text-slate-400 hover:text-slate-200"
            >
              ‹
            </button>
            {quickDates.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDate(d)}
                className={`px-2.5 py-1 rounded-md text-[12px] whitespace-nowrap flex items-center gap-1.5 ${
                  activeDate === d ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>{formatDateLabel(d)}</span>
                {d === todayKey && <span className="text-[9px] uppercase tracking-wide text-blue-300">today</span>}
                <span className="text-[10px] font-mono text-slate-500 tabular-nums">{runCountByDate[d] ?? 0}</span>
              </button>
            ))}
            <button
              type="button"
              aria-label="Next day"
              onClick={() => setSelectedDate(shiftDateKey(activeDate, 1))}
              className="px-2 py-1 rounded-md text-[14px] leading-none text-slate-400 hover:text-slate-200"
            >
              ›
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSelectedDate(todayKey)}
            className={`px-2.5 py-1 rounded-md border text-[12px] whitespace-nowrap ${
              activeDate === todayKey
                ? "border-blue-500/40 bg-blue-500/15 text-blue-200"
                : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600 hover:text-slate-100"
            }`}
          >
            Today
          </button>
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${
              isEmptyDate ? "border-blue-500/40 bg-blue-500/[0.06]" : "border-slate-800 bg-slate-900/40"
            }`}
          >
            <button
              type="button"
              aria-label="Open calendar"
              onClick={() => dateInputRef.current?.showPicker?.()}
              className="text-slate-400 hover:text-slate-200"
            >
              <Icon name="calendar" size={13}/>
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={activeDate}
              onChange={e => e.target.value && setSelectedDate(e.target.value)}
              className="bg-transparent text-[12px] font-mono text-slate-200 focus:outline-none [color-scheme:dark] w-[7.5rem] cursor-pointer"
              aria-label="Pick schedule date"
            />
          </div>
          <div className="text-[11px] font-mono text-slate-500 hidden md:block">
            {runs.length} run{runs.length === 1 ? "" : "s"} on {formatDateLabel(activeDate)}
            {isEmptyDate ? " · no runs" : ""}
            {plant !== "all" ? ` · ${FACILITIES.find(f => f.id === plant)?.name ?? plant}` : ""}
          </div>
          <div className="flex-1"/>
          <button onClick={() => setShowDiff(d => !d)} className={`px-2.5 py-1 rounded-md text-[12px] flex items-center gap-1.5 whitespace-nowrap ${showDiff ? "bg-blue-500/15 text-blue-200 border border-blue-500/40" : "border border-slate-700 text-slate-300 hover:border-blue-500"}`}>
            <Icon name="diff" size={12}/> {showDiff ? "Hide" : "Show"} agent proposal
          </button>
        </div>

        {runs.length === 0 && (
          <div className="mb-3 px-3 py-2 rounded-md border border-slate-800 bg-slate-900/40 text-[12px] text-slate-400">
            No production runs scheduled for {formatDateLabel(activeDate)}.
            {scheduledDates.length > 0 && (
              <> Days with runs: {scheduledDates.map(d => formatDateLabel(d)).join(", ")}.</>
            )}
          </div>
        )}

        <div className="rounded-xl border border-[var(--bp-border-soft)] bg-[var(--bp-surface-soft)] shadow-sm overflow-hidden ring-1 ring-white/[0.03]">
          <div className="flex min-w-0">
            <div className="w-44 shrink-0 border-r border-[var(--bp-border-soft)] bg-[var(--bp-surface-soft)]">
              <div
                className={`flex items-center justify-center text-center px-3 uppercase tracking-wide ${GANTT_HEADER}`}
                style={{ height: GANTT_HEADER_H }}
              >
                Line
              </div>
              {lanes.map((ln, i) => (
                <div
                  key={ln.key}
                  className={`flex items-center px-3 border-b border-[var(--bp-border-soft)] ${laneRowBg(i)}`}
                  style={{ height: LANE_H }}
                >
                  <span className={GANTT_ROW_LABEL}>
                    {FACILITIES.find(f => f.id === ln.plant)?.name || ln.plant}{" "}
                    <span className="font-mono text-[var(--bp-text-muted)]">L{ln.line}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="min-w-0 flex-1 w-full bg-[var(--bp-surface-soft)]">
              <div
                className={`grid w-full ${GANTT_HEADER}`}
                style={{ gridTemplateColumns: GANTT_GRID_COLS, height: GANTT_HEADER_H }}
              >
                {HOURS.map(h => (
                  <div
                    key={h}
                    className={`min-w-0 border-r border-[var(--bp-border-soft)] flex items-center justify-center text-center ${GANTT_HOUR_LABEL}`}
                  >
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              {lanes.map((ln, i) => (
                  <GanttLane
                    key={ln.key}
                    lane={ln}
                    hours={HOURS}
                    nowHour={nowHour}
                    isFirst={i === 0}
                    showNowLine={activeDate === todayKey}
                    rowIndex={i}
                  />
              ))}
            </div>
          </div>
        </div>

        {showDiff && <ScheduleDiff/>}
        {whatIfOpen && <WhatIfPanel onClose={() => setWhatIfOpen(false)}/>}
      </div>
    </div>
  );
}
