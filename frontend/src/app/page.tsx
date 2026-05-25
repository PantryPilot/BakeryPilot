"use client";
import Link from "next/link";
import { Icon } from "../components/Icon";
import { Pill } from "../components/atoms";

const LOOPS = [
  { id: "inbound",    label: "Inbound",    desc: "Supplier reliability, PO landed cost, MOQ-tax",       icon: "truck",    color: "blue",    href: "/scorecard", stats: [{ k: "5", v: "active suppliers" }, { k: "2", v: "watch" }] },
  { id: "production", label: "Production", desc: "Live yield, line schedule, changeover cost",            icon: "calendar", color: "amber",   href: "/schedule",  stats: [{ k: "9", v: "runs today" }, { k: "−3.7pp", v: "yield Δ L2" }] },
  { id: "outbound",   label: "Outbound",   desc: "Retailer fulfilment, forecast vs PO, shelf-life",      icon: "bars",     color: "purple",  href: "/scorecard", stats: [{ k: "+34%", v: "Costco spike" }, { k: "12", v: "red pallets" }] },
  { id: "network",    label: "Network",    desc: "Cross-plant balancing, transfer arcs, FlowSight",      icon: "grid",     color: "emerald", href: "/facilities", stats: [{ k: "4", v: "plants live" }, { k: "2", v: "transfers" }] },
];

const ACCENT: Record<string, string> = {
  blue:    "border-blue-500/30 hover:border-blue-500",
  amber:   "border-amber-500/30 hover:border-amber-500",
  purple:  "border-purple-500/30 hover:border-purple-500",
  emerald: "border-emerald-500/30 hover:border-emerald-500",
};
const TEXT: Record<string, string> = {
  blue:    "text-blue-300",
  amber:   "text-amber-300",
  purple:  "text-purple-300",
  emerald: "text-emerald-300",
};

export default function HomePage() {
  return (
    <div className="h-full overflow-y-auto bg-[#070a11]">
      <div className="max-w-[1200px] mx-auto p-10">
        <div className="mb-10">
          <Pill tone="blue" className="mb-3">First run</Pill>
          <h1 className="text-[44px] font-semibold text-slate-100 leading-tight tracking-tight">BakeryPilot</h1>
          <p className="text-[16px] text-slate-400 mt-2 max-w-[640px] leading-relaxed">
            Agentic ops copilot for four plants, hundreds of SKUs, thousands of tonnes weekly.
            Choose a loop to start, or open FlowSight to see the whole network live.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          {LOOPS.map(l => (
            <Link key={l.id} href={l.href} className={`text-left rounded-xl border ${ACCENT[l.color]} bg-slate-900/40 p-5 transition group block`}>
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg bg-slate-800/60 flex items-center justify-center ${TEXT[l.color]}`}>
                  <Icon name={l.icon} size={18}/>
                </div>
                <Icon name="chevron" size={14} className="text-slate-600 -rotate-90 group-hover:text-slate-300"/>
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Loop</div>
              <div className="text-[20px] font-semibold text-slate-100 mt-0.5">{l.label}</div>
              <div className="text-[12px] text-slate-400 mt-1">{l.desc}</div>
              <div className="mt-4 flex items-center gap-4 pt-3 border-t border-slate-800">
                {l.stats.map((s, i) => (
                  <div key={i}>
                    <div className={`text-[16px] font-mono tabular-nums ${TEXT[l.color]}`}>{s.k}</div>
                    <div className="text-[10px] text-slate-500">{s.v}</div>
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>

        <Link href="/facilities" className="w-full rounded-xl border border-slate-700 bg-gradient-to-r from-blue-500/10 to-transparent p-5 text-left hover:border-blue-500 transition flex items-center gap-4 block">
          <div className="w-12 h-12 rounded-lg bg-blue-500/15 text-blue-300 flex items-center justify-center">
            <Icon name="grid" size={22}/>
          </div>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] text-blue-300">Flagship view</div>
            <div className="text-[18px] font-semibold text-slate-100">Open FlowSight — full supply network</div>
            <div className="text-[12px] text-slate-400 mt-0.5">Live map of every supplier, plant, and retailer · 8 overlay layers</div>
          </div>
          <Icon name="chevron" size={18} className="text-slate-500 -rotate-90"/>
        </Link>

        <div className="mt-10 text-[11px] font-mono text-slate-600 text-center">
          v0.4 · agent specs: orchestrator · inventory · procurement · scheduler · yield
        </div>
      </div>
    </div>
  );
}
