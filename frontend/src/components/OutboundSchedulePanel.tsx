"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import {
  createOutboundShipment,
  deleteOutboundShipment,
  type BackendFacility,
  type BackendProduct,
  type BackendRetailerOrder,
} from "../lib/api";
import { useOutboundShipments, useRetailerOrders, useWarehouseStock } from "../lib/hooks";

const FACILITY_MAP: Record<string, string> = {
  "plant-toronto": "p1",
  "plant-mississauga": "p2",
  "plant-hamilton": "p3",
  "plant-montreal": "p4",
};

const PLANT_TO_FACILITY: Record<string, string> = {
  p1: "plant-toronto",
  p2: "plant-mississauga",
  p3: "plant-hamilton",
  p4: "plant-montreal",
};

const LANE_H = 44;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const GANTT_HEADER_H = 36;

type OutboundRun = {
  id: string;
  facilityId: string;
  plant: string;
  sku: string;
  skuName: string;
  qty: number;
  start: number;
  end: number;
  dateKey: string;
  retailerName: string;
  retailerId: string;
  deliveryDate?: string;
};

type OutboundLane = {
  key: string;
  facilityId: string;
  label: string;
  runs: OutboundRun[];
};

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timelineHour(d: Date): number {
  return d.getHours() + d.getMinutes() / 60;
}

function hourLeftPct(hour: number, timelineStart: number, slotCount: number): number {
  return ((hour - timelineStart) / slotCount) * 100;
}

function hourWidthPct(start: number, end: number, slotCount: number): number {
  return ((end - start) / slotCount) * 100;
}

function isoFromDateAndTime(dateKey: string, time: string): string {
  const [hh, mm] = time.split(":").map(v => parseInt(v, 10));
  const [y, m, day] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, day, hh || 0, mm || 0, 0, 0).toISOString();
}

function shipmentsToRuns(
  shipments: ReturnType<typeof useOutboundShipments>["data"],
  productNames: Map<string, string>,
): OutboundRun[] {
  return shipments
    .filter(s => s.status !== "cancelled" && s.status !== "delivered")
    .map(s => {
      const start = new Date(s.start_at);
      const end = new Date(s.end_at);
      return {
        id: s.shipment_id,
        facilityId: s.facility_id,
        plant: FACILITY_MAP[s.facility_id] ?? s.facility_id,
        sku: s.sku_id,
        skuName: s.sku_name ?? productNames.get(s.sku_id) ?? s.sku_id,
        qty: s.quantity_units,
        start: timelineHour(start),
        end: timelineHour(end),
        dateKey: toDateKey(start),
        retailerName: s.retailer_name ?? s.retailer_id.replace(/_/g, " "),
        retailerId: s.retailer_id,
        deliveryDate: s.requested_delivery_date ?? undefined,
      };
    });
}

function retailerOrderLabel(po: BackendRetailerOrder, productNames: Map<string, string>): string {
  const retailer = po.retailer_id.replace(/_/g, " ");
  const sku = productNames.get(po.sku_id) ?? po.sku_id.replace(/^sku-/, "").replace(/-/g, " ");
  return `${retailer} · ${sku} · ${po.quantity.toLocaleString()} u · del ${po.requested_delivery_date}`;
}

function AddOutboundModal({
  activeDate,
  defaultFacilityId,
  facilities,
  productNames,
  onClose,
  onSuccess,
}: {
  activeDate: string;
  defaultFacilityId: string;
  facilities: BackendFacility[];
  productNames: Map<string, string>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [facilityId, setFacilityId] = useState(defaultFacilityId || facilities[0]?.facility_id || "");
  const { data: stock } = useWarehouseStock(facilityId);
  const { data: openOrders, status: ordersStatus } = useRetailerOrders("open");
  const [skuId, setSkuId] = useState("");
  const [retailerOrderId, setRetailerOrderId] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("12:00");
  const [quantity, setQuantity] = useState("500");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stockForSku = useMemo(
    () => stock.find(s => s.sku_id === skuId),
    [stock, skuId],
  );

  const matchingOrders = useMemo(
    () => openOrders.filter(o => o.sku_id === skuId),
    [openOrders, skuId],
  );

  const selectedPo = useMemo(
    () => openOrders.find(o => o.order_id === retailerOrderId),
    [openOrders, retailerOrderId],
  );

  useEffect(() => {
    if (stock.length > 0 && !stock.some(s => s.sku_id === skuId)) {
      setSkuId(stock[0].sku_id);
    }
  }, [stock, skuId]);

  useEffect(() => {
    if (matchingOrders.length > 0 && !matchingOrders.some(o => o.order_id === retailerOrderId)) {
      setRetailerOrderId(matchingOrders[0].order_id);
    } else if (matchingOrders.length === 0) {
      setRetailerOrderId("");
    }
  }, [matchingOrders, retailerOrderId]);

  useEffect(() => {
    if (selectedPo) setQuantity(String(Math.min(selectedPo.quantity, stockForSku?.available_units ?? selectedPo.quantity)));
  }, [selectedPo, stockForSku]);

  useEffect(() => {
    if (defaultFacilityId) setFacilityId(defaultFacilityId);
  }, [defaultFacilityId]);

  const handleSubmit = async () => {
    setError(null);
    if (!facilityId || !skuId || !retailerOrderId) {
      setError("Choose warehouse, in-stock product, and retailer PO.");
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity must be positive.");
      return;
    }
    if (stockForSku && qty > stockForSku.available_units) {
      setError(`Only ${stockForSku.available_units.toLocaleString()} units in warehouse.`);
      return;
    }
    if (selectedPo && qty > selectedPo.quantity) {
      setError(`Quantity cannot exceed PO (${selectedPo.quantity.toLocaleString()} units).`);
      return;
    }
    const start_at = isoFromDateAndTime(activeDate, startTime);
    const end_at = isoFromDateAndTime(activeDate, endTime);
    if (new Date(end_at) <= new Date(start_at)) {
      setError("End time must be after start time.");
      return;
    }
    setSaving(true);
    const created = await createOutboundShipment({
      facility_id: facilityId,
      retailer_order_id: retailerOrderId,
      sku_id: skuId,
      start_at,
      end_at,
      quantity_units: qty,
    });
    setSaving(false);
    if (!created) {
      setError("Could not save shipment. Check stock and PO are still available.");
      return;
    }
    onSuccess();
    onClose();
  };

  const inputCls =
    "w-full bg-slate-900 border border-slate-800 rounded-md px-2.5 py-2 text-[13px] text-slate-100 focus:outline-none focus:border-blue-500/60";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#0c111c] shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div>
            <div className="text-[14px] font-semibold text-slate-100">Schedule outbound shipment</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Warehouse → retailer · {activeDate}</div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">Warehouse (plant)</span>
            <select value={facilityId} onChange={e => setFacilityId(e.target.value)} className={`mt-1 ${inputCls}`}>
              {facilities.map(f => (
                <option key={f.facility_id} value={f.facility_id}>{f.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">Product in stock</span>
            {stock.length === 0 ? (
              <div className={`mt-1 ${inputCls} text-amber-300/90`}>No uncommitted finished goods at this plant.</div>
            ) : (
              <select value={skuId} onChange={e => setSkuId(e.target.value)} className={`mt-1 ${inputCls}`}>
                {stock.map(s => (
                  <option key={s.sku_id} value={s.sku_id}>
                    {s.sku_name} · {Number(s.available_units).toLocaleString()} u ({s.pallet_count} pallets)
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">Retailer PO</span>
            {ordersStatus === "loading" ? (
              <div className={`mt-1 ${inputCls} text-slate-500`}>Loading open orders…</div>
            ) : matchingOrders.length === 0 ? (
              <div className={`mt-1 ${inputCls} text-amber-300/90`}>
                No open PO for this SKU — create a retailer order first.
              </div>
            ) : (
              <select
                value={retailerOrderId}
                onChange={e => setRetailerOrderId(e.target.value)}
                className={`mt-1 ${inputCls}`}
              >
                {matchingOrders.map(po => (
                  <option key={po.order_id} value={po.order_id}>
                    {retailerOrderLabel(po, productNames)}
                  </option>
                ))}
              </select>
            )}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">Ship window start</span>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={`mt-1 ${inputCls}`} />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-slate-500">Ship window end</span>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={`mt-1 ${inputCls}`} />
            </label>
          </div>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">Quantity (units)</span>
            <input type="number" min={1} value={quantity} onChange={e => setQuantity(e.target.value)} className={`mt-1 ${inputCls}`} />
            {stockForSku && (
              <span className="text-[10px] text-slate-500 mt-1 block">
                Max {Math.min(stockForSku.available_units, selectedPo?.quantity ?? stockForSku.available_units).toLocaleString()} u
              </span>
            )}
          </label>
          {error && <p className="text-[12px] text-red-400">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-800">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-md border border-slate-700 text-slate-300 text-[13px]">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || stock.length === 0 || !retailerOrderId}
            className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-[13px]"
          >
            {saving ? "Saving…" : "Schedule shipment"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OutboundSchedulePanel({
  activeDate,
  plant,
  facilities,
  products,
  refreshKey,
  onRefresh,
}: {
  activeDate: string;
  plant: string;
  facilities: BackendFacility[];
  products: BackendProduct[];
  refreshKey: number;
  onRefresh: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const { data: shipments, status } = useOutboundShipments(refreshKey);

  const productNames = useMemo(
    () => new Map(products.map(p => [p.sku_id, p.name])),
    [products],
  );

  const allRuns = useMemo(
    () => (status === "live" ? shipmentsToRuns(shipments, productNames) : []),
    [shipments, status, productNames],
  );

  const runs = useMemo(() => {
    const forDate = allRuns.filter(r => r.dateKey === activeDate);
    return plant === "all" ? forDate : forDate.filter(r => r.plant === plant);
  }, [allRuns, activeDate, plant]);

  const lanes = useMemo(() => {
    const visibleFacilities = facilities.filter(f => {
      if (plant === "all") return true;
      return (FACILITY_MAP[f.facility_id] ?? f.facility_id) === plant;
    });
    const byKey: Record<string, OutboundLane> = {};
    visibleFacilities.forEach(f => {
      byKey[f.facility_id] = {
        key: f.facility_id,
        facilityId: f.facility_id,
        label: `${f.name} · outbound dock`,
        runs: [],
      };
    });
    runs.forEach(r => {
      if (!byKey[r.facilityId]) {
        byKey[r.facilityId] = {
          key: r.facilityId,
          facilityId: r.facilityId,
          label: r.facilityId,
          runs: [],
        };
      }
      byKey[r.facilityId].runs.push(r);
    });
    return Object.values(byKey).sort((a, b) => a.label.localeCompare(b.label));
  }, [runs, facilities, plant]);

  const defaultFacilityId =
    plant !== "all" ? (PLANT_TO_FACILITY[plant] ?? facilities[0]?.facility_id ?? "") : facilities[0]?.facility_id ?? "";

  const handleDelete = useCallback(async (run: OutboundRun) => {
    if (!window.confirm(`Cancel shipment to ${run.retailerName}?`)) return;
    const ok = await deleteOutboundShipment(run.id);
    if (ok) onRefresh();
    else window.alert("Could not cancel shipment.");
  }, [onRefresh]);

  return (
    <>
      <div className="flex items-center justify-end gap-2 mb-3">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-semibold flex items-center gap-2"
        >
          <Icon name="truck" size={13} className="text-white" /> Schedule shipment
        </button>
      </div>

      {status === "loading" && (
        <div className="mb-3 px-3 py-2 rounded-md border border-slate-800 bg-slate-900/40 text-[12px] text-slate-400">
          Loading outbound shipments…
        </div>
      )}

      {status === "fallback" && (
        <div className="mb-3 px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] text-[12px] text-amber-200/90">
          Could not load outbound shipments. Run <span className="font-mono">make schema.migrate</span> then refresh.
        </div>
      )}

      {status === "live" && runs.length === 0 && (
        <div className="mb-3 px-3 py-2 rounded-md border border-blue-500/30 bg-blue-500/[0.06] text-[12px] text-slate-300">
          No outbound shipments on this day. Schedule warehouse → retailer deliveries from finished goods in stock.
        </div>
      )}

      {lanes.length > 0 && (
        <div className="rounded-xl border border-[var(--bp-border-soft)] bg-[var(--bp-surface-soft)] shadow-sm overflow-hidden ring-1 ring-white/[0.03]">
          <div className="flex min-w-0">
            <div className="w-44 shrink-0 border-r border-[var(--bp-border-soft)] bg-[var(--bp-surface-soft)]">
              <div
                className="flex items-center justify-center text-center px-3 uppercase tracking-wide text-[10px] text-[var(--bp-text-subtle)] border-b border-[var(--bp-border-soft)]"
                style={{ height: GANTT_HEADER_H }}
              >
                Warehouse
              </div>
              {lanes.map(lane => (
                <div
                  key={lane.key}
                  className="flex items-center px-3 border-b border-[var(--bp-border-soft)] text-[11px] text-[var(--bp-text-secondary)] truncate"
                  style={{ height: LANE_H }}
                  title={lane.label}
                >
                  {lane.label}
                </div>
              ))}
            </div>
            <div className="flex-1 min-w-0 overflow-x-auto">
              <div
                className="grid border-b border-[var(--bp-border-soft)] text-[10px] font-mono text-[var(--bp-text-subtle)] tabular-nums"
                style={{ gridTemplateColumns: `repeat(${HOURS.length}, minmax(48px, 1fr))`, height: GANTT_HEADER_H }}
              >
                {HOURS.map(h => (
                  <div key={h} className="flex items-center justify-center border-l border-[var(--bp-border-soft)] first:border-l-0">
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              {lanes.map((lane, idx) => (
                <div
                  key={lane.key}
                  className={`relative border-b border-[var(--bp-border-soft)] ${idx % 2 === 0 ? "bg-[var(--bp-surface-soft)]" : "bg-[var(--bp-surface)]/40"}`}
                  style={{ height: LANE_H }}
                >
                  {lane.runs.map(r => (
                    <div
                      key={r.id}
                      className="absolute top-1 bottom-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 flex items-center gap-2 overflow-hidden cursor-context-menu"
                      style={{
                        left: `calc(${hourLeftPct(r.start, 0, HOURS.length)}% + 3px)`,
                        width: `calc(${hourWidthPct(r.start, r.end, HOURS.length)}% - 6px)`,
                      }}
                      onContextMenu={e => {
                        e.preventDefault();
                        handleDelete(r);
                      }}
                      title={`${r.retailerName} · ${r.skuName} · ${r.qty.toLocaleString()} u · right-click to cancel`}
                    >
                      <span className="text-[11px] font-medium text-emerald-100 truncate capitalize">→ {r.retailerName}</span>
                      <span className="text-[10px] text-emerald-200/80 truncate hidden sm:inline">{r.skuName}</span>
                      <span className="text-[10px] font-mono text-emerald-200/70 shrink-0">{(r.qty / 1000).toFixed(1)}k</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-500">
        Outbound lanes show finished goods leaving each plant warehouse. Stock is reserved (FEFO) when you schedule. Right-click a bar to cancel.
      </p>

      {addOpen && (
        <AddOutboundModal
          activeDate={activeDate}
          defaultFacilityId={defaultFacilityId}
          facilities={facilities}
          productNames={productNames}
          onClose={() => setAddOpen(false)}
          onSuccess={onRefresh}
        />
      )}
    </>
  );
}
