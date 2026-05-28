"use client";

import { useEffect, useMemo, useState } from "react";
import { createRetailerOrder, type BackendProduct } from "../lib/api";
import { useRetailers, useRetailerOrders } from "../lib/hooks";
import { useApp } from "../lib/context";

function orderLabel(
  po: { retailer_id: string; sku_id: string; quantity: number; requested_delivery_date: string },
  productNames: Map<string, string>,
): string {
  const retailer = po.retailer_id.replace(/_/g, " ");
  const sku = productNames.get(po.sku_id) ?? po.sku_id.replace(/^sku-/, "").replace(/-/g, " ");
  return `${retailer} · ${sku} · ${po.quantity.toLocaleString()} u · del ${po.requested_delivery_date}`;
}

export function RetailerOrdersPanel({
  products,
  initialSkuId,
  onCreated,
}: {
  products: BackendProduct[];
  initialSkuId?: string;
  onCreated?: () => void;
}) {
  const { setPendingScheduleCardId, setShowScheduleProposal } = useApp();
  const { data: retailers } = useRetailers();
  const { data: openOrders, status: ordersStatus, refetch } = useRetailerOrders("open");

  const productNames = useMemo(
    () => new Map(products.map(p => [p.sku_id, p.name])),
    [products],
  );

  const [retailerId, setRetailerId] = useState("");
  const [skuId, setSkuId] = useState(initialSkuId ?? products[0]?.sku_id ?? "");
  const [quantity, setQuantity] = useState("5000");
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (retailers.length > 0 && !retailers.some(r => r.retailer_id === retailerId)) {
      setRetailerId(retailers[0].retailer_id);
    }
  }, [retailers, retailerId]);

  useEffect(() => {
    if (initialSkuId && products.some(p => p.sku_id === initialSkuId)) {
      setSkuId(initialSkuId);
    } else if (products.length > 0 && !products.some(p => p.sku_id === skuId)) {
      setSkuId(products[0].sku_id);
    }
  }, [initialSkuId, products, skuId]);

  const matchingOpen = useMemo(
    () => openOrders.filter(o => o.sku_id === skuId),
    [openOrders, skuId],
  );

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    if (!retailerId || !skuId) {
      setError("Choose a retailer and product.");
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity must be positive.");
      return;
    }
    if (!deliveryDate) {
      setError("Choose a requested delivery date.");
      return;
    }
    setSaving(true);
    const result = await createRetailerOrder({
      retailer_id: retailerId,
      sku_id: skuId,
      quantity: qty,
      requested_delivery_date: deliveryDate,
    });
    setSaving(false);
    if (!result) {
      setError("Could not create retailer order. Check backend is up.");
      return;
    }
    setSuccess("Retailer PO created. Review the schedule proposal on the Schedule page.");
    refetch();
    onCreated?.();
    if (result.action_card_id) {
      setPendingScheduleCardId(result.action_card_id);
      setShowScheduleProposal(true);
    }
  };

  const inputCls =
    "w-full bg-slate-900 border border-slate-800 rounded-md px-2.5 py-2 text-[13px] text-slate-100 focus:outline-none focus:border-blue-500/60";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-[#0c111c] overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <div className="text-[14px] font-semibold text-slate-100">Add retailer PO</div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Firm purchase orders from retailers · triggers a production schedule proposal
          </div>
        </div>
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">Retailer</span>
            {retailers.length === 0 ? (
              <div className={`mt-1 ${inputCls} text-slate-500`}>Loading retailers…</div>
            ) : (
              <select value={retailerId} onChange={e => setRetailerId(e.target.value)} className={`mt-1 ${inputCls}`}>
                {retailers.map(r => (
                  <option key={r.retailer_id} value={r.retailer_id}>{r.name}</option>
                ))}
              </select>
            )}
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">Product (SKU)</span>
            {products.length === 0 ? (
              <div className={`mt-1 ${inputCls} text-amber-300/90`}>No products loaded — run make schema.seed</div>
            ) : (
              <select value={skuId} onChange={e => setSkuId(e.target.value)} className={`mt-1 ${inputCls}`}>
                {products.map(p => (
                  <option key={p.sku_id} value={p.sku_id}>{p.name}</option>
                ))}
              </select>
            )}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">Quantity (units)</span>
              <input type="number" min={1} value={quantity} onChange={e => setQuantity(e.target.value)} className={`mt-1 ${inputCls}`} />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">Requested delivery</span>
              <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className={`mt-1 ${inputCls} [color-scheme:dark]`} />
            </label>
          </div>
          {matchingOpen.length > 0 && (
            <p className="text-[11px] text-slate-500">
              {matchingOpen.length} open PO{matchingOpen.length === 1 ? "" : "s"} already exist for this SKU.
            </p>
          )}
          {error && <p className="text-[12px] text-red-400">{error}</p>}
          {success && <p className="text-[12px] text-emerald-400">{success}</p>}
        </div>
        <div className="flex items-center justify-end px-4 py-3 border-t border-slate-800">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || retailers.length === 0 || products.length === 0}
            className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-[13px]"
          >
            {saving ? "Creating…" : "Create retailer PO"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--bp-border-soft)] bg-[var(--bp-surface-soft)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--bp-border-soft)] flex items-center justify-between">
          <div className="text-[13px] font-semibold text-[var(--bp-text-primary)]">Open retailer POs</div>
          {ordersStatus === "live" && (
            <span className="text-[10px] text-emerald-400 font-mono">live</span>
          )}
        </div>
        {ordersStatus === "loading" ? (
          <div className="px-4 py-6 text-[12px] text-slate-500">Loading open orders…</div>
        ) : openOrders.length === 0 ? (
          <div className="px-4 py-6 text-[12px] text-slate-500">No open retailer POs yet.</div>
        ) : (
          <ul className="divide-y divide-[var(--bp-border-soft)]">
            {openOrders.map(po => (
              <li key={po.order_id} className="px-4 py-2.5 text-[12px] text-[var(--bp-text-secondary)]">
                {orderLabel(po, productNames)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
