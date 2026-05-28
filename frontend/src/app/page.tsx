"use client";
import Link from "next/link";
import { Icon } from "../components/Icon";
import { Pill } from "../components/atoms";
import { useDashboardLoops } from "../lib/hooks";
import { useApp } from "../lib/context";
import type { TranslationKey } from "../lib/i18n";

interface LoopMeta {
  descKey: TranslationKey;
  labelKey: TranslationKey;
  icon: string;
  color: string;
  href: string;
}

// Visual layout / copy stays UI-owned; metrics come from the backend.
const LOOP_META: Record<string, LoopMeta> = {
  inbound:    { labelKey: "home.loop_inbound",    descKey: "home.loop_desc_inbound",    icon: "truck",    color: "blue",    href: "/scorecard" },
  production: { labelKey: "home.loop_production", descKey: "home.loop_desc_production", icon: "calendar", color: "amber",   href: "/schedule" },
  outbound:   { labelKey: "home.loop_outbound",   descKey: "home.loop_desc_outbound",   icon: "bars",     color: "purple",  href: "/scorecard" },
  network:    { labelKey: "home.loop_network",    descKey: "home.loop_desc_network",    icon: "grid",     color: "emerald", href: "/facilities" },
};

const FALLBACK_LOOPS = [
  { id: "inbound", label: "Inbound", stats: [{ k: "–", v: "active suppliers" }, { k: "–", v: "watch" }] },
  { id: "production", label: "Production", stats: [{ k: "–", v: "runs today" }, { k: "–", v: "yield Δ L2" }] },
  { id: "outbound", label: "Outbound", stats: [{ k: "–", v: "demand spike" }, { k: "–", v: "red pallets" }] },
  { id: "network", label: "Network", stats: [{ k: "–", v: "plants live" }, { k: "–", v: "transfers" }] },
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
  const loops = useDashboardLoops();
  const { t } = useApp();
  const cards = loops.data.length > 0 ? loops.data : FALLBACK_LOOPS;

  return (
    <div className="h-full overflow-y-auto bg-[#070a11]">
      <div className="max-w-[1200px] mx-auto p-5 sm:p-8 lg:p-10">
        <div className="mb-8 sm:mb-10">
          <Pill tone="blue" className="mb-3">{t("home.first_run")}</Pill>
          <h1 className="text-[32px] sm:text-[44px] font-semibold text-slate-100 leading-tight tracking-tight">BakeryPilot</h1>
          <p className="text-[14px] sm:text-[16px] text-slate-400 mt-2 max-w-[640px] leading-relaxed">
            {t("home.tagline")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {cards.map(l => {
            const meta = LOOP_META[l.id];
            const label = meta ? t(meta.labelKey) : l.label;
            const desc = meta ? t(meta.descKey) : "";
            const fallbackMeta = meta ?? { icon: "grid", color: "blue", href: "/" };
            return (
              <Link key={l.id} href={fallbackMeta.href} className={`text-left rounded-xl border ${ACCENT[fallbackMeta.color]} bg-slate-900/40 p-5 transition group block`}>
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-lg bg-slate-800/60 flex items-center justify-center ${TEXT[fallbackMeta.color]}`}>
                    <Icon name={fallbackMeta.icon} size={18}/>
                  </div>
                  <Icon name="chevron" size={14} className="text-slate-600 -rotate-90 group-hover:text-slate-300"/>
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Loop</div>
                <div className="text-[20px] font-semibold text-slate-100 mt-0.5">{label}</div>
                <div className="text-[12px] text-slate-400 mt-1">{desc}</div>
                <div className="mt-4 flex items-center gap-4 pt-3 border-t border-slate-800">
                  {l.stats.map((s, i) => (
                    <div key={i}>
                      <div className={`text-[16px] font-mono tabular-nums ${TEXT[fallbackMeta.color]}`}>{s.k}</div>
                      <div className="text-[10px] text-slate-500">{s.v}</div>
                    </div>
                  ))}
                </div>
              </Link>
            );
          })}
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
