"use client";
import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "../../lib/context";
import { Icon } from "../../components/Icon";
import { Pill, Dot, ReliabilityHalo, MOQTaxBadge, Sparkline, SectionHeader } from "../../components/atoms";
import { SKUS, Supplier } from "../../lib/data";
import {
  useSuppliers,
  useEsgCounter,
  useSupplierOrders,
  useWasteEvents,
  useYieldTelemetry,
  useDemandForecasts,
  useScorecardSummary,
  useSupplierPerformance,
  useIngredients,
  useNegotiationsBySupplier,
} from "../../lib/hooks";
import type { BackendWasteEvent, BackendYieldTelemetryPoint, OrderDraftResponse, BackendSupplierMessage } from "../../lib/api";
import {
  BACKEND_URL,
  createOrderDraft,
  markNegotiationSent,
  discardNegotiationDraft,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  fetchSupplierMessages,
  sendSupplierMessage,
  agentNegotiateSupplier,
  receiveSupplierOrder,
} from "../../lib/api";

type QuickPOContext = {
  source: "production_shortfall";
  facilityId: string;
  ingredientId: string;
  quantityKg: number;
};

function Toast({ msg, tone, onDone }: { msg: string; tone: "green" | "red"; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className={`fixed bottom-16 right-4 z-50 px-4 py-3 rounded-lg shadow-xl text-[13px] font-medium flex items-center gap-2 ${
      tone === "green" ? "bg-emerald-500/90 text-emerald-950" : "bg-red-500/90 text-white"
    }`}>
      <Icon name={tone === "green" ? "check" : "warn"} size={14}/>
      {msg}
    </div>
  );
}

function PlacePOModal({ supplier, initialContext, onClose, onSuccess }: {
  supplier: Supplier;
  initialContext?: QuickPOContext | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const { data: ingredients, status: ingStatus } = useIngredients();
  const [ingredientId, setIngredientId] = useState(initialContext?.ingredientId ?? "");
  const [quantityKg, setQuantityKg] = useState(
    initialContext?.quantityKg ? String(initialContext.quantityKg) : ""
  );
  const [unitPrice, setUnitPrice] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrderDraftResponse | null>(null);

  const canSubmit = !!(ingredientId && quantityKg && unitPrice && deliveryDate && !loading);

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    const res = await createOrderDraft({
      supplier_id: supplier.id.replace(/^s-/, "sup_"),
      items: [{ ingredient_id: ingredientId, quantity_kg: parseFloat(quantityKg), unit_price: parseFloat(unitPrice) }],
      delivery_date: deliveryDate,
      facility_id: initialContext?.facilityId,
    });
    setLoading(false);
    if (res) {
      setResult(res);
    } else {
      setError("Failed to create PO draft. Please try again.");
    }
  }

  if (result) {
    const lc = result.landed_cost_breakdown;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md bg-[#0c111c] rounded-xl border border-slate-700 shadow-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Icon name="check" size={16} className="text-emerald-400"/>
            </div>
            <div>
              <div className="text-[15px] font-semibold text-slate-100">PO Draft Created</div>
              <div className="text-[11px] text-slate-500 font-mono">Action card pending approval</div>
            </div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900/40 p-4 mb-4 text-[12px] space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Landed cost breakdown</div>
            {([
              ["Unit price", `$${lc.unit_price.toFixed(4)}/kg`],
              ["Quantity", `${lc.quantity_kg.toLocaleString()} kg`],
              ["Base cost", `$${lc.base_cost.toLocaleString()}`],
              ["MOQ overage", `$${lc.overage_cost.toLocaleString()}`],
              ["Holding cost", `$${lc.holding_cost.toLocaleString()}`],
            ] as [string, string][]).map(([label, value], i) => (
              <div key={i} className="flex justify-between text-slate-300">
                <span className="text-slate-500">{label}</span>
                <span className="font-mono tabular-nums">{value}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-700 pt-2 text-slate-100 font-semibold">
              <span>Total landed cost</span>
              <span className="font-mono tabular-nums">${lc.total.toLocaleString()}</span>
            </div>
          </div>
          <button
            onClick={() => { onSuccess("PO draft created — pending approval"); onClose(); }}
            className="w-full px-4 py-2.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-semibold text-[13px]"
          >Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0c111c] rounded-xl border border-slate-700 shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[15px] font-semibold text-slate-100">Place Purchase Order</div>
            <div className="text-[11px] text-slate-500 font-mono">{supplier.name}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Icon name="x" size={16}/></button>
        </div>
        <div className="space-y-4">
          {initialContext && (
            <div className="rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[11px] text-violet-200">
              Requested from Production shortfall · facility <span className="font-mono">{initialContext.facilityId}</span>
            </div>
          )}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1.5">Ingredient</label>
            <select
              value={ingredientId}
              onChange={e => setIngredientId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-[13px] text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Select ingredient…</option>
              {ingStatus === "loading" ? (
                <option disabled>Loading…</option>
              ) : (
                ingredients.map(ing => (
                  <option key={ing.ingredient_id} value={ing.ingredient_id}>{ing.name}</option>
                ))
              )}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1.5">Quantity (kg)</label>
              <input
                type="number"
                min="0"
                value={quantityKg}
                onChange={e => setQuantityKg(e.target.value)}
                placeholder="0"
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-[13px] text-slate-200 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1.5">Unit price ($/kg)</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={unitPrice}
                onChange={e => setUnitPrice(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-[13px] text-slate-200 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1.5">Delivery date</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={e => setDeliveryDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-[13px] text-slate-200 focus:border-blue-500 focus:outline-none"
            />
          </div>
          {error && (
            <div className="text-[12px] text-red-400 bg-red-500/10 rounded-md px-3 py-2">{error}</div>
          )}
        </div>
        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-md border border-slate-700 hover:border-slate-500 text-[13px] text-slate-300"
          >Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2.5 rounded-md bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-blue-950 font-semibold text-[13px] flex items-center justify-center gap-2"
          >
            {loading && <span className="w-3.5 h-3.5 border-2 border-blue-900/40 border-t-blue-950 rounded-full animate-spin"/>}
            Create PO Draft
          </button>
        </div>
      </div>
    </div>
  );
}

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

function exportWasteCSV(events: BackendWasteEvent[]) {
  const headers = ["event_id", "ts", "lot_id", "ingredient_name", "quantity_kg", "value_usd", "reason", "avoided", "facility_id"];
  const rows = events.map(e =>
    [e.event_id, e.ts, e.lot_id ?? "", e.ingredient_name, e.quantity_kg, e.value_usd, e.reason, e.avoided ? "yes" : "no", e.facility_id]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "waste_events.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type SupplierTab = "overview" | "contact" | "messages" | "negotiate";

function SupplierSlideIn({ supplier, onClose, isClosing, onDraftAction }: {
  supplier: Supplier;
  onClose: () => void;
  isClosing?: boolean;
  onDraftAction?: (msg: string) => void;
}) {
  const { data: liveOrders, status: ordersStatus, refetch: refetchOrders } = useSupplierOrders(supplier.id);
  const { data: perf } = useSupplierPerformance(supplier.id);
  const { data: drafts, status: negotiationStatus, refetch: refetchDrafts } = useNegotiationsBySupplier(supplier.id);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SupplierTab>("overview");
  const [receivingOrderId, setReceivingOrderId] = useState<string | null>(null);

  // Messages state
  const [messages, setMessages] = useState<BackendSupplierMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [composeBody, setComposeBody] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeSending, setComposeSending] = useState(false);

  // Negotiation state
  const [negGoal, setNegGoal] = useState("");
  const [negTone, setNegTone] = useState("firm-but-friendly");
  const [negSending, setNegSending] = useState(false);
  const [negDraft, setNegDraft] = useState<string | null>(null);
  const [negSubject, setNegSubject] = useState<string | null>(null);
  const [negDraftId, setNegDraftId] = useState<string | null>(null);

  const reloadMessages = useCallback(async () => {
    setMessagesLoading(true);
    const data = await fetchSupplierMessages(supplier.id);
    setMessages(data ?? []);
    setMessagesLoading(false);
  }, [supplier.id]);

  useEffect(() => {
    if (activeTab === "messages") {
      void reloadMessages();
    }
  }, [activeTab, reloadMessages]);

  async function handleReceive(orderId: string) {
    setReceivingOrderId(orderId);
    const res = await receiveSupplierOrder(orderId);
    setReceivingOrderId(null);
    if (res) {
      onDraftAction?.("Order received — lots created");
      refetchOrders();
    } else {
      onDraftAction?.("Receive failed");
    }
  }

  async function handleSendCompose() {
    if (!composeBody.trim()) return;
    setComposeSending(true);
    const res = await sendSupplierMessage(supplier.id, composeBody.trim(), {
      subject: composeSubject.trim() || undefined,
      channel: "email",
    });
    setComposeSending(false);
    if (res) {
      setComposeBody("");
      setComposeSubject("");
      void reloadMessages();
      onDraftAction?.("Message sent");
    } else {
      onDraftAction?.("Send failed");
    }
  }

  async function handleAgentDraft() {
    if (!negGoal.trim()) return;
    setNegSending(true);
    const res = await agentNegotiateSupplier(supplier.id, negGoal.trim(), {
      tone: negTone,
      record_outbound: false,
    });
    setNegSending(false);
    if (res) {
      setNegDraft(res.body_md);
      setNegSubject(res.proposed_subject);
      setNegDraftId(res.draft_id);
      refetchDrafts();
      onDraftAction?.("Draft generated by agent");
    } else {
      onDraftAction?.("Agent draft failed");
    }
  }

  async function handleAgentSendDraft() {
    if (!negDraft) return;
    setNegSending(true);
    const res = await sendSupplierMessage(supplier.id, negDraft, {
      subject: negSubject || undefined,
      channel: "agent",
      related_negotiation_id: negDraftId ?? undefined,
    });
    setNegSending(false);
    if (res) {
      setNegDraft(null);
      setNegSubject(null);
      setNegDraftId(null);
      setNegGoal("");
      void reloadMessages();
      onDraftAction?.("Agent message sent to supplier");
    }
  }

  const weeks = Array.from({ length: 12 }, (_, i) => i + 1);
  const onTime = (() => {
    if (perf && perf.points.length > 0) {
      const base = perf.points.map(p => p.on_time_rate);
      while (base.length < 12) base.unshift(base[0] ?? supplier.onTime);
      return base.slice(-12);
    }
    return weeks.map((_, i) => Math.max(0.7, Math.min(1, supplier.onTime + Math.sin(i * 0.7) * 0.08 - (i === 11 ? 0.05 : 0))));
  })();
  const fill = (() => {
    if (perf && perf.points.length > 0) {
      const base = perf.points.map(p => p.fill_rate);
      while (base.length < 12) base.unshift(base[0] ?? supplier.fill);
      return base.slice(-12);
    }
    return weeks.map((_, i) => Math.max(0.75, Math.min(1, supplier.fill + Math.cos(i * 0.6) * 0.05)));
  })();
  const win = (() => {
    if (perf && perf.points.length > 0) {
      const base = perf.points.map(p => p.window_compliance_rate);
      while (base.length < 12) base.unshift(base[0] ?? supplier.window);
      return base.slice(-12);
    }
    return weeks.map((_, i) => Math.max(0.6, Math.min(1, supplier.window + Math.sin(i * 0.5 + 1) * 0.07)));
  })();
  const priceIdx = weeks.map((_, i) => 1 + Math.sin(i * 0.4) * 0.06);
  const priceSup = weeks.map((_, i) => priceIdx[i] + supplier.priceVsBench + Math.sin(i * 0.6 + 2) * 0.02);

  async function handleSend(draftId: string) {
    setSendingId(draftId);
    const res = await markNegotiationSent(draftId);
    setSendingId(null);
    if (res) {
      refetchDrafts();
      onDraftAction?.("Negotiation draft sent");
    }
  }

  async function handleDiscard(draftId: string) {
    setDiscardingId(draftId);
    const res = await discardNegotiationDraft(draftId);
    setDiscardingId(null);
    if (res) {
      refetchDrafts();
      onDraftAction?.("Draft discarded");
    }
  }

  const showNegotiationSection = drafts.length > 0 || (negotiationStatus === "loading" && supplier.moqTaxQtd > 3000);

  return (
    <div
      style={{ animation: isClosing ? "slide-out-right 280ms ease forwards" : "slide-in-right 280ms ease forwards" }}
      className="fixed top-14 right-0 bottom-0 z-30 w-full sm:w-[640px] bg-[#0c111c] border-l border-slate-800 shadow-2xl flex flex-col"
    >
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
      <div className="flex border-b border-slate-800 bg-slate-900/40 text-[12px]">
        {([
          { id: "overview", label: "Overview" },
          { id: "contact", label: "Contact" },
          { id: "messages", label: `Messages${messages.length ? ` · ${messages.length}` : ""}` },
          { id: "negotiate", label: "Negotiate" },
        ] as { id: SupplierTab; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 border-b-2 transition-colors font-medium ${
              activeTab === t.id
                ? "text-slate-100"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
            style={
              activeTab === t.id
                ? { borderColor: "var(--bp-accent)", color: "var(--bp-accent)" }
                : undefined
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {activeTab === "overview" && (
          <>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Fill rate",   value: `${(supplier.fill * 100).toFixed(0)}%` },
                { label: "On-time",     value: `${(supplier.onTime * 100).toFixed(0)}%` },
                { label: "Window",      value: `${(supplier.window * 100).toFixed(0)}%` },
                { label: "MOQ", value: supplier.moqKg ? `${(supplier.moqKg/1000).toFixed(1)}t` : "—" },
              ].map((c, i) => (
                <div key={i} className="rounded-md border border-slate-800 bg-slate-900/40 p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">{c.label}</div>
                  <div className="text-[18px] font-mono tabular-nums mt-0.5 text-slate-100">{c.value}</div>
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
              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400 font-semibold mb-2 flex items-center gap-2">
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
                  const canReceive = p.status === "confirmed" || p.status === "draft" || p.status === "pending_confirm";
                  return (
                    <div key={i} className="px-3 py-2 flex items-center gap-3 text-[12px]">
                      <span className="font-mono text-slate-400 w-24 truncate" title={p.order_id}>{p.order_id.slice(0, 8).toUpperCase()}</span>
                      <span className="text-slate-200 flex-1 truncate">{p.items[0]?.ingredient_id.replace(/_/g, " ") || "—"}{p.items.length > 1 ? ` +${p.items.length - 1}` : ""}</span>
                      <span className="font-mono tabular-nums text-slate-300 w-20 text-right">{totalKg.toLocaleString()} kg</span>
                      <span className="font-mono text-slate-500 w-28 hidden sm:inline">{p.delivery_date}</span>
                      <Pill tone={p.status === "sent" ? "green" : p.status === "confirmed" ? "blue" : "ghost"}>{p.status}</Pill>
                      {canReceive && (
                        <button
                          disabled={receivingOrderId === p.order_id}
                          onClick={() => handleReceive(p.order_id)}
                          className="px-2 py-1 rounded-md bg-emerald-900/20 border border-emerald-700/40 text-emerald-300 text-[11px] font-semibold hover:bg-emerald-900/30 disabled:opacity-50 flex items-center gap-1"
                        >
                          {receivingOrderId === p.order_id && <span className="w-2.5 h-2.5 border-2 border-emerald-300/30 border-t-emerald-300 rounded-full animate-spin"/>}
                          Receive
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="text-[10.5px] text-slate-500 mt-1.5 pl-1">
                Receive marks the order delivered, creates ingredient lots at the destination facility, and records an inventory receipt event.
              </div>
            </div>
            {showNegotiationSection && (
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-amber-300 font-semibold mb-2 flex items-center gap-2">
                  <Icon name="warn" size={12}/>Pending negotiation {drafts.length > 1 ? "drafts" : "draft"}
                </div>
                {negotiationStatus === "loading" && drafts.length === 0 ? (
                  <div className="text-[12px] text-slate-500 py-2">Loading drafts…</div>
                ) : (
                  drafts.map(draft => (
                    <div key={draft.draft_id} className="rounded-md border border-amber-700/40 bg-amber-900/20 p-4 mb-2">
                      <div className="text-[13px] text-slate-100 font-medium mb-2 capitalize">
                        {draft.trigger_kind.replace(/_/g, " ")}
                      </div>
                      <div className="text-[12px] text-slate-400 leading-relaxed mb-3 whitespace-pre-line">
                        {draft.body_md.length > 400 ? draft.body_md.slice(0, 400) + "…" : draft.body_md}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          disabled={!!sendingId || !!discardingId}
                          onClick={() => handleSend(draft.draft_id)}
                          className="px-3 py-1.5 rounded-md bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-blue-950 font-semibold text-[12px] flex items-center gap-1.5"
                        >
                          {sendingId === draft.draft_id && <span className="w-3 h-3 border-2 border-blue-900/40 border-t-blue-950 rounded-full animate-spin"/>}
                          Mark sent
                        </button>
                        <button
                          disabled={!!sendingId || !!discardingId}
                          onClick={() => handleDiscard(draft.draft_id)}
                          className="px-3 py-1.5 rounded-md text-[12px] text-red-400 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {discardingId === draft.draft_id && <span className="w-3 h-3 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin"/>}
                          Discard
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
        {activeTab === "contact" && (
          <div className="space-y-3">
            <div className="rounded-md border border-slate-800 bg-slate-900/40 p-4 space-y-2.5">
              <ContactRow icon="info" label="Contact" value={supplier.contactName || "—"}/>
              <ContactRow icon="info" label="Email" value={supplier.contactEmail || "—"} href={supplier.contactEmail ? `mailto:${supplier.contactEmail}` : undefined}/>
              <ContactRow icon="info" label="Phone" value={supplier.phone || "—"} href={supplier.phone ? `tel:${supplier.phone}` : undefined}/>
              <ContactRow icon="info" label="Website" value={supplier.website || "—"} href={supplier.website || undefined}/>
              <ContactRow icon="info" label="Address" value={supplier.address || "—"} multi/>
              <ContactRow icon="info" label="Payment terms" value={supplier.paymentTerms || "—"}/>
              <ContactRow icon="info" label="Lead time (mean)" value={supplier.leadTimeMean ? `${supplier.leadTimeMean} days` : "—"}/>
              <ContactRow icon="info" label="MOQ" value={supplier.moqKg ? `${supplier.moqKg.toLocaleString()} kg` : "—"}/>
              <ContactRow icon="info" label="Contract expiry" value={supplier.contractExpiry || "—"}/>
            </div>
            {supplier.notes && (
              <div className="rounded-md border border-slate-800 bg-slate-900/30 p-4">
                <div className="text-[10.5px] uppercase tracking-wider text-slate-500 mb-1">Notes</div>
                <div className="text-[12.5px] text-slate-300 leading-relaxed whitespace-pre-line">{supplier.notes}</div>
              </div>
            )}
          </div>
        )}
        {activeTab === "messages" && (
          <div className="space-y-3">
            {messagesLoading ? (
              <div className="text-[12px] text-slate-500 py-2">Loading conversation…</div>
            ) : messages.length === 0 ? (
              <div className="text-[12px] text-slate-500 py-2">No messages yet. Start a thread below.</div>
            ) : (
              <div className="space-y-2">
                {messages.map(m => (
                  <MessageBubble key={m.message_id} m={m}/>
                ))}
              </div>
            )}
            <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3 space-y-2">
              <div className="text-[10.5px] uppercase tracking-wider text-slate-500">Send new message</div>
              <input
                value={composeSubject}
                onChange={e => setComposeSubject(e.target.value)}
                placeholder="Subject (optional)"
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-[12.5px] text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
              <textarea
                rows={3}
                value={composeBody}
                onChange={e => setComposeBody(e.target.value)}
                placeholder="Type your message…"
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-[12.5px] text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none resize-none"
              />
              <div className="flex justify-end">
                <button
                  disabled={!composeBody.trim() || composeSending}
                  onClick={handleSendCompose}
                  className="px-3 py-1.5 rounded-md bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-blue-950 font-semibold text-[12px] flex items-center gap-1.5"
                >
                  {composeSending && <span className="w-3 h-3 border-2 border-blue-900/40 border-t-blue-950 rounded-full animate-spin"/>}
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
        {activeTab === "negotiate" && (
          <div className="space-y-3">
            <div
              className="rounded-md border p-3 text-[12px] text-slate-200"
              style={{
                borderColor: "rgb(var(--bp-accent-rgb) / 0.35)",
                background: "rgb(var(--bp-accent-rgb) / 0.08)",
              }}
            >
              <div
                className="font-semibold mb-1 flex items-center gap-1.5"
                style={{ color: "var(--bp-accent)" }}
              >
                <Icon name="agent" size={14}/>Agent-drafted negotiation
              </div>
              Describe what you want to negotiate with <span className="text-slate-100 font-semibold">{supplier.name}</span>. The ProcurementAgent will draft a structured message using the supplier&apos;s on-time, fill, window and MOQ-tax data, ready to review and send.
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3 space-y-2">
              <label className="text-[10.5px] uppercase tracking-wider text-slate-500 block">Goal</label>
              <textarea
                rows={3}
                value={negGoal}
                onChange={e => setNegGoal(e.target.value)}
                placeholder="e.g. Lower MOQ from 20t to 12t while holding current per-kg price."
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-[12.5px] text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none resize-none"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[10.5px] uppercase tracking-wider text-slate-500">Tone</label>
                <select
                  value={negTone}
                  onChange={e => setNegTone(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[12px] text-slate-200 focus:border-blue-500 focus:outline-none"
                >
                  <option value="firm-but-friendly">Firm but friendly</option>
                  <option value="formal">Formal</option>
                  <option value="urgent">Urgent</option>
                  <option value="collaborative">Collaborative</option>
                </select>
                <div className="flex-1"/>
                <button
                  disabled={!negGoal.trim() || negSending}
                  onClick={handleAgentDraft}
                  className="px-3 py-1.5 rounded-md bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-blue-950 font-semibold text-[12px] flex items-center gap-1.5"
                >
                  {negSending && !negDraft && <span className="w-3 h-3 border-2 border-blue-900/40 border-t-blue-950 rounded-full animate-spin"/>}
                  Generate draft
                </button>
              </div>
            </div>
            {negDraft && (
              <div className="rounded-md border border-amber-700/40 bg-amber-900/20 p-4 space-y-2">
                <div className="text-[10.5px] uppercase tracking-wider text-amber-300 font-semibold">Generated draft</div>
                {negSubject && (
                  <div className="text-[12px] text-slate-300 font-mono break-words">Subject: {negSubject}</div>
                )}
                <textarea
                  rows={10}
                  value={negDraft}
                  onChange={e => setNegDraft(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-[12.5px] text-slate-200 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none resize-y"
                />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => { setNegDraft(null); setNegSubject(null); setNegDraftId(null); }}
                    className="px-3 py-1.5 rounded-md border border-slate-700 hover:border-slate-500 text-[12px] text-slate-300"
                  >
                    Discard
                  </button>
                  <button
                    disabled={negSending}
                    onClick={handleAgentSendDraft}
                    className="px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-emerald-950 font-semibold text-[12px] flex items-center gap-1.5"
                  >
                    {negSending && <span className="w-3 h-3 border-2 border-emerald-900/40 border-t-emerald-950 rounded-full animate-spin"/>}
                    Send to supplier
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ContactRow({ label, value, href, multi }: {
  icon?: string; label: string; value: string; href?: string; multi?: boolean;
}) {
  const content = href ? (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
      className="hover:underline break-words"
      style={{ color: "var(--bp-accent)" }}
    >
      {value}
    </a>
  ) : (
    <span className="text-slate-200 break-words">{value}</span>
  );
  return (
    <div className={`flex ${multi ? "items-start" : "items-center"} gap-3 text-[12.5px]`}>
      <span className="w-32 text-[10.5px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className="flex-1">{content}</span>
    </div>
  );
}

function MessageBubble({ m }: { m: BackendSupplierMessage }) {
  const outbound = m.direction === "outbound";
  const channelClass: Record<string, string> = {
    email: "text-slate-400",
    phone: "text-amber-300",
    chat: "text-slate-400",
    agent: "text-emerald-300",
    system: "text-slate-500",
  };
  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg border p-3 ${
          outbound
            ? "border-transparent"
            : "bg-slate-900/60 border-slate-700"
        }`}
        style={
          outbound
            ? {
                background: "rgb(var(--bp-accent-rgb) / 0.12)",
                borderColor: "rgb(var(--bp-accent-rgb) / 0.35)",
              }
            : undefined
        }
      >
        <div className="flex items-center gap-2 mb-1 text-[10.5px] flex-wrap">
          <span className={`uppercase tracking-wider ${channelClass[m.channel] ?? "text-slate-400"}`}>{m.channel}</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400">{m.author || (outbound ? "you" : "supplier")}</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-500 font-mono">{new Date(m.sent_at).toLocaleString()}</span>
        </div>
        {m.subject && (
          <div className="text-[12.5px] font-semibold text-slate-100 mb-1">{m.subject}</div>
        )}
        <div className="text-[12.5px] text-slate-200 whitespace-pre-line leading-relaxed">{m.body}</div>
      </div>
    </div>
  );
}

// ── Add / Edit supplier modal ─────────────────────────────────────────────────
function AddEditSupplierModal({ existing, onClose, onSuccess }: {
  existing: Supplier | null;
  onClose: () => void;
  onSuccess: (s: Supplier) => void;
}) {
  const isEdit = existing !== null;
  const [supplierId, setSupplierId] = useState(
    isEdit ? existing!.id.replace(/^s-/, "sup_") : ""
  );
  const [name, setName] = useState(isEdit ? existing!.name : "");
  const [email, setEmail] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [moqKg, setMoqKg] = useState(isEdit ? String(existing!.tier === 1 ? 1500 : 500) : "");
  const [leadTime, setLeadTime] = useState("");
  const [onTimeRate, setOnTimeRate] = useState(isEdit ? String(Math.round(existing!.onTime * 100)) : "90");
  const [fillRate, setFillRate] = useState(isEdit ? String(Math.round(existing!.fill * 100)) : "95");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!(name && (isEdit || supplierId) && !loading);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    let result: Supplier | null = null;
    if (isEdit) {
      result = await updateSupplier(existing!.id, {
        name: name || undefined,
        contact_email: email || undefined,
        payment_terms: paymentTerms || undefined,
        moq_kg: moqKg ? parseFloat(moqKg) : undefined,
        lead_time_mean_days: leadTime ? parseFloat(leadTime) : undefined,
        on_time_rate: onTimeRate ? parseFloat(onTimeRate) / 100 : undefined,
        fill_rate: fillRate ? parseFloat(fillRate) / 100 : undefined,
      });
    } else {
      result = await createSupplier({
        supplier_id: supplierId,
        name,
        contact_email: email || undefined,
        payment_terms: paymentTerms || undefined,
        moq_kg: moqKg ? parseFloat(moqKg) : undefined,
        lead_time_mean_days: leadTime ? parseFloat(leadTime) : undefined,
        on_time_rate: onTimeRate ? parseFloat(onTimeRate) / 100 : undefined,
        fill_rate: fillRate ? parseFloat(fillRate) / 100 : undefined,
      });
    }
    setLoading(false);
    if (result) {
      onSuccess(result);
    } else {
      setError(isEdit ? "Update failed." : "Failed to create supplier. ID may already exist.");
    }
  };

  const inputCls = "w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-[13px] text-slate-200 focus:border-blue-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-[#0c111c] rounded-xl border border-slate-700 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="text-[15px] font-semibold text-slate-100">{isEdit ? "Edit Supplier" : "Add Supplier"}</div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Icon name="x" size={16}/></button>
        </div>
        <div className="space-y-3">
          {!isEdit && (
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1.5">Supplier ID</label>
              <input value={supplierId} onChange={e => setSupplierId(e.target.value)} placeholder="e.g. sup_acme_flour"
                className={inputCls}/>
            </div>
          )}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1.5">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Supplier name" className={inputCls}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1.5">Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@example.com" className={inputCls}/>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1.5">Payment terms</label>
              <input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} placeholder="Net 30" className={inputCls}/>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1.5">MOQ (kg)</label>
              <input type="number" min="0" value={moqKg} onChange={e => setMoqKg(e.target.value)} placeholder="0" className={inputCls}/>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1.5">Lead time (days)</label>
              <input type="number" min="0" value={leadTime} onChange={e => setLeadTime(e.target.value)} placeholder="7" className={inputCls}/>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1.5">On-time rate (%)</label>
              <input type="number" min="0" max="100" value={onTimeRate} onChange={e => setOnTimeRate(e.target.value)} placeholder="90" className={inputCls}/>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500 block mb-1.5">Fill rate (%)</label>
              <input type="number" min="0" max="100" value={fillRate} onChange={e => setFillRate(e.target.value)} placeholder="95" className={inputCls}/>
            </div>
          </div>
          {error && <div className="text-[12px] text-red-400 bg-red-500/10 rounded px-3 py-2">{error}</div>}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-md border border-slate-700 hover:border-slate-500 text-[13px] text-slate-300">Cancel</button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            className="flex-1 px-4 py-2.5 rounded-md bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-blue-950 font-semibold text-[13px] flex items-center justify-center gap-2">
            {loading && <span className="w-3.5 h-3.5 border-2 border-blue-900/40 border-t-blue-950 rounded-full animate-spin"/>}
            {isEdit ? "Save changes" : "Add supplier"}
          </button>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SuppliersTab({ openChatContext }: { openChatContext?: (ctx: string) => void }) {
  const searchParams = useSearchParams();
  const [activeSupplier, setActiveSupplier] = useState<Supplier | null>(null);
  const [supplierClosing, setSupplierClosing] = useState(false);
  const [placePOTarget, setPlacePOTarget] = useState<Supplier | null>(null);
  const [poContext, setPoContext] = useState<QuickPOContext | null>(null);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Supplier | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addedSuppliers, setAddedSuppliers] = useState<Supplier[]>([]);
  const [supplierOverrides, setSupplierOverrides] = useState<Map<string, Supplier>>(new Map());
  const [deletedSupplierIds, setDeletedSupplierIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ msg: string; tone: "green" | "red" } | null>(null);
  const { data: backendSuppliers } = useSuppliers();
  const { data: scorecardSummary } = useScorecardSummary();

  const suppliers = useMemo(() => {
    const base = backendSuppliers
      .map(s => supplierOverrides.get(s.id) ?? s)
      .filter(s => !deletedSupplierIds.has(s.id));
    return [...addedSuppliers, ...base];
  }, [backendSuppliers, supplierOverrides, addedSuppliers, deletedSupplierIds]);

  const quickPoContext = useMemo<QuickPOContext | null>(() => {
    if (searchParams.get("source") !== "production_shortfall") return null;
    const facilityId = searchParams.get("po_facility_id") ?? "";
    const ingredientId = searchParams.get("po_ingredient_id") ?? "";
    const quantityRaw = searchParams.get("po_quantity_kg") ?? "";
    const quantityKg = Number(quantityRaw);
    if (!facilityId || !ingredientId || !Number.isFinite(quantityKg) || quantityKg <= 0) return null;
    return {
      source: "production_shortfall",
      facilityId,
      ingredientId,
      quantityKg,
    };
  }, [searchParams]);

  const closeSupplier = useCallback(() => {
    setSupplierClosing(true);
    setTimeout(() => { setActiveSupplier(null); setSupplierClosing(false); }, 280);
  }, []);

  function showToast(msg: string, tone: "green" | "red" = "green") {
    setToast({ msg, tone });
  }

  useEffect(() => {
    if (!quickPoContext || placePOTarget || suppliers.length === 0) return;
    const suggested = suppliers
      .filter(s => s.status !== "disrupt")
      .sort((a, b) => b.onTime - a.onTime)[0] ?? suppliers[0];
    setPoContext(quickPoContext);
    setPlacePOTarget(suggested);
  }, [quickPoContext, placePOTarget, suppliers]);

  const summary = [
    { label: "Active suppliers", value: scorecardSummary?.supplier_count ?? suppliers.length, tone: "slate" },
    { label: "At risk",          value: suppliers.filter(s => s.status !== "ok").length, tone: "amber" },
    { label: "Pending drafts",   value: scorecardSummary?.pending_drafts ?? 0, tone: "blue" },
    { label: "Expiring < 60d",   value: scorecardSummary?.contracts_expiring_60d ?? 0, tone: "amber" },
  ];
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {summary.map((s, i) => (
          <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</div>
            <div className={`mt-1 text-3xl font-semibold font-mono tabular-nums ${s.tone === "amber" ? "text-amber-300" : s.tone === "blue" ? "text-blue-300" : "text-slate-100"}`}>{s.value}</div>
          </div>
        ))}
      </div>
      {quickPoContext && (
        <div className="mb-4 rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-[12px] text-violet-200 flex items-center justify-between gap-3">
          <div>
            Shortfall procurement request from Production ·
            ingredient <span className="font-mono"> {quickPoContext.ingredientId}</span> ·
            qty <span className="font-mono"> {quickPoContext.quantityKg.toFixed(1)} kg</span> ·
            facility <span className="font-mono"> {quickPoContext.facilityId}</span>
          </div>
          {!placePOTarget && (
            <button
              onClick={() => {
                const suggested = suppliers
                  .filter(s => s.status !== "disrupt")
                  .sort((a, b) => b.onTime - a.onTime)[0] ?? suppliers[0];
                if (!suggested) return;
                setPoContext(quickPoContext);
                setPlacePOTarget(suggested);
              }}
              className="shrink-0 px-3 py-1.5 rounded-md border border-violet-500/40 bg-violet-500/20 text-violet-100 hover:bg-violet-500/30 text-[11px] font-semibold"
            >
              Open PO draft
            </button>
          )}
        </div>
      )}
      {/* Mobile card list */}
      <div className="sm:hidden space-y-2 mb-6">
        {suppliers.map(s => (
          <div
            key={s.id}
            onClick={() => setActiveSupplier(s)}
            className={`rounded-lg border px-4 py-3 cursor-pointer transition ${
              s.status === "disrupt" ? "border-red-500/30 bg-red-500/[0.04]" :
              s.status === "warn"    ? "border-amber-500/20 bg-amber-500/[0.03]" :
              "border-slate-800 bg-slate-900/40"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                <ReliabilityHalo score={s.onTime} disrupt={s.status === "disrupt"} size={36}>
                  <span className="text-[10px] font-mono font-bold text-slate-200">{s.name.split(" ").map(w => w[0]).join("").slice(0,2)}</span>
                </ReliabilityHalo>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-slate-100 truncate">{s.name}</div>
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                  T{s.tier} · {(s.onTime * 100).toFixed(0)}% on-time · {(s.fill * 100).toFixed(0)}% fill
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                {s.status === "ok"     && <Pill tone="green"><Dot tone="green"/>Healthy</Pill>}
                {s.status === "warn"   && <Pill tone="amber"><Dot tone="amber"/>Watch</Pill>}
                {s.status === "disrupt"&& <Pill tone="redPulse"><Dot tone="red" pulse/>Disrupted</Pill>}
                {s.moqTaxQtd > 0 && (
                  <span className={`text-[10px] font-mono ${s.moqTaxQtd > 3000 ? "text-red-300" : "text-amber-300"}`}>
                    MOQ ${Math.round(s.moqTaxQtd).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden sm:block rounded-lg border border-slate-800 bg-slate-900/30 mb-6 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Supplier roster</div>
          <button onClick={() => setAddSupplierOpen(true)}
            className="px-3 py-1 rounded-md bg-blue-500 hover:bg-blue-400 text-blue-950 font-semibold text-[12px]">
            + Add supplier
          </button>
        </div>
        <div className="overflow-x-auto">
        <table className="bp-data-table w-full min-w-[860px] text-[13px]">
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
                  <td className="px-3 py-2.5 max-w-[200px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="shrink-0">
                        <ReliabilityHalo score={s.onTime} disrupt={s.status === "disrupt"} size={28}>
                          <span className="text-[9px] font-mono font-bold text-slate-200">{s.name.split(" ").map(w => w[0]).join("").slice(0,2)}</span>
                        </ReliabilityHalo>
                      </div>
                      <span className="text-slate-100 truncate">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Pill tone={s.tier === 1 ? "blue" : "ghost"}>
                      <span className="hidden md:inline">Tier </span>{s.tier}
                    </Pill>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">{(s.onTime * 100).toFixed(0)}%</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">{(s.fill * 100).toFixed(0)}%</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">{(s.window * 100).toFixed(0)}%</td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${s.priceVsBench < 0 ? "text-emerald-300" : s.priceVsBench > 0.04 ? "text-red-300" : "text-amber-300"}`}>{(s.priceVsBench * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2.5 text-right">
                    {s.moqTaxQtd > 0 ? <span className={`font-mono tabular-nums ${s.moqTaxQtd > 3000 ? "text-red-300" : "text-amber-300"}`}>${Math.round(s.moqTaxQtd).toLocaleString()}</span> : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-slate-300">{s.contractExpiry}</td>
                  <td className="px-3 py-2.5">
                    {s.status === "ok" && <Pill tone="green"><Dot tone="green"/>Healthy</Pill>}
                    {s.status === "warn" && <Pill tone="amber"><Dot tone="amber"/>Watch</Pill>}
                    {s.status === "disrupt" && <Pill tone="redPulse"><Dot tone="red" pulse/>Disrupted</Pill>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      {s.moqTaxQtd > 3000 && (
                        <button
                          onClick={e => { e.stopPropagation(); setActiveSupplier(s); }}
                          className="px-1.5 py-0.5 text-[11px] rounded border border-red-500/40 bg-red-500/10 text-red-200"
                        >View draft</button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setPoContext(null); setPlacePOTarget(s); }}
                        className="px-1.5 py-0.5 text-[11px] rounded border border-slate-700 hover:border-blue-500 text-slate-300"
                      >Place PO</button>
                      <button
                        onClick={e => { e.stopPropagation(); setEditTarget(s); }}
                        className="px-1.5 py-0.5 text-[11px] rounded border border-slate-700 hover:border-slate-500 text-slate-300"
                      >Edit</button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirm(s); }}
                        className="px-1.5 py-0.5 text-[11px] rounded text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/60"
                      >Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
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
                <span className={s.moqTaxQtd > 3000 ? "text-red-300" : "text-amber-300"}>${Math.round(s.moqTaxQtd).toLocaleString()}</span>
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
      {activeSupplier && (
        <SupplierSlideIn
          supplier={activeSupplier}
          onClose={closeSupplier}
          isClosing={supplierClosing}
          onDraftAction={msg => showToast(msg)}
        />
      )}
      {placePOTarget && (
        <PlacePOModal
          supplier={placePOTarget}
          initialContext={poContext}
          onClose={() => { setPlacePOTarget(null); setPoContext(null); }}
          onSuccess={msg => { setPlacePOTarget(null); setPoContext(null); showToast(msg); }}
        />
      )}
      {(addSupplierOpen || editTarget) && (
        <AddEditSupplierModal
          existing={editTarget}
          onClose={() => { setAddSupplierOpen(false); setEditTarget(null); }}
          onSuccess={(s) => {
            if (editTarget) {
              setSupplierOverrides(m => new Map(m).set(s.id, s));
              setEditTarget(null);
              showToast(`${s.name} updated.`);
            } else {
              setAddedSuppliers(prev => [s, ...prev]);
              setAddSupplierOpen(false);
              showToast(`${s.name} added.`);
            }
          }}
        />
      )}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm bg-[#0c111c] rounded-xl border border-red-500/30 shadow-2xl p-6">
            <div className="text-[15px] font-semibold text-slate-100 mb-1">Delete supplier?</div>
            <div className="text-[12px] font-mono text-slate-500 mb-4">{deleteConfirm.name}</div>
            <div className="text-[12px] text-slate-400 mb-5">Suppliers with active lots cannot be deleted.</div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setDeletingId(deleteConfirm.id);
                  const ok = await deleteSupplier(deleteConfirm.id);
                  setDeletingId(null);
                  if (ok) {
                    setDeletedSupplierIds(prev => new Set(prev).add(deleteConfirm.id));
                    setDeleteConfirm(null);
                    showToast(`${deleteConfirm.name} deleted.`);
                  } else {
                    showToast("Delete failed — supplier may have active lots.", "red");
                    setDeleteConfirm(null);
                  }
                }}
                disabled={deletingId === deleteConfirm.id}
                className="flex-1 py-2 rounded-md bg-red-500 hover:bg-red-400 disabled:opacity-50 text-red-950 font-semibold text-[13px] flex items-center justify-center gap-2"
              >
                {deletingId === deleteConfirm.id && <span className="w-3.5 h-3.5 border-2 border-red-950/40 border-t-red-950 rounded-full animate-spin"/>}
                Delete
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 text-[13px] hover:border-slate-500">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast msg={toast.msg} tone={toast.tone} onDone={() => setToast(null)}/>}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
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
            <button
              onClick={() => exportWasteCSV(wasteEvents)}
              disabled={wasteEvents.length === 0}
              className="px-2.5 py-1 rounded-md border border-slate-700 hover:border-slate-500 text-[11px] text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >Export CSV</button>
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
