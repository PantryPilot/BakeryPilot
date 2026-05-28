"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "../../lib/context";
import { Icon } from "../../components/Icon";
import { fetchFacilities, fetchProductionLines, fetchProducts, fetchOrders, createProductionOrder, updateOrderStatus, cancelProductionOrder, markOrderProduced, validateProduction, type BackendProductionLine, type BackendProductionOrder, type BackendProduct, type BackendFacility, type BackendValidationResult, type BackendOrder } from "../../lib/api";
import { requestShortfallTransferPlan, confirmActionCard } from "../../lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ORDER_STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  producing: "Producing",
  paused: "Paused",
  produced: "Produced",
  cancelled: "Cancelled",
};

const LINE_STATUS_LABEL: Record<string, string> = {
  idle: "Idle",
  setup: "Setup",
  producing: "Producing",
  paused: "Paused",
  maintenance: "Maintenance",
};

const LINE_STATUS_COLOR: Record<string, string> = {
  idle: "text-slate-400 bg-slate-800/50 border-slate-700",
  setup: "text-amber-300 bg-amber-900/30 border-amber-700/50",
  producing: "text-emerald-300 bg-emerald-900/30 border-emerald-700/50",
  paused: "text-orange-300 bg-orange-900/30 border-orange-700/50",
  maintenance: "text-red-300 bg-red-900/30 border-red-700/50",
};

const ORDER_STATUS_DOT: Record<string, string> = {
  planned: "bg-amber-400",
  producing: "bg-emerald-400 animate-pulse",
  paused: "bg-orange-400",
  produced: "bg-blue-400",
  cancelled: "bg-slate-600",
};

function fmtDuration(startIso: string | null): string {
  if (!startIso) return "—";
  const start = new Date(startIso);
  const mins = Math.round((Date.now() - start.getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function fmtTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg, kind, onClose }: { msg: string; kind: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl border text-[13px] font-medium max-w-sm ${kind === "success" ? "bg-emerald-950 border-emerald-500/40 text-emerald-200" : "bg-red-950 border-red-500/40 text-red-200"}`}>
      <Icon name={kind === "success" ? "check" : "warn"} size={15} />
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-200"><Icon name="x" size={13} /></button>
    </div>
  );
}

// ── Assign Product Modal ──────────────────────────────────────────────────────

function AssignModal({
  line,
  products,
  facilityId,
  onClose,
  onSuccess,
  onToast,
}: {
  line: BackendProductionLine;
  products: BackendProduct[];
  facilityId: string;
  onClose: () => void;
  onSuccess: () => void;
  onToast?: (msg: string, kind: "success" | "error") => void;
}) {
  const router = useRouter();
  const [selectedSkuId, setSelectedSkuId] = useState("");
  const [quantity, setQuantity] = useState(100);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<BackendValidationResult | null>(null);
  const [requestingKey, setRequestingKey] = useState<string | null>(null);

  const selectedProduct = products.find(p => p.sku_id === selectedSkuId);

  // Draft orders for "View draft" shortcut when a PO already exists for a shortfall ingredient.
  const [draftOrders, setDraftOrders] = useState<BackendOrder[]>([]);
  useEffect(() => {
    const hasShortfall = validation?.ingredients.some(i => i.shortfall_kg > 0) ?? false;
    if (!hasShortfall) { setDraftOrders([]); return; }
    fetchOrders().then(orders => {
      if (!orders) return;
      setDraftOrders(orders.filter(o => o.status === "draft" || o.status === "pending_confirm"));
    });
  }, [validation]);

  const draftForIngredient = (ingredientId: string): BackendOrder | null =>
    draftOrders.find(o => o.items.some(it => it.ingredient_id === ingredientId)) ?? null;

  const openSupplierOrdering = (ingredientId: string, quantityKg: number) => {
    const qs = new URLSearchParams({
      tab: "suppliers",
      source: "production_shortfall",
      po_facility_id: facilityId,
      po_items: JSON.stringify([{ id: ingredientId, qty: quantityKg }]),
    });
    router.push(`/scorecard?${qs.toString()}`);
  };

  const openSupplierOrderingAll = (items: { id: string; qty: number }[]) => {
    const qs = new URLSearchParams({
      tab: "suppliers",
      source: "production_shortfall",
      po_facility_id: facilityId,
      po_items: JSON.stringify(items),
    });
    router.push(`/scorecard?${qs.toString()}`);
  };

  const handleValidate = async (skuId: string, qty: number) => {
    if (!skuId || qty <= 0) { setValidation(null); return; }
    setValidating(true);
    const result = await validateProduction({ skuId, quantityUnits: qty, facilityId });
    setValidating(false);
    setValidation(result);
  };

  const handleSkuChange = (skuId: string) => {
    setSelectedSkuId(skuId);
    setValidation(null);
    if (skuId) handleValidate(skuId, quantity);
  };

  const handleQtyChange = (qty: number) => {
    setQuantity(qty);
    setValidation(null);
    if (selectedSkuId && qty > 0) handleValidate(selectedSkuId, qty);
  };

  const handleSubmit = async () => {
    if (!selectedSkuId) { setError("Please select a product."); return; }
    if (quantity <= 0) { setError("Quantity must be greater than 0."); return; }
    setLoading(true);
    setError(null);
    const result = await createProductionOrder({
      facility_id: facilityId,
      line_id: line.line_id,
      sku_id: selectedSkuId,
      quantity_units: quantity,
      notes: notes || undefined,
    });
    setLoading(false);
    if (!result) {
      setError("Failed to assign product. The line may already be occupied or inventory insufficient.");
      return;
    }
    onSuccess();
  };

  const handleRequestTransferPlan = async () => {
    if (!selectedSkuId || !validation?.transfer_plan) return;
    const items = validation.transfer_plan.items.flatMap(it =>
      it.sources.map(s => ({
        ingredient_id: it.ingredient_id,
        from_facility_id: s.from_facility_id,
        quantity_kg: s.transfer_kg,
      })),
    );
    if (items.length === 0) return;
    setRequestingKey("transfer-plan");
    const res = await requestShortfallTransferPlan({
      facility_id: facilityId,
      requested_by_sku_id: selectedSkuId,
      requested_units: quantity,
      items,
    });
    if (!res?.action_card_id) {
      setRequestingKey(null);
      setError("Failed to request transfer plan.");
      onToast?.("Transfer request failed", "error");
      return;
    }
    const confirmed = await confirmActionCard(res.action_card_id);
    setRequestingKey(null);
    setError(null);
    if (!confirmed) {
      onToast?.("Transfer plan created but execution failed — check action cards", "error");
    } else {
      onToast?.("Transfer executed — lots moved", "success");
      await handleValidate(selectedSkuId, quantity);
    }
  };


  const shortfallIngredients = validation?.ingredients.filter(i => i.shortfall_kg > 0) ?? [];
  const transferPlan = validation?.transfer_plan ?? null;
  const substituteSkus = validation?.substitute_skus ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      style={{ animation: "popup-in 180ms ease-out both" }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl border border-slate-800 bg-[#0c111c] shadow-2xl overflow-hidden"
        style={{ animation: "popup-in 220ms ease-out both" }}
      >
        {/* Header (sticky) */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <div className="text-[15px] font-semibold text-slate-100">Assign Production</div>
            <div className="text-[12px] text-slate-500 mt-0.5 font-mono">{line.name}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Icon name="x" size={16} /></button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Product + Quantity row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Product</label>
              <select
                value={selectedSkuId}
                onChange={e => handleSkuChange(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-slate-700 bg-slate-900 text-slate-100 text-[13px] focus:outline-none focus:border-blue-500"
              >
                <option value="">Select a product…</option>
                {products.map(p => (
                  <option key={p.sku_id} value={p.sku_id}>{p.name} ({p.category})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Quantity</label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={e => handleQtyChange(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-md border border-slate-700 bg-slate-900 text-slate-100 text-[13px] font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Morning run"
              className="w-full h-9 px-3 rounded-md border border-slate-700 bg-slate-900 text-slate-200 text-[13px] focus:outline-none focus:border-blue-500 placeholder:text-slate-500"
            />
          </div>

          {/* Ingredient availability — always show once a product is selected */}
          {selectedProduct && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/40">
              <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-slate-500">Ingredients ({quantity} units)</span>
                {validating && <span className="text-[10px] text-slate-500 flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 border border-slate-500 border-t-slate-300 rounded-full animate-spin"/>checking…</span>}
              </div>
              <div className="p-3 space-y-1.5">
                {/* Prefer validation.ingredients (has live availability); fall back to recipe during loading */}
                {validation?.ingredients && validation.ingredients.length > 0
                  ? validation.ingredients.map(i => {
                      const ok = i.shortfall_kg === 0;
                      return (
                        <div key={i.ingredient_id} className="flex items-center justify-between text-[12px]">
                          <span className={ok ? "text-slate-200" : "text-red-300"}>{i.name}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400 font-mono">{i.needed_kg.toFixed(1)} kg</span>
                            <span className={`text-[10px] font-mono w-20 text-right ${ok ? "text-emerald-400" : "text-red-400"}`}>
                              {ok ? `✓ ${i.available_kg.toFixed(1)} avail` : `✗ short ${i.shortfall_kg.toFixed(1)}`}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  : selectedProduct.recipe.length > 0
                    ? selectedProduct.recipe.map(r => (
                        <div key={r.ingredient_id} className="flex items-center justify-between text-[12px] text-slate-400">
                          <span>{r.ingredient_name}</span>
                          <span className="font-mono">{(r.kg_per_unit * quantity).toFixed(1)} kg</span>
                        </div>
                      ))
                    : !validating && (
                        <div className="text-[12px] text-slate-500 italic">No recipe configured for this product.</div>
                      )
                }
              </div>
            </div>
          )}

          {/* Feasibility warning */}
          {validation && !validation.feasible && (
            <div className="flex items-start gap-2 rounded-md border border-red-700/40 bg-red-900/20 px-3 py-2.5">
              <Icon name="warn" size={14} className="text-red-400 shrink-0 mt-0.5" />
              <span className="text-[12px] text-red-300">Some ingredients are short. Use the options below to resolve before producing.</span>
            </div>
          )}

          {/* Resolution options (order-level) */}
          {shortfallIngredients.length > 0 && (
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Resolution options</div>

              {/* Option A — Transfer plan */}
              {transferPlan ? (
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Icon name="truck" size={12} className="text-blue-300 shrink-0" />
                      <span className="text-[12px] font-medium text-slate-100">Transfer plan</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          transferPlan.fully_covers
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                        }`}
                      >
                        {transferPlan.fully_covers ? "Covers all" : "Partial"}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {transferPlan.total_covered_kg.toFixed(1)} / {transferPlan.total_shortfall_kg.toFixed(1)} kg
                    </span>
                  </div>

                  <div className="px-3 py-2.5 space-y-2">
                    {transferPlan.items.map(it => (
                      <div key={it.ingredient_id} className="text-[12px]">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-slate-200 truncate">{it.ingredient_name}</span>
                          <span className={`text-[10px] font-mono shrink-0 ${it.uncovered_kg > 0 ? "text-amber-300" : "text-emerald-300"}`}>
                            need {it.shortfall_kg.toFixed(1)} kg
                          </span>
                        </div>
                        {it.sources.length > 0 ? (
                          <ul className="pl-3 space-y-0.5">
                            {it.sources.map((s, idx) => (
                              <li key={`${s.from_facility_id}-${idx}`} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <span className="text-slate-600">→</span>
                                <span className="text-slate-300">{s.from_facility_name}</span>
                                <span className="font-mono text-slate-400">{s.transfer_kg.toFixed(1)} kg</span>
                              </li>
                            ))}
                            {it.uncovered_kg > 0 && (
                              <li className="flex items-center gap-1.5 text-[11px] text-amber-400">
                                <span className="text-amber-500">!</span>
                                <span>still short</span>
                                <span className="font-mono">{it.uncovered_kg.toFixed(1)} kg</span>
                              </li>
                            )}
                          </ul>
                        ) : (
                          <div className="pl-3 flex items-center justify-between gap-2">
                            <div className="text-[11px] text-amber-400 flex items-center gap-1.5">
                              <Icon name="warn" size={10} /> No other facility has stock
                            </div>
                            {(() => {
                              const draft = draftForIngredient(it.ingredient_id);
                              return draft ? (
                                <button
                                  onClick={() => router.push(`/scorecard?tab=suppliers&open_supplier=${encodeURIComponent(draft.supplier_id)}`)}
                                  className="shrink-0 h-7 px-2.5 rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 text-[11px] font-medium transition"
                                >
                                  View draft PO
                                </button>
                              ) : (
                                <button
                                  onClick={() => openSupplierOrdering(it.ingredient_id, it.uncovered_kg > 0 ? it.uncovered_kg : it.shortfall_kg)}
                                  className="shrink-0 h-7 px-2.5 rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 text-[11px] font-medium transition"
                                >
                                  Order from supplier
                                </button>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="px-3 py-2 border-t border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">
                      {transferPlan.fully_covers
                        ? "Plan covers full shortfall."
                        : `Plan leaves ${transferPlan.total_uncovered_kg.toFixed(1)} kg short — production will still fail.`}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {!transferPlan.fully_covers && (
                        <button
                          onClick={() => {
                            const uncovered = transferPlan.items
                              .filter(it => it.uncovered_kg > 0)
                              .map(it => ({ id: it.ingredient_id, qty: it.uncovered_kg }));
                            if (uncovered.length > 0) openSupplierOrderingAll(uncovered);
                          }}
                          className="h-7 px-2.5 rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 text-[11px] font-medium transition"
                        >
                          {transferPlan.items.filter(it => it.uncovered_kg > 0).length > 1 ? "Order all missing" : "Order missing"}
                        </button>
                      )}
                      <button
                        onClick={handleRequestTransferPlan}
                        disabled={requestingKey === "transfer-plan" || transferPlan.total_covered_kg === 0}
                        className="h-7 px-3 rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-[11px] font-medium transition flex items-center gap-1.5"
                      >
                        {requestingKey === "transfer-plan" && <span className="w-3 h-3 border-2 border-blue-300/30 border-t-blue-300 rounded-full animate-spin"/>}
                        {requestingKey === "transfer-plan" ? "Requesting" : "Request transfers"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Option B — Switch product (order-level alternatives only) */}
              {substituteSkus.length > 0 && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
                  <div className="px-3 py-2 border-b border-slate-800 flex items-center gap-1.5">
                    <Icon name="diff" size={12} className="text-emerald-300 shrink-0" />
                    <span className="text-[12px] font-medium text-slate-100">Produce a different product instead</span>
                    <span className="text-[10px] text-slate-500 ml-auto">stock-feasible at this facility</span>
                  </div>
                  <div className="px-3 py-2 space-y-1.5">
                    {substituteSkus.slice(0, 4).map(s => {
                      return (
                        <div key={s.sku_id} className="flex items-center justify-between gap-2 text-[12px]">
                          <div className="min-w-0 flex-1">
                            <div className="text-slate-200 truncate">{s.sku_name}</div>
                            <div className={`text-[10px] font-mono ${s.covers_requested_units ? "text-emerald-400" : "text-amber-400"}`}>
                              {s.covers_requested_units
                                ? `can produce ${quantity} units`
                                : `up to ${s.achievable_quantity} units only`}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              handleSkuChange(s.sku_id);
                              if (!s.covers_requested_units && s.achievable_quantity > 0) {
                                handleQtyChange(s.achievable_quantity);
                              }
                            }}
                            className="shrink-0 h-7 px-2.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-[11px] font-medium transition"
                          >
                            Select
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Option C — Order from supplier (always shown when there are shortfalls) */}
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Icon name="truck" size={12} className="text-violet-300 shrink-0" />
                    <span className="text-[12px] font-medium text-slate-100">Order from supplier</span>
                  </div>
                  {shortfallIngredients.length > 1 && (
                    <button
                      onClick={() => openSupplierOrderingAll(shortfallIngredients.map(i => ({ id: i.ingredient_id, qty: i.shortfall_kg })))}
                      className="shrink-0 h-7 px-2.5 rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 text-[11px] font-medium transition"
                    >
                      Order all ({shortfallIngredients.length})
                    </button>
                  )}
                </div>
                <div className="divide-y divide-slate-800/60">
                  {shortfallIngredients.map(i => {
                    const draft = draftForIngredient(i.ingredient_id);
                    return (
                      <div key={i.ingredient_id} className="px-3 py-2 flex items-center justify-between gap-2 text-[12px]">
                        <span className="text-slate-200 truncate">{i.name ?? i.ingredient_id}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono text-red-400 text-[11px]">short {i.shortfall_kg.toFixed(1)} kg</span>
                          {draft ? (
                            <button
                              onClick={() => router.push(`/scorecard?tab=suppliers&open_supplier=${encodeURIComponent(draft.supplier_id)}`)}
                              className="h-7 px-2.5 rounded-md border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 text-[11px] font-medium transition"
                            >
                              View draft PO
                            </button>
                          ) : (
                            <button
                              onClick={() => openSupplierOrdering(i.ingredient_id, i.shortfall_kg)}
                              className="h-7 px-2.5 rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 text-[11px] font-medium transition"
                            >
                              Order
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-[12px] text-red-400 flex items-center gap-1.5">
              <Icon name="warn" size={13} /> {error}
            </div>
          )}
        </div>

        {/* Footer (sticky) */}
        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-800">
          <button onClick={onClose} className="px-4 h-9 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 text-[13px] transition">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={loading || !selectedSkuId || quantity <= 0}
            className="h-9 px-4 rounded-md bg-blue-500 hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-semibold transition flex items-center gap-2"
          >
            {loading && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {loading ? "Assigning…" : "Assign to Line"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Produce Confirm Modal ─────────────────────────────────────────────────────

function ProduceModal({
  order,
  facilityId,
  onClose,
  onConfirm,
}: {
  order: BackendProductionOrder;
  facilityId: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [validation, setValidation] = useState<BackendValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    validateProduction({ skuId: order.sku_id, quantityUnits: order.quantity_units, facilityId })
      .then(r => { setValidation(r); setChecking(false); });
  }, [order.sku_id, order.quantity_units, facilityId]);

  const feasible = validation?.feasible ?? false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      style={{ animation: "popup-in 180ms ease-out both" }}
    >
      <div
        className="w-full max-w-md max-h-[90vh] flex flex-col rounded-xl border border-slate-800 bg-[#0c111c] shadow-2xl overflow-hidden"
        style={{ animation: "popup-in 220ms ease-out both" }}
      >
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <div className="text-[15px] font-semibold text-slate-100">Confirm Production</div>
            <div className="text-[12px] text-slate-500 mt-0.5">{order.sku_name} · {order.quantity_units} units</div>
          </div>
          <button onClick={onClose} disabled={loading} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Icon name="x" size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {checking ? (
            <div className="flex items-center gap-2 text-[13px] text-slate-400">
              <span className="inline-block w-4 h-4 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
              Checking ingredient availability…
            </div>
          ) : (
            <>
              {/* Ingredient consumption — always show when validation is loaded */}
              {validation && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Ingredients to consume</div>
                  {validation.ingredients.length === 0 ? (
                    <div className="text-[12px] text-slate-500 italic">No recipe configured for this product.</div>
                  ) : (
                    <div className="space-y-1">
                      {validation.ingredients.map(i => (
                        <div key={i.ingredient_id} className="flex items-center justify-between text-[12px]">
                          <span className={i.shortfall_kg > 0 ? "text-red-300" : "text-slate-300"}>{i.name}</span>
                          <div className="flex items-center gap-2 font-mono">
                            <span className="text-slate-400">{i.needed_kg.toFixed(1)} kg</span>
                            {i.shortfall_kg > 0
                              ? <span className="text-red-400 text-[10px]">✗ short {i.shortfall_kg.toFixed(1)}</span>
                              : <span className="text-emerald-400 text-[10px]">✓</span>
                            }
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Finished goods addition */}
              <div className="rounded-md border border-emerald-700/40 bg-emerald-900/10 px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">Finished goods to add</div>
                <div className="text-[13px] text-emerald-300 font-medium">+{order.quantity_units} units of {order.sku_name}</div>
              </div>

              {!feasible && (
                <div className="flex items-start gap-2 rounded-md border border-red-700/40 bg-red-900/20 px-3 py-2.5">
                  <Icon name="warn" size={14} className="text-red-400 shrink-0 mt-0.5" />
                  <span className="text-[12px] text-red-300">Insufficient ingredients. Production will be rejected by the backend.</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-800">
          <button onClick={onClose} disabled={loading} className="h-9 px-4 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 text-[13px] transition">Cancel</button>
          <button
            onClick={() => { setLoading(true); onConfirm(); }}
            disabled={loading || checking || !feasible}
            className="h-9 px-4 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-semibold transition flex items-center gap-2"
          >
            {loading && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {loading ? "Processing…" : "Mark as Produced"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Production Line Card ───────────────────────────────────────────────────────

function LineCard({
  line,
  facilityId,
  products,
  onRefresh,
  onToast,
}: {
  line: BackendProductionLine;
  facilityId: string;
  products: BackendProduct[];
  onRefresh: () => void;
  onToast: (msg: string, kind: "success" | "error") => void;
}) {
  const [showAssign, setShowAssign] = useState(false);
  const [showProduce, setShowProduce] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const order = line.current_order;

  const handleStatus = async (newStatus: string) => {
    if (!order) return;
    setActionLoading(newStatus);
    const result = await updateOrderStatus(order.order_id, newStatus);
    setActionLoading(null);
    if (!result) { onToast("Failed to update status.", "error"); return; }
    onToast(`Order moved to ${ORDER_STATUS_LABEL[newStatus] ?? newStatus}.`, "success");
    onRefresh();
  };

  const handleCancel = async () => {
    if (!order) return;
    setActionLoading("cancel");
    const result = await cancelProductionOrder(order.order_id);
    setActionLoading(null);
    if (!result) { onToast("Failed to cancel order.", "error"); return; }
    onToast("Order cancelled.", "success");
    onRefresh();
  };

  const handleProduce = async () => {
    if (!order) return;
    setShowProduce(false);
    setActionLoading("produce");
    const result = await markOrderProduced(order.order_id);
    setActionLoading(null);
    if (!result) { onToast("Production failed — check ingredient inventory.", "error"); return; }
    onToast(`${result.order.sku_name} production complete! ${result.order.quantity_units} units added to inventory.`, "success");
    onRefresh();
  };

  const isLoading = actionLoading !== null;
  const statusColor = LINE_STATUS_COLOR[line.status] ?? LINE_STATUS_COLOR.idle;

  return (
    <>
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700 transition-colors">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-slate-100 truncate">{line.name}</div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
              {line.capacity_kg_per_hour.toLocaleString()} kg/hr capacity
            </div>
          </div>
          <span className={`shrink-0 px-2 py-0.5 rounded-md border text-[11px] font-medium ${statusColor}`}>
            {LINE_STATUS_LABEL[line.status] ?? line.status}
          </span>
        </div>

        {/* Current order */}
        {order ? (
          <div className="rounded-md border border-slate-700/60 bg-slate-800/40 p-3 mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${ORDER_STATUS_DOT[order.status] ?? "bg-slate-500"}`} />
              <span className="text-[12px] font-medium text-slate-200 flex-1 truncate">{order.sku_name}</span>
              <span className="text-[10px] text-slate-500">{ORDER_STATUS_LABEL[order.status]}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
              <div className="text-slate-500">Quantity <span className="text-slate-300 font-mono">{order.quantity_units.toLocaleString()} units</span></div>
              {order.actual_start_at && (
                <div className="text-slate-500">Running <span className="text-slate-300 font-mono">{fmtDuration(order.actual_start_at)}</span></div>
              )}
              {order.planned_start_at && !order.actual_start_at && (
                <div className="text-slate-500">Planned <span className="text-slate-300 font-mono">{fmtTime(order.planned_start_at)}</span></div>
              )}
              {order.notes && (
                <div className="col-span-2 text-slate-500 truncate">{order.notes}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-slate-800 border-dashed px-3 py-3 mb-3 text-center text-[12px] text-slate-600">
            No active order
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {/* Idle → assign */}
          {(line.status === "idle" || line.status === "maintenance") && (
            <button
              onClick={() => setShowAssign(true)}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600/80 hover:bg-blue-600 text-white text-[12px] font-medium transition disabled:opacity-50"
            >
              <Icon name="play" size={13} /> Assign Product
            </button>
          )}

          {/* Planned → Start */}
          {order?.status === "planned" && (
            <button
              onClick={() => handleStatus("producing")}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-700/80 hover:bg-emerald-700 text-white text-[12px] font-medium transition disabled:opacity-50"
            >
              {actionLoading === "producing" ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Icon name="play" size={13} />}
              Start
            </button>
          )}

          {/* Producing → Pause */}
          {order?.status === "producing" && (
            <button
              onClick={() => handleStatus("paused")}
              disabled={isLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[12px] transition disabled:opacity-50"
            >
              {actionLoading === "paused" ? <span className="w-3 h-3 border-2 border-slate-400/30 border-t-slate-300 rounded-full animate-spin" /> : <Icon name="pause" size={13} />}
              Pause
            </button>
          )}

          {/* Paused → Resume */}
          {order?.status === "paused" && (
            <button
              onClick={() => handleStatus("producing")}
              disabled={isLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-700/80 hover:bg-emerald-700 text-white text-[12px] font-medium transition disabled:opacity-50"
            >
              {actionLoading === "producing" ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Icon name="play" size={13} />}
              Resume
            </button>
          )}

          {/* Produce */}
          {order && ["planned", "producing", "paused"].includes(order.status) && (
            <button
              onClick={() => setShowProduce(true)}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-medium transition disabled:opacity-50"
            >
              {actionLoading === "produce" ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Icon name="check" size={13} />}
              Mark Produced
            </button>
          )}

          {/* Cancel */}
          {order && ["planned", "producing", "paused"].includes(order.status) && (
            <button
              onClick={handleCancel}
              disabled={isLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-red-900/40 bg-red-950/30 hover:bg-red-900/50 text-red-300 text-[12px] transition disabled:opacity-50"
            >
              {actionLoading === "cancel" ? <span className="w-3 h-3 border-2 border-red-400/30 border-t-red-300 rounded-full animate-spin" /> : <Icon name="x" size={13} />}
              Cancel
            </button>
          )}
        </div>

        {/* Allergen tags */}
        {line.supported_allergen_tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {line.supported_allergen_tags.map(tag => (
              <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-500 border border-slate-700/50">{tag}</span>
            ))}
          </div>
        )}
      </div>

      {showAssign && (
        <AssignModal
          line={line}
          products={products}
          facilityId={facilityId}
          onClose={() => setShowAssign(false)}
          onSuccess={() => { setShowAssign(false); onToast(`Order assigned to ${line.name}.`, "success"); onRefresh(); }}
          onToast={onToast}
        />
      )}

      {showProduce && order && (
        <ProduceModal
          order={order}
          facilityId={facilityId}
          onClose={() => setShowProduce(false)}
          onConfirm={handleProduce}
        />
      )}
    </>
  );
}

// ── Facility resolver ─────────────────────────────────────────────────────────

const SHORT_CODE_TO_ID: Record<string, string> = {
  p1: "plant-toronto",
  p2: "plant-mississauga",
  p3: "plant-hamilton",
  p4: "plant-montreal",
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProductionPage() {
  const { facility, t } = useApp();

  const [facilities, setFacilities] = useState<BackendFacility[]>([]);
  const [lines, setLines] = useState<BackendProductionLine[]>([]);
  const [products, setProducts] = useState<BackendProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "success" | "error" } | null>(null);

  // Resolve active facility backend ID from the context short code
  const activeFacilityId = facility === "all" ? null : (SHORT_CODE_TO_ID[facility] ?? null);

  const activeFacility = facilities.find(f => f.facility_id === activeFacilityId) ?? facilities[0];

  const load = useCallback(async (opts?: { background?: boolean }) => {
    const background = opts?.background ?? false;
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    const [facilitiesData, linesData, productsData] = await Promise.all([
      fetchFacilities(),
      fetchProductionLines(activeFacilityId ?? undefined),
      fetchProducts(),
    ]);
    if (background) setRefreshing(false);
    else setLoading(false);
    if (!linesData || !productsData) {
      setError("Failed to load production data. Check that the backend is running.");
      return;
    }
    setFacilities(facilitiesData ?? []);
    setLines(linesData);
    setProducts(productsData);
  }, [activeFacilityId]);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string, kind: "success" | "error") => {
    setToast({ msg, kind });
  };

  // Summary stats
  const idleCount = lines.filter(l => l.status === "idle").length;
  const producingCount = lines.filter(l => l.status === "producing").length;
  const setupCount = lines.filter(l => l.status === "setup").length;
  const pausedCount = lines.filter(l => l.status === "paused").length;
  const maintenanceCount = lines.filter(l => l.status === "maintenance").length;

  return (
    <div className="flex flex-col h-full overflow-auto bg-[#0a0d14]">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-slate-800/60 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-semibold text-slate-100 flex items-center gap-2">
              <Icon name="factory" size={20} className="text-blue-400" />
              {t("production.title")}
            </h1>
            <p className="text-[13px] text-slate-500 mt-0.5">
              {activeFacility ? `${activeFacility.name} · ${activeFacility.city ?? ""}` : t("materials.all_facilities")}
              {activeFacilityId === null && " — select a facility in the top bar to filter lines"}
            </p>
          </div>
          <button
            onClick={() => load({ background: lines.length > 0 })}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-700 hover:bg-slate-800 text-slate-300 text-[12px] transition disabled:opacity-50"
          >
            <Icon name="spark" size={13} className={loading || refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {/* Summary chips */}
        {!loading && lines.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-700 bg-slate-800/50 text-[12px]">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              <span className="text-slate-400">{idleCount} Idle</span>
            </div>
            {setupCount > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-amber-700/40 bg-amber-900/20 text-[12px]">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-amber-300">{setupCount} Setup</span>
              </div>
            )}
            {producingCount > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-700/40 bg-emerald-900/20 text-[12px]">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-300">{producingCount} Producing</span>
              </div>
            )}
            {pausedCount > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-orange-700/40 bg-orange-900/20 text-[12px]">
                <span className="w-2 h-2 rounded-full bg-orange-400" />
                <span className="text-orange-300">{pausedCount} Paused</span>
              </div>
            )}
            {maintenanceCount > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-red-700/40 bg-red-900/20 text-[12px]">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-red-300">{maintenanceCount} Maintenance</span>
              </div>
            )}
            {refreshing && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-blue-700/40 bg-blue-900/20 text-[12px]">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-blue-300">Updating…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 py-5">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <span className="w-8 h-8 border-2 border-slate-700 border-t-blue-400 rounded-full animate-spin" />
              <span className="text-[13px] text-slate-500">Loading production data…</span>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Icon name="warn" size={32} className="text-red-400" />
            <div className="text-center">
              <div className="text-[14px] text-slate-200 font-medium">Failed to load</div>
              <div className="text-[13px] text-slate-500 mt-1">{error}</div>
            </div>
            <button onClick={() => { void load(); }} className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[13px] transition">
              Try again
            </button>
          </div>
        )}

        {!loading && !error && lines.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Icon name="factory" size={36} className="text-slate-700" />
            <div className="text-center">
              <div className="text-[14px] text-slate-400 font-medium">No production lines found</div>
              <div className="text-[13px] text-slate-600 mt-1">
                {activeFacilityId ? "No lines are configured for this facility." : "Select a facility to see its production lines."}
              </div>
            </div>
          </div>
        )}

        {!loading && !error && lines.length > 0 && (
          activeFacilityId === null ? (
            // Per-facility grouped view when "All facilities" is selected
            <div className="space-y-8">
              {facilities
                .map(f => ({ facility: f, fLines: lines.filter(l => l.facility_id === f.facility_id) }))
                .filter(g => g.fLines.length > 0)
                .map(({ facility, fLines }) => (
                  <div key={facility.facility_id}>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
                      <Icon name="factory" size={14} className="text-blue-400 shrink-0" />
                      <span className="text-[13px] font-semibold text-slate-200">{facility.name}</span>
                      {facility.city && <span className="text-[12px] text-slate-500">{facility.city}</span>}
                      <span className="ml-auto text-[11px] text-slate-500 font-mono">{fLines.length} line{fLines.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {fLines.map(line => (
                        <LineCard
                          key={line.line_id}
                          line={line}
                          facilityId={facility.facility_id}
                          products={products}
                          onRefresh={() => load({ background: true })}
                          onToast={showToast}
                        />
                      ))}
                    </div>
                  </div>
                ))
              }
            </div>
          ) : (
            // Single facility flat view
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {lines.map(line => (
                <LineCard
                  key={line.line_id}
                  line={line}
                  facilityId={activeFacilityId}
                  products={products}
                  onRefresh={() => load({ background: true })}
                  onToast={showToast}
                />
              ))}
            </div>
          )
        )}
      </div>

      {toast && (
        <Toast msg={toast.msg} kind={toast.kind} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
