"use client";
import { useState, useEffect, useCallback } from "react";
import { useApp } from "../../lib/context";
import { Icon } from "../../components/Icon";
import { fetchFacilities, fetchProductionLines, fetchProducts, createProductionOrder, updateOrderStatus, cancelProductionOrder, markOrderProduced, validateProduction, type BackendProductionLine, type BackendProductionOrder, type BackendProduct, type BackendFacility, type BackendValidationResult } from "../../lib/api";

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
}: {
  line: BackendProductionLine;
  products: BackendProduct[];
  facilityId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedSkuId, setSelectedSkuId] = useState("");
  const [quantity, setQuantity] = useState(100);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<BackendValidationResult | null>(null);

  const selectedProduct = products.find(p => p.sku_id === selectedSkuId);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-[#0c111c] shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <div className="text-[15px] font-semibold text-slate-100">Assign Production</div>
            <div className="text-[12px] text-slate-500 mt-0.5 font-mono">{line.name}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Icon name="x" size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Product selector */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Product</label>
            <select
              value={selectedSkuId}
              onChange={e => handleSkuChange(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-900 text-slate-100 text-[13px] focus:outline-none focus:border-blue-500"
            >
              <option value="">Select a product…</option>
              {products.map(p => (
                <option key={p.sku_id} value={p.sku_id}>{p.name} ({p.category})</option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Quantity (units)</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={e => handleQtyChange(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-900 text-slate-100 text-[13px] font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Morning run"
              className="w-full px-3 py-2 rounded-md border border-slate-700 bg-slate-900 text-slate-400 text-[13px] focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
            />
          </div>

          {/* Recipe preview */}
          {selectedProduct && selectedProduct.recipe.length > 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Ingredient requirements ({quantity} units)</div>
              <div className="space-y-1">
                {selectedProduct.recipe.map(r => {
                  const totalKg = r.kg_per_unit * quantity;
                  const detail = validation?.ingredients.find(i => i.ingredient_id === r.ingredient_id);
                  const ok = !detail || detail.shortfall_kg === 0;
                  return (
                    <div key={r.ingredient_id} className="flex items-center justify-between text-[12px]">
                      <span className={ok ? "text-slate-300" : "text-red-300"}>{r.ingredient_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-mono">{totalKg.toFixed(1)} kg</span>
                        {detail && (
                          <span className={`text-[10px] font-mono ${ok ? "text-emerald-400" : "text-red-400"}`}>
                            {ok ? `✓ ${detail.available_kg.toFixed(1)} avail` : `✗ short ${detail.shortfall_kg.toFixed(1)} kg`}
                          </span>
                        )}
                        {validating && !detail && <span className="text-[10px] text-slate-600">checking…</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Feasibility warning */}
          {validation && !validation.feasible && (
            <div className="flex items-start gap-2 rounded-md border border-red-700/40 bg-red-900/20 px-3 py-2.5">
              <Icon name="warn" size={14} className="text-red-400 shrink-0 mt-0.5" />
              <span className="text-[12px] text-red-300">Insufficient ingredient inventory for this batch. You can still assign the order but production will fail on completion.</span>
            </div>
          )}

          {error && (
            <div className="text-[12px] text-red-400 flex items-center gap-1.5">
              <Icon name="warn" size={13} /> {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 text-[13px] transition">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={loading || !selectedSkuId || quantity <= 0}
            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-medium transition flex items-center gap-2"
          >
            {loading ? <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#0c111c] shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <div className="text-[15px] font-semibold text-slate-100">Confirm Production</div>
            <div className="text-[12px] text-slate-500 mt-0.5">{order.sku_name} · {order.quantity_units} units</div>
          </div>
          <button onClick={onClose} disabled={loading} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Icon name="x" size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {checking ? (
            <div className="flex items-center gap-2 text-[13px] text-slate-400">
              <span className="inline-block w-4 h-4 border-2 border-slate-600 border-t-slate-300 rounded-full animate-spin" />
              Checking ingredient availability…
            </div>
          ) : (
            <>
              {/* Ingredient consumption */}
              {validation && validation.ingredients.length > 0 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Ingredients to consume</div>
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

        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 text-[13px] transition">Cancel</button>
          <button
            onClick={() => { setLoading(true); onConfirm(); }}
            disabled={loading || checking || !feasible}
            className="px-4 py-2 rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-medium transition flex items-center gap-2"
          >
            {loading ? <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
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
  const { facility } = useApp();

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
              Production
            </h1>
            <p className="text-[13px] text-slate-500 mt-0.5">
              {activeFacility ? `${activeFacility.name} · ${activeFacility.city ?? ""}` : "All facilities"}
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
            <button onClick={load} className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[13px] transition">
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
          <>
            {/* Facility group header when showing all */}
            {activeFacilityId === null && (
              <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-4">All facilities · {lines.length} lines</div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {lines.map(line => (
                <LineCard
                  key={line.line_id}
                  line={line}
                  facilityId={activeFacilityId ?? line.facility_id}
                  products={products}
                  onRefresh={() => load({ background: true })}
                  onToast={showToast}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {toast && (
        <Toast msg={toast.msg} kind={toast.kind} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
