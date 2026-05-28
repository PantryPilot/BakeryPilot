"use client";
import { useState, useEffect } from "react";
import { Icon } from "./Icon";

// ---------- Pill ----------
type PillTone = "slate" | "blue" | "green" | "amber" | "red" | "redPulse" | "teal" | "ghost" | "purple" | "darkRed";

export function Pill({ tone = "slate", children, className = "", style }: { tone?: PillTone; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const tones: Record<PillTone, string> = {
    slate:    "bg-slate-800 text-slate-300 border-slate-700",
    blue:     "bg-blue-500/10 text-blue-300 border-blue-500/30",
    green:    "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    amber:    "bg-amber-500/10 text-amber-300 border-amber-500/30",
    red:      "bg-red-400/10 text-red-400 border-red-400/30",
    redPulse: "bg-red-500/15 text-red-200 border-red-500/40 pulse-red",
    teal:     "bg-teal-500/10 text-teal-300 border-teal-500/30",
    ghost:    "bg-transparent text-slate-400 border-slate-700",
    purple:   "bg-purple-500/10 text-purple-300 border-purple-500/30",
    darkRed:  "bg-red-900/50 text-red-200 border-red-800/60",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium tracking-wide ${tones[tone]} ${className}`} style={style}>
      {children}
    </span>
  );
}

// ---------- Dot ----------
export function Dot({ tone = "green", pulse = false }: { tone?: "green" | "amber" | "red" | "blue" | "slate"; pulse?: boolean }) {
  const tones = { green: "bg-emerald-400", amber: "bg-amber-400", red: "bg-red-400", blue: "bg-blue-400", slate: "bg-slate-500" };
  return <span className={`inline-block w-2 h-2 rounded-full ${tones[tone]} ${pulse ? "animate-pulse" : ""}`} />;
}

// ---------- MOQTaxBadge ----------
export function MOQTaxBadge({ amount, threshold = 3000, onDraft }: { amount: number; threshold?: number; onDraft?: () => void }) {
  if (!amount || amount <= 0) return null;
  const over = amount > threshold;
  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border ${over ? "border-red-500/50 bg-red-500/10 pulse-red" : "border-amber-500/40 bg-amber-500/10"} font-mono text-[11px]`}>
      <span className={over ? "text-red-200" : "text-amber-300"}>MOQ-tax</span>
      <span className={`tabular-nums ${over ? "text-red-100" : "text-amber-100"}`}>${amount.toLocaleString()}</span>
      {over && onDraft && (
        <button onClick={onDraft} className="ml-1 px-1.5 py-0.5 rounded bg-red-500/30 text-red-100 hover:bg-red-500/50 transition text-[10px] uppercase tracking-wider">
          Draft negotiation
        </button>
      )}
    </div>
  );
}

// ---------- ReliabilityHalo ----------
export function ReliabilityHalo({ score, disrupt, size = 56, children }: { score: number; disrupt: boolean; size?: number; children?: React.ReactNode }) {
  const tone = disrupt ? "red" : score >= 0.95 ? "green" : score >= 0.85 ? "amber" : "red";
  const stroke = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444" }[tone];
  const dur = disrupt ? "1.1s" : tone === "amber" ? "2.4s" : "3.2s";
  const r = size / 2 - 4;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={stroke} strokeOpacity="0.25" strokeWidth="2" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={stroke} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * r * 0.78} ${2 * Math.PI * r}`}>
          <animateTransform attributeName="transform" type="rotate" from={`0 ${size / 2} ${size / 2}`} to={`360 ${size / 2} ${size / 2}`} dur={dur} repeatCount="indefinite" />
        </circle>
        <circle cx={size / 2} cy={size / 2} r={r + 2} stroke={stroke} strokeOpacity="0.5" strokeWidth="0.5" fill="none">
          <animate attributeName="r" values={`${r + 2};${r + 6};${r + 2}`} dur={dur} repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur={dur} repeatCount="indefinite" />
        </circle>
      </svg>
      <div className="relative z-10 flex items-center justify-center">{children}</div>
    </div>
  );
}

// ---------- ActionCard ----------
export interface ActionCardData {
  kind: string;
  agent: string;
  icon?: string;
  title: string;
  summary: { label: string; value: string; tone?: string }[];
  flags?: { text: string; tone?: string }[];
  details?: { label: string; value: string; tone?: string }[];
  state?: string;
  cardId?: string;
}

export function ActionCard({ card, onConfirm, onReject, onEdit, compact = false }: { card: ActionCardData; onConfirm?: (c: ActionCardData) => void | Promise<void>; onReject?: (c: ActionCardData) => void | Promise<void>; onEdit?: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(card.state || "pending");
  const [busy, setBusy] = useState(false);
  const confirmed = state === "confirmed";
  const rejected = state === "rejected";

  useEffect(() => {
    setState(card.state || "pending");
  }, [card.state, card.cardId]);

  const handleConfirm = async () => {
    if (busy || confirmed || rejected || !onConfirm) return;
    setBusy(true);
    try {
      await onConfirm(card);
      setState("confirmed");
    } catch {
      // keep pending on failure
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (busy || confirmed || rejected || !onReject) return;
    setBusy(true);
    try {
      await onReject(card);
      setState("rejected");
    } catch {
      // keep pending on failure
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-xl border ${confirmed ? "border-emerald-500/30 bg-emerald-500/[0.04]" : rejected ? "border-slate-700 bg-slate-900/60 opacity-70" : "border-blue-500/40 bg-slate-900 shadow-[0_0_0_1px_rgba(59,130,246,0.08),0_8px_30px_-12px_rgba(59,130,246,0.35)]"}`}>
      <div className="flex items-start gap-3 p-3.5 pb-2">
        <div className={`shrink-0 mt-0.5 w-7 h-7 rounded-md flex items-center justify-center ${confirmed ? "bg-emerald-500/15 text-emerald-300" : "bg-blue-500/15 text-blue-300"}`}>
          {confirmed ? <Icon name="check" size={16} /> : <Icon name={card.icon || "zap"} size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className={`text-[11px] uppercase tracking-[0.14em] ${confirmed ? "text-emerald-300/80" : "text-blue-300/80"} font-semibold`}>{card.kind}</div>
            <Pill tone="slate" className="font-mono">{card.agent}</Pill>
            {confirmed && <Pill tone="green"><Icon name="check" size={10} /> Confirmed</Pill>}
            {rejected && <Pill tone="slate">Rejected</Pill>}
          </div>
          <div className="mt-1 text-slate-100 text-[15px] font-medium leading-snug">{card.title}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px bg-slate-800 mx-3 rounded-md overflow-hidden">
        {card.summary.map((s, i) => (
          <div key={i} className="bg-slate-900/80 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</div>
            <div className={`mt-0.5 text-xl font-semibold font-mono tabular-nums ${s.tone === "red" ? "text-red-300" : s.tone === "green" ? "text-emerald-300" : s.tone === "amber" ? "text-amber-300" : "text-slate-100"}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {card.flags && card.flags.length > 0 && (
        <div className="px-3 pt-3 flex flex-wrap gap-1.5">
          {card.flags.map((f, i) => (
            <Pill key={i} tone={(f.tone as PillTone) || "amber"}><Icon name="warn" size={10} />{f.text}</Pill>
          ))}
        </div>
      )}

      {card.details && (
        <div className="px-3 pt-3">
          <button onClick={() => setOpen((o) => !o)} className="text-[11px] text-slate-400 hover:text-slate-200 inline-flex items-center gap-1">
            <Icon name="chevron" size={12} className={`transition ${open ? "rotate-180" : ""}`} />
            {open ? "Hide" : "Show"} cost breakdown
          </button>
          {open && (
            <div className="mt-2 rounded-md border border-slate-800 bg-slate-950/60 p-3 space-y-1.5 font-mono text-[12px]">
              {card.details.map((d, i) => (
                <div key={i} className="flex justify-between gap-4">
                  <span className="text-slate-400">{d.label}</span>
                  <span className={`tabular-nums ${d.tone === "red" ? "text-red-300" : "text-slate-200"}`}>{d.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!confirmed && !rejected && !compact && (
        <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2 p-3 pt-2 border-t border-slate-800">
          <button onClick={handleConfirm} disabled={busy} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-sm transition">{busy ? "Applying…" : "Confirm"}</button>
          <button onClick={onEdit} disabled={busy} className="px-3 py-2 rounded-md border border-slate-600 bg-slate-800/60 hover:border-slate-500 hover:bg-slate-800 text-slate-100 text-sm transition">Edit</button>
          <button onClick={handleReject} disabled={busy} className="px-3 py-2 rounded-md text-red-400 hover:text-red-300 text-sm transition">Reject</button>
        </div>
      )}
      {confirmed && (
        <div className="mt-3 px-3 py-2 border-t border-emerald-500/20 text-[11px] font-mono text-emerald-300/80 flex items-center gap-2">
          <Icon name="check" size={12} /> Committed · {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · acted by you
        </div>
      )}
    </div>
  );
}

// ---------- ToolBreadcrumbs ----------
export function ToolBreadcrumbs({ tools }: { tools: string[] }) {
  return (
    <div className="flex items-center flex-wrap gap-1.5 text-[11px] font-mono">
      {tools.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          <span className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-slate-300">[{t}]</span>
          {i < tools.length - 1 && <span className="text-slate-600">→</span>}
        </span>
      ))}
    </div>
  );
}

// ---------- Sparkline ----------
export function Sparkline({ values, color = "#3b82f6", height = 28, width = 100 }: { values: number[]; color?: string; height?: number; width?: number }) {
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = values[values.length - 1];
  const lastX = width;
  const lastY = height - ((last - min) / range) * (height - 4) - 2;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.2" fill={color} />
    </svg>
  );
}

// ---------- YieldCounter ----------
export function YieldCounter({ actual, target, lostDollars, anomaly }: { actual: number; target: number; lostDollars: number; anomaly?: string | null }) {
  const variance = actual - target;
  const below = actual < target;
  const sparkValues = [97.2, 96.8, 96.1, 95.4, 94.7, 94.0, 93.6, actual];
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-baseline justify-between">
        <div className={`text-3xl font-semibold font-mono tabular-nums ${below ? "text-red-300" : "text-emerald-300"}`}>{actual.toFixed(1)}%</div>
        <Sparkline values={sparkValues} color={below ? "#ef4444" : "#22c55e"} width={80} height={24} />
      </div>
      <div className="mt-1 text-[11px] font-mono text-slate-400">
        Target: <span className="text-slate-300">{target.toFixed(1)}%</span> · Variance:{" "}
        <span className={below ? "text-red-300" : "text-emerald-300"}>{variance > 0 ? "+" : ""}{variance.toFixed(1)} pp</span>
      </div>
      <div className="mt-2 text-[12px] font-mono text-red-300">
        ${lostDollars.toLocaleString()} lost this shift
        <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse align-middle" />
      </div>
      {anomaly && (
        <div className="mt-2 flex items-center gap-2 text-[12px] text-amber-300 border-t border-slate-800 pt-2">
          <Icon name="warn" size={12} />
          <span className="flex-1">{anomaly}</span>
          <button className="text-blue-300 hover:text-blue-200 underline-offset-2 hover:underline">View work order</button>
        </div>
      )}
    </div>
  );
}

// ---------- StatusBadge ----------
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: PillTone; label: string }> = {
    ok:       { tone: "green",   label: "OK" },
    warn:     { tone: "amber",   label: "At Risk" },
    critical: { tone: "red",     label: "Critical" },
    expired:  { tone: "darkRed", label: "Expired" },
  };
  const { tone, label } = map[status] || map.ok;
  return <Pill tone={tone}>{label}</Pill>;
}

// ---------- RiskBar ----------
export function RiskBar({ value }: { value: number }) {
  const color = value > 0.7 ? "bg-red-500" : value > 0.4 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.max(4, value * 100)}%` }} />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-slate-300">{value.toFixed(2)}</span>
    </div>
  );
}

// ---------- SectionHeader ----------
export function SectionHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div>
        <h2 className="text-[20px] font-semibold text-slate-100 leading-tight">{title}</h2>
        {sub && <div className="text-[12px] text-slate-500 mt-0.5">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ---------- StreamingText ----------
export function StreamingText({ text }: { text: string }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    let i = 0;
    setShown("");
    const id = setInterval(() => {
      i += Math.max(2, Math.floor(text.length / 40));
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 22);
    return () => clearInterval(id);
  }, [text]);
  const done = shown.length >= text.length;
  return (
    <div className="text-[13.5px] leading-relaxed text-slate-200 whitespace-pre-wrap">
      {shown}
      {!done && <span className="inline-block w-1.5 h-3.5 ml-0.5 align-[-2px] bg-slate-400 animate-pulse" />}
    </div>
  );
}
