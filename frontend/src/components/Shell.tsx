"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { FACILITIES, KPIS } from "../lib/data";
import { useApp } from "../lib/context";

const NAV = [
  { id: "facilities", route: "/facilities", label: "FlowSight",  icon: "grid"     },
  { id: "materials",  route: "/materials",  label: "Inventory",  icon: "box"      },
  { id: "suppliers",  route: "/scorecard",  label: "Suppliers",  icon: "truck"    },
  { id: "schedule",   route: "/schedule",   label: "Schedule",   icon: "calendar" },
  { id: "scorecard",  route: "/scorecard",  label: "Scorecard",  icon: "bars"     },
  { id: "chat",       route: "/chat",       label: "Copilot",    icon: "chat"     },
];

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed } = useApp();
  const pathname = usePathname();

  return (
    <aside className={`shrink-0 ${sidebarCollapsed ? "w-[64px]" : "w-[208px]"} transition-all duration-200 border-r border-slate-800/80 bg-[#0a0d14] flex flex-col`}>
      <div className="h-14 flex items-center px-4 gap-2.5 border-b border-slate-800/80">
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-950">
            <path d="M4 14c0-5 4-9 8-9s8 4 8 9c0 3-3 5-8 5s-8-2-8-5z"/>
            <path d="M9 11v-1M15 11v-1M12 11v-2"/>
          </svg>
        </div>
        {!sidebarCollapsed && (
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-slate-100 leading-none">BakeryPilot</div>
            <div className="text-[10px] text-slate-500 mt-0.5 tracking-wider uppercase">Ops copilot</div>
          </div>
        )}
      </div>

      <nav className="flex-1 py-3">
        {NAV.map(item => {
          const active = pathname === item.route || (item.id === "scorecard" && pathname === "/scorecard");
          return (
            <Link key={item.id} href={item.route}
              className={`w-full flex items-center gap-3 px-4 py-2.5 transition relative ${active ? "text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
              {active && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-blue-500"/>}
              <Icon name={item.icon} size={18} className={active ? "text-blue-400" : ""}/>
              {!sidebarCollapsed && <span className="text-[13px] font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="border-t border-slate-800/80 py-3 text-slate-500 hover:text-slate-300 text-[11px] font-mono"
      >
        {sidebarCollapsed ? "›" : "‹ collapse"}
      </button>
    </aside>
  );
}

export function TopBar() {
  const { facility, setFacility } = useApp();
  const [open, setOpen] = useState(false);

  return (
    <header className="h-14 shrink-0 border-b border-slate-800/80 bg-[#0a0d14]/80 backdrop-blur flex items-center px-4 gap-4 z-30">
      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-800 hover:border-slate-600 transition"
        >
          <Icon name="grid" size={14} className="text-slate-400"/>
          <span className="text-[13px] text-slate-200">{FACILITIES.find(f => f.id === facility)?.name}</span>
          {FACILITIES.find(f => f.id === facility)?.city && (
            <span className="text-[11px] text-slate-500 font-mono">{FACILITIES.find(f => f.id === facility)?.city}</span>
          )}
          <Icon name="chevron" size={14} className="text-slate-500"/>
        </button>
        {open && (
          <div className="absolute top-full mt-1 left-0 min-w-[220px] rounded-md border border-slate-800 bg-slate-900 shadow-xl z-40 overflow-hidden">
            {FACILITIES.map(f => (
              <button key={f.id} onClick={() => { setFacility(f.id); setOpen(false); }}
                className={`w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2 text-[13px] ${facility === f.id ? "text-blue-300 bg-slate-800/50" : "text-slate-200"}`}>
                <span className="flex-1">{f.name}</span>
                {f.city && <span className="text-[11px] text-slate-500 font-mono">{f.city}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1"/>

      <div className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/5">
        <span className="relative flex w-2 h-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"/>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"/>
        </span>
        <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-300">Live</span>
        <span className="text-[10px] text-slate-500 font-mono">SSE · 42ms</span>
      </div>

      <button className="relative p-1.5 rounded-md hover:bg-slate-800/60 text-slate-300">
        <Icon name="bell" size={18}/>
        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400"/>
      </button>

      <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[11px] font-semibold text-slate-100">JD</div>
    </header>
  );
}

export function BottomStrip() {
  const colorMap: Record<string, string> = {
    green: "text-emerald-300",
    red: "text-red-300",
    amber: "text-amber-300",
    slate: "text-slate-300",
  };

  const stats = [
    { label: "Waste avoided", value: `$${KPIS.wasteAvoided.toLocaleString()}`, tone: "green", icon: "leaf" },
    { label: "CO2e saved",    value: `${KPIS.co2eSaved.toFixed(1)} t`,         tone: "green", icon: "drop" },
    { label: "Active disruptions", value: `${KPIS.disruptions}`,               tone: KPIS.disruptions > 1 ? "red" : KPIS.disruptions > 0 ? "amber" : "slate", icon: "warn" },
    { label: "MOQ-tax YTD",   value: `$${KPIS.moqTaxYtd.toLocaleString()}`,   tone: KPIS.moqTaxYtd > 3000 ? "red" : "amber", icon: "diff" },
  ];

  return (
    <div className="h-12 shrink-0 border-t border-slate-800/80 bg-[#0a0d14]/95 flex items-stretch px-4 gap-px">
      {stats.map((s, i) => (
        <div key={i} className="flex-1 flex items-center justify-center gap-3 border-r border-slate-800/40 last:border-r-0">
          <Icon name={s.icon} size={14} className={`${colorMap[s.tone]} opacity-80`}/>
          <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{s.label}</span>
          <span className={`text-[14px] font-mono tabular-nums font-semibold ${colorMap[s.tone]}`}>{s.value}</span>
          {s.tone === "red" && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"/>}
        </div>
      ))}
    </div>
  );
}
