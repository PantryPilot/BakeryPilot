"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
const GANTT_HEADER_H = 32;
const GANTT_HEADER =
  "sticky top-0 z-10 shrink-0 bg-[var(--bp-surface-muted)]/70 border-b border-[var(--bp-border)] text-[11px] font-medium leading-none text-[var(--bp-text-secondary)]";
const GANTT_HOUR_LABEL = "text-[11px] font-mono leading-none text-[var(--bp-text-muted)] tabular-nums";
const OUTBOUND_RUN_TILE =
  "absolute top-1.5 bottom-1.5 rounded-lg border border-l-[3px] shadow-md ring-1 ring-orange-500/25 flex items-center gap-2 px-2.5 cursor-context-menu touch-none transition-colors duration-150 hover:z-20 hover:shadow-lg hover:ring-orange-500/40";
const OUTBOUND_RUN_TILE_STYLE =
  "border-l-orange-300 bg-orange-600 border-orange-500 hover:bg-orange-500";

function laneRowBg(index: number): string {
  return index % 2 === 0 ? "bg-[var(--bp-surface-soft)]" : "bg-[var(--bp-surface-muted)]/40";
}

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
  status: string;
};

function formatClockFromHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatShipWindow(start: number, end: number): string {
  return `${formatClockFromHour(start)} – ${formatClockFromHour(end)}`;
}

function OutboundHoverCard({
  run,
  anchorEl,
  warehouseLabel,
}: {
  run: OutboundRun;
  anchorEl: HTMLElement | null;
  warehouseLabel: string;
}) {
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!anchorEl) return;
    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      setPos({
        left: Math.min(Math.max(8, rect.left), window.innerWidth - 272),
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
      className="fixed z-[9999] w-[268px] -translate-y-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3 shadow-2xl text-[12px] pointer-events-none ring-1 ring-white/[0.04]"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="font-mono text-[10px] text-[var(--bp-text-subtle)] mb-1 truncate" title={run.id}>
        {run.id.slice(0, 8)}…
      </div>
      <div className="text-[13px] font-medium text-[var(--bp-text-primary)] mb-1 capitalize">
        → {run.retailerName}
      </div>
      <div className="text-[var(--bp-text-muted)]">Product</div>
      <div className="font-mono text-[11px] text-[var(--bp-text-secondary)] truncate">{run.skuName}</div>
      <div className="mt-1.5 space-y-1">
        <div className="flex justify-between gap-2">
          <span className="text-[var(--bp-text-muted)]">Warehouse</span>
          <span className="text-[var(--bp-text-secondary)] text-right truncate">{warehouseLabel}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[var(--bp-text-muted)]">Ship window</span>
          <span className="text-[var(--bp-text-secondary)] font-mono tabular-nums">{formatShipWindow(run.start, run.end)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[var(--bp-text-muted)]">Quantity</span>
          <span className="text-[var(--bp-text-secondary)] font-mono tabular-nums">{run.qty.toLocaleString()} u</span>
        </div>
        {run.deliveryDate && (
          <div className="flex justify-between gap-2">
            <span className="text-[var(--bp-text-muted)]">Delivery</span>
            <span className="text-[var(--bp-text-secondary)] font-mono tabular-nums">{run.deliveryDate}</span>
          </div>
        )}
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-[var(--bp-border-soft)] flex justify-between">
        <span className="text-[var(--bp-text-muted)]">Status</span>
        <span className="text-[var(--bp-text-secondary)] capitalize">{run.status.replace(/_/g, " ")}</span>
      </div>
    </div>,
    document.body,
  );
}

function OutboundGanttLane({
  lane,
  rowIndex,
  onDelete,
}: {
  lane: OutboundLane;
  rowIndex: number;
  onDelete: (run: OutboundRun) => void;
}) {
  const [hoveredRun, setHoveredRun] = useState<{ run: OutboundRun; el: HTMLElement } | null>(null);

  return (
    <div
      className={`relative w-full min-w-[1152px] border-b border-[var(--bp-border)] ${laneRowBg(rowIndex)}`}
      style={{ height: LANE_H }}
    >
      {Array.from({ length: HOURS.length + 1 }, (_, i) => (
        <div
          key={i}
          className="absolute top-0 bottom-0 w-px pointer-events-none"
          style={{ left: `${(i / HOURS.length) * 100}%`, backgroundColor: "var(--bp-border)" }}
        />
      ))}
      {lane.runs.map(r => (
        <div
          key={r.id}
          className={`${OUTBOUND_RUN_TILE} ${OUTBOUND_RUN_TILE_STYLE}`}
          style={{
            left: `calc(${hourLeftPct(r.start, 0, HOURS.length)}% + 3px)`,
            width: `calc(${hourWidthPct(r.start, r.end, HOURS.length)}% - 6px)`,
          }}
          onMouseEnter={e => setHoveredRun({ run: r, el: e.currentTarget })}
          onMouseLeave={() => setHoveredRun(null)}
          onContextMenu={e => {
            e.preventDefault();
            onDelete(r);
          }}
        >
          <span className="text-[12px] font-semibold text-white truncate capitalize drop-shadow-sm">
            → {r.retailerName}
          </span>
          <span className="text-[11px] text-orange-50 truncate hidden sm:inline">{r.skuName}</span>
          <span className="text-[11px] font-mono text-orange-50 tabular-nums shrink-0">
            {(r.qty / 1000).toFixed(1)}k
          </span>
        </div>
      ))}
      {hoveredRun && (
        <OutboundHoverCard
          run={hoveredRun.run}
          anchorEl={hoveredRun.el}
          warehouseLabel={lane.label}
        />
      )}
    </div>
  );
}

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
        status: s.status,
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
    const byKey: Record<string, OutboundLane> = {};
    facilities.forEach(f => {
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
  }, [runs, facilities]);

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
                className={`grid w-full min-w-[1152px] ${GANTT_HEADER}`}
                style={{ gridTemplateColumns: `repeat(${HOURS.length}, minmax(48px, 1fr))`, height: GANTT_HEADER_H }}
              >
                {HOURS.map(h => (
                  <div
                    key={h}
                    className={`flex items-center justify-center border-l border-[var(--bp-border)] first:border-l-0 ${GANTT_HOUR_LABEL}`}
                  >
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              {lanes.map((lane, idx) => (
                <OutboundGanttLane
                  key={lane.key}
                  lane={lane}
                  rowIndex={idx}
                  onDelete={handleDelete}
                />
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
