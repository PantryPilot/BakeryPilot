"use client";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useApp } from "../../lib/context";
import { Icon } from "../../components/Icon";
import { Pill, RiskBar, StatusBadge, SectionHeader } from "../../components/atoms";
import { FACILITIES, Lot } from "../../lib/data";
import { useLots, useLotUsedIn, useIngredients } from "../../lib/hooks";
import {
  writeOffLot,
  transferLot,
  createLot,
  deleteLot,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  fetchIngredients,
  fetchFinishedGoods,
  type BackendFormulaUsage,
  type BackendIngredient,
  type BackendFinishedPallet,
} from "../../lib/api";

// ── Toast helper ──────────────────────────────────────────────────────────────
function Toast({ msg, kind, onClose }: { msg: string; kind: "success" | "error"; onClose: () => void }) {
  return (
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl border text-[13px] font-medium ${
        kind === "success"
          ? "bg-emerald-950 border-emerald-500/40 text-emerald-200"
          : "bg-red-950 border-red-500/40 text-red-200"
      }`}
    >
      <Icon name={kind === "success" ? "check" : "warn"} size={15} />
      <span>{msg}</span>
      <button onClick={onClose} className="ml-2 text-slate-400 hover:text-slate-200"><Icon name="x" size={13}/></button>
    </div>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────────
const FILTER_FACILITY = [
  { id: "all", label: "All" },
  ...FACILITIES.filter(f => f.id !== "all").map(f => ({ id: f.id, label: f.name })),
];
const FILTER_STORAGE = ["All", "Frozen", "Refrigerated", "Dry"];
const FILTER_RISK = ["All", "OK", "At Risk", "Critical", "Expired"];

// ── Sortable column header ─────────────────────────────────────────────────────
function SortTh({
  label, col, activeCol, dir, onSort, right, filterActive,
}: {
  label: string; col: string; activeCol: string;
  dir: "asc" | "desc"; onSort: (col: string) => void; right?: boolean;
  filterActive?: boolean;
}) {
  const active = col === activeCol;
  return (
    <th
      onClick={() => onSort(col)}
      className={`px-3 py-2 font-semibold cursor-pointer select-none group transition-colors hover:text-slate-300 ${right ? "text-right" : "text-left"} ${filterActive ? "bg-amber-500/10" : ""}`}
    >
      <span className={`inline-flex items-center gap-1 ${right ? "flex-row-reverse" : ""}`}>
        <span>{label}</span>
        <span className="text-[10px] leading-none text-slate-600 group-hover:text-slate-400">
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  );
}

// ── Write-off modal ───────────────────────────────────────────────────────────
function WriteOffModal({ lot, onClose, onSuccess }: {
  lot: Lot; onClose: () => void; onSuccess: (updated: Lot) => void;
}) {
  const [reason, setReason] = useState("Manual write-off");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const updated = await writeOffLot(lot.id.toLowerCase(), { reason });
      if (!updated) { setError("Backend request failed. Please try again."); setLoading(false); return; }
      onSuccess(updated);
    } catch {
      setError("Unexpected error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#0c111c] shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[15px] font-semibold text-slate-100">Write-off lot (dispose)</div>
            <div className="text-[12px] font-mono text-slate-500 mt-0.5">{lot.id} · {lot.ingredient}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Icon name="x" size={16}/></button>
        </div>
        <div className="space-y-4">
          <div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Quantity</div>
                <div className="text-[16px] font-mono tabular-nums text-red-300 mt-0.5">{lot.qty.toLocaleString()} kg</div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Expiry</div>
                <div className={`text-[16px] font-mono tabular-nums mt-0.5 ${lot.daysLeft <= 2 ? "text-red-300" : "text-slate-100"}`}>{lot.expiry}</div>
              </div>
            </div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Reason</label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Spoilage — expiry passed"
              className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-red-500/70 transition"
            />
          </div>
          {error && <div className="text-[12px] text-red-400 flex items-center gap-1.5"><Icon name="warn" size={12}/>{error}</div>}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSubmit}
              disabled={loading || !reason.trim()}
              className="flex-1 py-2 rounded-md bg-red-500 hover:bg-red-400 disabled:opacity-50 disabled:cursor-not-allowed text-red-950 font-semibold text-[13px] flex items-center justify-center gap-2 transition"
            >
              {loading && <span className="w-3.5 h-3.5 border-2 border-red-950/40 border-t-red-950 rounded-full animate-spin"/>}
              Write off {lot.qty.toLocaleString()} kg
            </button>
            <button onClick={onClose} className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 text-[13px] hover:border-slate-500 transition">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Transfer modal ────────────────────────────────────────────────────────────
const DEST_FACILITIES = FACILITIES.filter(f => f.id !== "all");

const FACILITY_ID_MAP: Record<string, string> = {
  p1: "plant-toronto", p2: "plant-mississauga", p3: "plant-hamilton", p4: "plant-montreal",
};

const STORAGE_ZONES = ["dry", "refrigerated", "frozen"] as const;

function TransferModal({ lot, onClose, onSuccess }: {
  lot: Lot; onClose: () => void; onSuccess: (updated: Lot) => void;
}) {
  const facilityIdMap = FACILITY_ID_MAP;
  const destOptions = DEST_FACILITIES.filter(f => facilityIdMap[f.id] !== lot.facility && f.id !== lot.facility);
  const [destId, setDestId] = useState<string>(destOptions[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!destId) return;
    setLoading(true);
    setError(null);
    try {
      const backendDestId = facilityIdMap[destId] ?? destId;
      const updated = await transferLot(lot.id.toLowerCase(), { destination_facility_id: backendDestId });
      if (!updated) { setError("Backend request failed. Please try again."); setLoading(false); return; }
      onSuccess(updated);
    } catch {
      setError("Unexpected error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#0c111c] shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[15px] font-semibold text-slate-100">Transfer lot</div>
            <div className="text-[12px] font-mono text-slate-500 mt-0.5">{lot.id} · {lot.ingredient}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Icon name="x" size={16}/></button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Quantity</div>
              <div className="text-[16px] font-mono tabular-nums text-slate-100 mt-0.5">{lot.qty.toLocaleString()} kg</div>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-900/40 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">From</div>
              <div className="text-[16px] font-mono tabular-nums text-slate-100 mt-0.5">{FACILITY_NAME[lot.facility] ?? lot.facility}</div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Destination facility</label>
            <select
              value={destId}
              onChange={e => setDestId(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-blue-500/70 transition"
            >
              {destOptions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          {error && <div className="text-[12px] text-red-400 flex items-center gap-1.5"><Icon name="warn" size={12}/>{error}</div>}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSubmit}
              disabled={loading || !destId}
              className="flex-1 py-2 rounded-md bg-blue-500 hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-blue-950 font-semibold text-[13px] flex items-center justify-center gap-2 transition"
            >
              {loading && <span className="w-3.5 h-3.5 border-2 border-blue-950/40 border-t-blue-950 rounded-full animate-spin"/>}
              Transfer lot
            </button>
            <button onClick={onClose} className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 text-[13px] hover:border-slate-500 transition">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add lot modal ────────────────────────────────────────────────────────────
function AddLotModal({ onClose, onSuccess }: {
  onClose: () => void;
  onSuccess: (lot: Lot) => void;
}) {
  const { data: ingredients, status: ingStatus } = useIngredients();
  const [ingredientId, setIngredientId] = useState("");
  const [facilityId, setFacilityId] = useState("p1");
  const [quantityKg, setQuantityKg] = useState("");
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState("");
  const [storageZone, setStorageZone] = useState<typeof STORAGE_ZONES[number]>("dry");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!(ingredientId && facilityId && quantityKg && expiryDate && !loading);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    const lot = await createLot({
      facility_id: FACILITY_ID_MAP[facilityId] ?? facilityId,
      ingredient_id: ingredientId,
      quantity_kg: parseFloat(quantityKg),
      received_date: receivedDate,
      expiry_date: expiryDate,
      storage_zone: storageZone,
    });
    setLoading(false);
    if (lot) {
      onSuccess(lot);
    } else {
      setError("Failed to create lot. Check that the ingredient and facility exist.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" style={{ animation: "popup-in 180ms ease-out both" }}>
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#0c111c] shadow-2xl p-6" style={{ animation: "popup-in 220ms ease-out both" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="text-[15px] font-semibold text-slate-100">Add Inventory Lot</div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Icon name="x" size={16}/></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Ingredient</label>
            <select value={ingredientId} onChange={e => setIngredientId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-[13px] text-slate-200 focus:border-blue-500 focus:outline-none">
              <option value="">Select ingredient…</option>
              {ingStatus === "loading" ? <option disabled>Loading…</option> : ingredients.map(ing => (
                <option key={ing.ingredient_id} value={ing.ingredient_id}>{ing.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Facility</label>
              <select value={facilityId} onChange={e => setFacilityId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-[13px] text-slate-200 focus:border-blue-500 focus:outline-none">
                {DEST_FACILITIES.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Storage zone</label>
              <select value={storageZone} onChange={e => setStorageZone(e.target.value as typeof STORAGE_ZONES[number])}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-[13px] text-slate-200 focus:border-blue-500 focus:outline-none">
                {STORAGE_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Quantity (kg)</label>
            <input type="number" min="0" value={quantityKg} onChange={e => setQuantityKg(e.target.value)} placeholder="0"
              className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-[13px] text-slate-200 focus:border-blue-500 focus:outline-none"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Received date</label>
              <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-[13px] text-slate-200 focus:border-blue-500 focus:outline-none"/>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Expiry date</label>
              <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-[13px] text-slate-200 focus:border-blue-500 focus:outline-none"/>
            </div>
          </div>
          {error && <div className="text-[12px] text-red-400 flex items-center gap-1.5"><Icon name="warn" size={12}/>{error}</div>}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={handleSubmit} disabled={!canSubmit}
              className="flex-1 py-2 rounded-md bg-blue-500 hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-blue-950 font-semibold text-[13px] flex items-center justify-center gap-2 transition">
              {loading && <span className="w-3.5 h-3.5 border-2 border-blue-950/40 border-t-blue-950 rounded-full animate-spin"/>}
              Add lot
            </button>
            <button onClick={onClose} className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 text-[13px] hover:border-slate-500 transition">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Ingredients manager modal ─────────────────────────────────────────────────
function IngredientsManagerModal({ onClose }: { onClose: () => void }) {
  const [ingredients, setIngredients] = useState<BackendIngredient[]>([]);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editZone, setEditZone] = useState("");
  const [addForm, setAddForm] = useState({ ingredient_id: "", name: "", category: "", default_storage_zone: "dry", shelf_life_days_default: "365" });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadStatus("loading");
    const data = await fetchIngredients();
    if (data) { setIngredients(data); setLoadStatus("ready"); }
    else setLoadStatus("error");
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const startEdit = (ing: BackendIngredient) => {
    setEditId(ing.ingredient_id);
    setEditName(ing.name);
    setEditCategory(ing.category ?? "");
    setEditZone(ing.default_storage_zone);
  };

  const saveEdit = async () => {
    if (!editId) return;
    setSavingId(editId);
    const updated = await updateIngredient(editId, {
      name: editName, category: editCategory || undefined, default_storage_zone: editZone,
    });
    setSavingId(null);
    if (updated) {
      setIngredients(prev => prev.map(i => i.ingredient_id === editId ? updated : i));
      setEditId(null);
    }
  };

  const handleDelete = async (ingredientId: string) => {
    setDeletingId(ingredientId);
    const ok = await deleteIngredient(ingredientId);
    setDeletingId(null);
    if (ok) setIngredients(prev => prev.filter(i => i.ingredient_id !== ingredientId));
    else await reload();
  };

  const handleAdd = async () => {
    if (!addForm.ingredient_id || !addForm.name) return;
    setAddLoading(true);
    setAddError(null);
    const created = await createIngredient({
      ingredient_id: addForm.ingredient_id,
      name: addForm.name,
      category: addForm.category || undefined,
      default_storage_zone: addForm.default_storage_zone,
      shelf_life_days_default: parseInt(addForm.shelf_life_days_default) || 365,
    });
    setAddLoading(false);
    if (created) {
      setIngredients(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setAddForm({ ingredient_id: "", name: "", category: "", default_storage_zone: "dry", shelf_life_days_default: "365" });
    } else {
      setAddError("Failed. ID may already exist.");
    }
  };

  const inputCls = "bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-[12px] text-slate-200 focus:border-blue-500 focus:outline-none w-full";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" style={{ animation: "popup-in 180ms ease-out both" }}>
      <div className="w-full max-w-2xl rounded-xl border border-slate-800 bg-[#0c111c] shadow-2xl flex flex-col max-h-[85vh]" style={{ animation: "popup-in 220ms ease-out both" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="text-[15px] font-semibold text-slate-100">Manage Ingredients</div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Icon name="x" size={16}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {loadStatus === "loading" && <div className="text-[12px] text-slate-500 py-4 text-center">Loading…</div>}
          {loadStatus === "error" && <div className="text-[12px] text-red-400 py-4 text-center">Failed to load ingredients.</div>}
          {loadStatus === "ready" && ingredients.map(ing => (
            <div key={ing.ingredient_id} className="rounded-md border border-slate-800 bg-slate-900/40 p-2.5">
              {editId === ing.ingredient_id ? (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-3 gap-2">
                    <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name"
                      className={`col-span-2 ${inputCls}`}/>
                    <select value={editZone} onChange={e => setEditZone(e.target.value)}
                      className={inputCls}>
                      {STORAGE_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                    </select>
                  </div>
                  <input value={editCategory} onChange={e => setEditCategory(e.target.value)} placeholder="Category (optional)"
                    className={inputCls}/>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={savingId === ing.ingredient_id}
                      className="px-3 py-1 rounded bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-blue-950 font-semibold text-[12px] flex items-center gap-1.5">
                      {savingId === ing.ingredient_id && <span className="w-3 h-3 border-2 border-blue-950/40 border-t-blue-950 rounded-full animate-spin"/>}
                      Save
                    </button>
                    <button onClick={() => setEditId(null)} className="px-3 py-1 rounded border border-slate-700 text-slate-300 text-[12px]">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-slate-100">{ing.name}</div>
                    <div className="text-[11px] font-mono text-slate-500">{ing.ingredient_id} · {ing.category ?? "—"} · {ing.default_storage_zone}</div>
                  </div>
                  <button onClick={() => startEdit(ing)} className="px-2 py-0.5 text-[11px] rounded border border-slate-700 hover:border-blue-500 text-slate-300">Edit</button>
                  <button onClick={() => handleDelete(ing.ingredient_id)} disabled={deletingId === ing.ingredient_id}
                    className="px-2 py-0.5 text-[11px] rounded text-red-400 hover:text-red-300 disabled:opacity-50">
                    {deletingId === ing.ingredient_id ? "…" : "Delete"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-slate-800 p-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Add new ingredient</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input value={addForm.ingredient_id} onChange={e => setAddForm(f => ({...f, ingredient_id: e.target.value}))}
              placeholder="ID (e.g. flour_bread)" className={inputCls}/>
            <input value={addForm.name} onChange={e => setAddForm(f => ({...f, name: e.target.value}))}
              placeholder="Display name" className={inputCls}/>
            <input value={addForm.category} onChange={e => setAddForm(f => ({...f, category: e.target.value}))}
              placeholder="Category (optional)" className={inputCls}/>
            <select value={addForm.default_storage_zone} onChange={e => setAddForm(f => ({...f, default_storage_zone: e.target.value}))}
              className={inputCls}>
              {STORAGE_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          {addError && <div className="text-[12px] text-red-400 mb-2">{addError}</div>}
          <button onClick={handleAdd} disabled={!addForm.ingredient_id || !addForm.name || addLoading}
            className="px-4 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-emerald-950 font-semibold text-[12px] flex items-center gap-1.5">
            {addLoading && <span className="w-3 h-3 border-2 border-emerald-950/40 border-t-emerald-950 rounded-full animate-spin"/>}
            Add ingredient
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lot slide-in ──────────────────────────────────────────────────────────────
function LotSlideIn({
  lot, onClose, isClosing,
}: {
  lot: Lot;
  onClose: () => void;
  isClosing?: boolean;
  onLotUpdate?: (updated: Lot) => void;
}) {
  const backendLotId = lot.id.toLowerCase();
  const { data: usedIn, status: usedInStatus } = useLotUsedIn(backendLotId);

  return (
    <div
      style={{ animation: isClosing ? "slide-out-right 280ms ease forwards" : "slide-in-right 280ms ease forwards" }}
      className="fixed top-14 right-0 bottom-0 z-30 w-full sm:w-[640px] bg-[#0c111c] border-l border-slate-800 shadow-2xl flex flex-col"
    >
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-800">
        <div>
          <div className="font-mono text-[11px] text-slate-500">{lot.id}</div>
          <div className="text-[15px] font-semibold text-slate-100">{lot.ingredient}</div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Icon name="x" size={18}/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Quantity",  value: `${lot.qty.toLocaleString()} kg` },
            { label: "Facility",  value: FACILITY_NAME[lot.facility] ?? lot.facility },
            { label: "Expiry",    value: lot.expiry, tone: lot.daysLeft <= 2 ? "red" : lot.daysLeft <= 5 ? "amber" : null },
            { label: "Days left", value: `${lot.daysLeft}d`, tone: lot.daysLeft <= 2 ? "red" : lot.daysLeft <= 5 ? "amber" : null },
          ].map((c, i) => (
            <div key={i} className="rounded-md border border-slate-800 bg-slate-900/40 p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{c.label}</div>
              <div className={`text-[16px] font-mono tabular-nums mt-0.5 ${c.tone === "red" ? "text-red-300" : c.tone === "amber" ? "text-amber-300" : "text-slate-100"}`}>{c.value}</div>
            </div>
          ))}
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400 font-semibold mb-2">
            Used in products
            {usedInStatus === "live" && <span className="ml-2 text-emerald-400 normal-case font-normal">· live</span>}
          </div>
          {usedInStatus === "loading" && (
            <div className="text-[12px] text-slate-500 py-3">Loading…</div>
          )}
          {usedInStatus !== "loading" && usedIn.length === 0 && (
            <div className="text-[12px] text-slate-500 py-3">No recipes found for this ingredient.</div>
          )}
          <div className="space-y-1.5">
            {usedIn.map((p: BackendFormulaUsage) => (
              <div key={p.sku_id} className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-900/40 p-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-slate-100">{p.sku_name}</div>
                  <div className="text-[11px] font-mono text-slate-500">
                    {p.sku_id}
                    {p.category ? ` · ${p.category}` : ""}
                    {p.allergen_tags.length > 0 ? ` · ${p.allergen_tags.join(", ")}` : ""}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[14px] font-mono tabular-nums text-blue-300">{p.kg_per_unit} kg</div>
                  <div className="text-[10px] text-slate-500">per unit</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400 font-semibold mb-2">Lot genealogy</div>
          <div className="rounded-md border border-slate-800 bg-slate-950/40 p-4 text-[12px] text-slate-500">
            Genealogy tracing not yet available — requires production_runs + finished_goods_pallets backend endpoint.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Finished Products Tab ─────────────────────────────────────────────────────

const FACILITY_SHORT_TO_ID: Record<string, string> = {
  p1: "plant-toronto", p2: "plant-mississauga", p3: "plant-hamilton", p4: "plant-montreal",
};
const FACILITY_ID_TO_NAME: Record<string, string> = {
  "plant-toronto": "Toronto", "plant-mississauga": "Mississauga", "plant-hamilton": "Hamilton", "plant-montreal": "Montreal",
};
const FACILITY_NAME: Record<string, string> = {
  p1: "Toronto", p2: "Mississauga", p3: "Hamilton", p4: "Montreal",
};

function FinishedProductsTab({ facilityFilter }: { facilityFilter: string }) {
  const [pallets, setPallets] = useState<BackendFinishedPallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [fpSortKey, setFpSortKey] = useState("produced");
  const [fpSortDir, setFpSortDir] = useState<"asc" | "desc">("desc");

  const facilityId = facilityFilter !== "all" ? (FACILITY_SHORT_TO_ID[facilityFilter] ?? undefined) : undefined;

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchFinishedGoods(facilityId).then(data => {
      setLoading(false);
      if (!data) { setError("Failed to load finished product inventory."); return; }
      setPallets(data);
    });
  }, [facilityId]);

  function handleFpSort(key: string) {
    if (key === fpSortKey) {
      setFpSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setFpSortKey(key);
      setFpSortDir(["qty", "produced"].includes(key) ? "desc" : "asc");
    }
  }

  const filtered = useMemo(() => {
    let result = pallets.slice();
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(p => p.sku_name.toLowerCase().includes(q) || p.sku_id.toLowerCase().includes(q));
    }
    const mult = fpSortDir === "asc" ? 1 : -1;
    result.sort((a, b) => {
      let cmp = 0;
      if (fpSortKey === "name")     cmp = a.sku_name.localeCompare(b.sku_name);
      if (fpSortKey === "sku")      cmp = a.sku_id.localeCompare(b.sku_id);
      if (fpSortKey === "facility") cmp = a.facility_id.localeCompare(b.facility_id);
      if (fpSortKey === "qty")      cmp = a.quantity - b.quantity;
      if (fpSortKey === "shelf")    cmp = a.days_remaining - b.days_remaining;
      if (fpSortKey === "produced") cmp = new Date(a.produced_at).getTime() - new Date(b.produced_at).getTime();
      if (fpSortKey === "status")   cmp = a.status.localeCompare(b.status);
      return cmp * mult;
    });
    return result;
  }, [pallets, query, fpSortKey, fpSortDir]);

  const STATUS_COLOR: Record<string, string> = {
    in_warehouse: "text-emerald-300 bg-emerald-900/30 border-emerald-700/50",
    shipped: "text-blue-300 bg-blue-900/30 border-blue-700/50",
    donated: "text-purple-300 bg-purple-900/30 border-purple-700/50",
    written_off: "text-slate-400 bg-slate-800/40 border-slate-700",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <span className="w-7 h-7 border-2 border-slate-700 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-[13px] text-slate-500">Loading finished products…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Icon name="warn" size={28} className="text-red-400" />
        <div className="text-[13px] text-slate-400">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2 rounded-md border border-slate-800 px-2 h-8">
          <Icon name="search" size={13} className="text-slate-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search product name or SKU…"
            className="bg-transparent outline-none text-[12px] text-slate-100 placeholder:text-slate-500 w-48"
          />
        </div>
        <span className="text-[12px] text-slate-500">{filtered.length} pallets</span>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2 mb-4">
        {filtered.map(p => (
          <div key={p.pallet_id} className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-slate-100 truncate">{p.sku_name}</div>
                <div className="text-[10px] font-mono text-slate-500 mt-0.5">{p.sku_id} · {FACILITY_ID_TO_NAME[p.facility_id] ?? p.facility_id}</div>
              </div>
              <span className={`shrink-0 px-2 py-0.5 rounded-md border text-[10px] font-medium ${STATUS_COLOR[p.status] ?? STATUS_COLOR.in_warehouse}`}>
                {p.status.replace(/_/g, " ")}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
              <div><span className="text-slate-500">Qty </span><span className="text-slate-300 font-mono">{p.quantity.toLocaleString()}</span></div>
              <div><span className="text-slate-500">Shelf </span><span className={`font-mono ${p.days_remaining <= 1 ? "text-red-300" : p.days_remaining <= 3 ? "text-amber-300" : "text-slate-300"}`}>{p.days_remaining}d left</span></div>
              <div><span className="text-slate-500">Produced </span><span className="text-slate-400">{new Date(p.produced_at).toLocaleDateString()}</span></div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-10 text-center text-[13px] text-slate-500">No finished products found.</div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block rounded-lg border border-slate-800 bg-slate-900/30 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
          <table className="bp-data-table w-full min-w-[860px] text-[13px]">
            <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500 sticky top-0 z-10">
              <tr>
                <SortTh label="Product"    col="name"     activeCol={fpSortKey} dir={fpSortDir} onSort={handleFpSort}/>
                <SortTh label="SKU"        col="sku"      activeCol={fpSortKey} dir={fpSortDir} onSort={handleFpSort}/>
                <SortTh label="Facility"   col="facility" activeCol={fpSortKey} dir={fpSortDir} onSort={handleFpSort}/>
                <SortTh label="Qty"        col="qty"      activeCol={fpSortKey} dir={fpSortDir} onSort={handleFpSort} right/>
                <SortTh label="Shelf life" col="shelf"    activeCol={fpSortKey} dir={fpSortDir} onSort={handleFpSort} right/>
                <SortTh label="Produced"   col="produced" activeCol={fpSortKey} dir={fpSortDir} onSort={handleFpSort}/>
                <SortTh label="Status"     col="status"   activeCol={fpSortKey} dir={fpSortDir} onSort={handleFpSort}/>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.pallet_id} className="border-t border-slate-800/80 hover:bg-slate-800/40 transition">
                  <td className="px-4 py-2.5 text-slate-100 font-medium">{p.sku_name}</td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-[12px]">{p.sku_id.replace("sku-", "")}</td>
                  <td className="px-4 py-2.5 text-slate-400">{FACILITY_ID_TO_NAME[p.facility_id] ?? p.facility_id}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-200">{p.quantity.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    <span className={p.days_remaining <= 1 ? "text-red-300" : p.days_remaining <= 3 ? "text-amber-300" : "text-slate-300"}>
                      {p.days_remaining}d
                    </span>
                    <span className="text-slate-600 text-[11px] ml-1">/ {p.shelf_life_days}d</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 text-[12px]">{new Date(p.produced_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-md border text-[11px] font-medium ${STATUS_COLOR[p.status] ?? STATUS_COLOR.in_warehouse}`}>
                      {p.status.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-slate-500">No finished products found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MaterialsPage() {
  const { openChatContext } = useApp();
  const [activeTab, setActiveTab] = useState<"ingredients" | "finished">("ingredients");
  const [facility, setFacility] = useState("all");
  const [storage, setStorage] = useState("All");
  const [risk, setRisk] = useState("All");
  const [daysFilter, setDaysFilter] = useState("All");
  const [sortKey, setSortKey] = useState("risk");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeLot, setActiveLot] = useState<Lot | null>(null);
  const [lotClosing, setLotClosing] = useState(false);
  const [writeOffLotTarget, setWriteOffLotTarget] = useState<Lot | null>(null);
  const [transferLotTarget, setTransferLotTarget] = useState<Lot | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "success" | "error" } | null>(null);

  const { data: lots, status: backendStatus } = useLots();
  const [lotOverrides, setLotOverrides] = useState<Map<string, Lot>>(new Map());
  const [addedLots, setAddedLots] = useState<Lot[]>([]);
  const [deletedLotIds, setDeletedLotIds] = useState<Set<string>>(new Set());
  const [addLotOpen, setAddLotOpen] = useState(false);
  const [ingredientsManagerOpen, setIngredientsManagerOpen] = useState(false);
  const [deleteConfirmLot, setDeleteConfirmLot] = useState<Lot | null>(null);
  const [deletingLot, setDeletingLot] = useState(false);

  const mergedLots = useMemo(() => {
    const base = lots
      .map(l => lotOverrides.get(l.id) ?? l)
      .filter(l => !deletedLotIds.has(l.id));
    return [...addedLots, ...base];
  }, [lots, lotOverrides, addedLots, deletedLotIds]);

  const closeLot = useCallback(() => {
    setLotClosing(true);
    setTimeout(() => { setActiveLot(null); setLotClosing(false); }, 280);
  }, []);

  const showToast = useCallback((msg: string, kind: "success" | "error") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleWriteOffSuccess = useCallback((updated: Lot) => {
    setLotOverrides(m => new Map(m).set(updated.id, updated));
    setWriteOffLotTarget(null);
    // Also update activeLot if it's the same lot
    setActiveLot(prev => prev?.id === updated.id ? updated : prev);
    showToast(`Lot ${updated.id.slice(0, 12)}… written off successfully.`, "success");
  }, [showToast]);

  const handleTransferSuccess = useCallback((updated: Lot) => {
    setLotOverrides(m => new Map(m).set(updated.id, updated));
    setTransferLotTarget(null);
    setActiveLot(prev => prev?.id === updated.id ? updated : prev);
    setFacility("all");
    showToast(`Lot transferred to ${FACILITY_NAME[updated.facility] ?? updated.facility}.`, "success");
  }, [showToast]);

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const names = [...new Set(mergedLots.map(l => l.ingredient))];
    return names.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
  }, [mergedLots, query]);

  // Close suggestions on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function handleIngSort(key: string) {
    if (key === sortKey) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(["risk", "qty"].includes(key) ? "desc" : "asc");
    }
  }

  const filtered = useMemo(() => {
    let l = mergedLots.slice();
    if (facility !== "all") l = l.filter(x => x.facility === facility);
    if (storage !== "All") l = l.filter(x => x.storage === storage.toLowerCase());
    if (risk !== "All") {
      const map: Record<string, string> = { "OK": "ok", "At Risk": "warn", "Critical": "critical", "Expired": "expired" };
      l = l.filter(x => x.status === map[risk]);
    }
    if (daysFilter !== "All") {
      const max = parseInt(daysFilter);
      l = l.filter(x => x.daysLeft <= max);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      l = l.filter(x => x.ingredient.toLowerCase().includes(q) || x.id.toLowerCase().includes(q));
    }
    const mult = sortDir === "asc" ? 1 : -1;
    l.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "risk")       cmp = a.risk - b.risk;
      if (sortKey === "expiry")     cmp = a.daysLeft - b.daysLeft;
      if (sortKey === "qty")        cmp = a.qty - b.qty;
      if (sortKey === "facility")   cmp = a.facility.localeCompare(b.facility);
      if (sortKey === "ingredient") cmp = a.ingredient.localeCompare(b.ingredient);
      if (sortKey === "status")     cmp = a.status.localeCompare(b.status);
      if (sortKey === "storage")    cmp = a.storage.localeCompare(b.storage);
      return cmp * mult;
    });
    return l;
  }, [mergedLots, facility, storage, risk, daysFilter, sortKey, sortDir, query]);

  const horizon = useMemo(() => {
    const groups: Record<string, { ingredient: string; total: number; lots: number; expiring3d: number; expiring7d: number; lotsData: { qty: number; daysLeft: number }[] }> = {};
    mergedLots.forEach(l => {
      if (!groups[l.ingredient]) {
        groups[l.ingredient] = {
          ingredient: l.ingredient,
          total: 0,
          lots: 0,
          expiring3d: 0,
          expiring7d: 0,
          lotsData: [],
        };
      }
      groups[l.ingredient].total += l.qty;
      groups[l.ingredient].lots += 1;
      if (l.daysLeft <= 3) groups[l.ingredient].expiring3d += l.qty;
      if (l.daysLeft <= 7) groups[l.ingredient].expiring7d += l.qty;
      groups[l.ingredient].lotsData.push({ qty: l.qty, daysLeft: l.daysLeft });
    });
    return Object.values(groups).map(g => {
      // Stronger urgency model: each lot contributes depletion pressure by expiry.
      const lotDrivenBurn = g.lotsData.reduce((sum, lot) => {
        const horizonDays = Math.max(1, Math.min(45, lot.daysLeft));
        return sum + (lot.qty / horizonDays);
      }, 0);
      // Baseline operational usage so long-dated lots still move.
      const baselineBurn = Math.max(2.0, (g.total * 0.012) + (g.lots * 0.8));
      const burn = Math.max(1.0, baselineBurn + (lotDrivenBurn * 0.65));
      const days = Math.min(60, Math.max(1, Math.round(g.total / burn)));
      const leadTime = g.expiring3d > 0 ? 2 : g.expiring7d > 0 ? 4 : 7;
      return { ...g, burn, days, leadTime, needReorder: days <= leadTime + 2 };
    }).sort((a, b) => a.days - b.days).slice(0, 10);
  }, [mergedLots]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1600px] mx-auto">
        <SectionHeader
          title="Inventory"
          sub={activeTab === "ingredients"
            ? `${mergedLots.length} active lots · ${mergedLots.filter(l => l.status === "critical").length} critical · ${mergedLots.filter(l => l.status === "warn").length} at risk · ${backendStatus === "live" ? "live data" : backendStatus === "loading" ? "loading…" : "offline (seed data)"}`
            : "Finished product inventory from production runs"
          }
          right={
            <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-2 w-full sm:w-auto">
              {activeTab === "ingredients" && (
                <>
                  <button onClick={() => setIngredientsManagerOpen(true)} className="px-3 py-1.5 rounded-md border border-slate-700 hover:border-slate-500 text-[12px] text-slate-200 flex items-center gap-2 whitespace-nowrap">
                    <Icon name="settings" size={13}/> Ingredients
                  </button>
                </>
              )}
              <button onClick={() => openChatContext("Inventory · all plants")} className="px-3 py-1.5 rounded-md border border-slate-700 hover:border-blue-500 text-[12px] text-slate-200 flex items-center gap-2 whitespace-nowrap">
                <Icon name="chat" size={13}/> Ask copilot
              </button>
              {activeTab === "ingredients" && (
                <button onClick={() => setAddLotOpen(true)} className="px-3 py-1.5 rounded-md bg-blue-500 hover:bg-blue-400 text-blue-950 font-semibold text-[12px] flex items-center gap-2 whitespace-nowrap shrink-0">
                  + Add Lot
                </button>
              )}
            </div>
          }
        />

        {/* Tab strip */}
        <div className="flex items-center gap-1 mb-5 border-b border-slate-800">
          {([["ingredients", "Ingredients"], ["finished", "Finished Products"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                activeTab === id
                  ? "border-blue-500 text-blue-300"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div key={activeTab} className="page-transition">
        {activeTab === "finished" && (
          <FinishedProductsTab facilityFilter={facility} />
        )}

        {activeTab === "ingredients" && (<>

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div ref={searchRef} className="relative flex-1 min-w-[220px]">
              <div className="flex items-center gap-2 rounded-md border border-slate-800 px-2 h-9">
                <Icon name="search" size={13} className="text-slate-500"/>
                <input
                  value={query}
                  onChange={e => { setQuery(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Search ingredient or lot ID"
                  className="bg-transparent outline-none text-[12px] text-slate-100 placeholder:text-slate-500 w-full"
                />
                {query && (
                  <button onClick={() => { setQuery(""); setShowSuggestions(false); }} className="text-slate-500 hover:text-slate-300">
                    <Icon name="x" size={11}/>
                  </button>
                )}
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-md border border-slate-700 bg-slate-900 shadow-xl z-30 overflow-hidden">
                  {suggestions.map(name => (
                    <button
                      key={name}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setQuery(name); setShowSuggestions(false); }}
                      className="w-full text-left px-3 py-1.5 text-[12px] text-slate-200 hover:bg-slate-800 transition"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setFiltersOpen(v => !v)}
              className="sm:hidden h-9 px-3 rounded-md border border-slate-700 text-slate-300 text-[12px] flex items-center gap-1.5"
            >
              <Icon name="bars" size={12} />
              Filters
            </button>
            <button
              onClick={() => {
                setFacility("all");
                setStorage("All");
                setRisk("All");
                setDaysFilter("All");
                setSortKey("risk");
                setSortDir("desc");
                setQuery("");
              }}
              className="h-9 px-3 rounded-md border border-slate-700 text-slate-300 text-[12px] hover:border-slate-500 transition"
            >
              Clear
            </button>
          </div>

          <div className={`${filtersOpen ? "max-h-96 opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"} sm:max-h-none sm:opacity-100 sm:mt-3 overflow-hidden transition-all duration-300 ease-out`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <label className={`text-[11px] font-medium ${facility !== "all" ? "text-blue-400" : "text-slate-500"}`}>
                Facility{facility !== "all" && " ●"}
                <select
                  value={facility}
                  onChange={e => setFacility(e.target.value)}
                  className={`mt-1 w-full h-9 bg-slate-900 border rounded-md px-2 text-[12px] text-slate-200 ${facility !== "all" ? "border-blue-500/50" : "border-slate-800"}`}
                >
                  {FILTER_FACILITY.map(opt => <option key={opt.id} value={opt.id}>{opt.label}</option>)}
                </select>
              </label>
              <label className={`text-[11px] font-medium ${storage !== "All" ? "text-blue-400" : "text-slate-500"}`}>
                Storage{storage !== "All" && " ●"}
                <select
                  value={storage}
                  onChange={e => setStorage(e.target.value)}
                  className={`mt-1 w-full h-9 bg-slate-900 border rounded-md px-2 text-[12px] text-slate-200 ${storage !== "All" ? "border-blue-500/50" : "border-slate-800"}`}
                >
                  {FILTER_STORAGE.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </label>
              <label className={`text-[11px] font-medium ${risk !== "All" ? "text-blue-400" : "text-slate-500"}`}>
                Risk{risk !== "All" && " ●"}
                <select
                  value={risk}
                  onChange={e => setRisk(e.target.value)}
                  className={`mt-1 w-full h-9 bg-slate-900 border rounded-md px-2 text-[12px] text-slate-200 ${risk !== "All" ? "border-blue-500/50" : "border-slate-800"}`}
                >
                  {FILTER_RISK.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </label>
              <label className={`text-[11px] font-medium ${daysFilter !== "All" ? "text-blue-400" : "text-slate-500"}`}>
                Days left{daysFilter !== "All" && " ●"}
                <select
                  value={daysFilter}
                  onChange={e => setDaysFilter(e.target.value)}
                  className={`mt-1 w-full h-9 bg-slate-900 border rounded-md px-2 text-[12px] text-slate-200 ${daysFilter !== "All" ? "border-blue-500/50" : "border-slate-800"}`}
                >
                  <option value="All">All</option>
                  <option value="2">≤ 2 days</option>
                  <option value="5">≤ 5 days</option>
                  <option value="7">≤ 7 days</option>
                  <option value="14">≤ 14 days</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        {/* Mobile card list */}
        <div className="sm:hidden space-y-2 mb-4">
          {filtered.slice(0, 50).map(l => (
            <div
              key={l.id}
              onClick={() => setActiveLot(l)}
              className={`rounded-lg border px-4 py-3 cursor-pointer transition ${
                l.status === "critical" ? "border-red-500/30 bg-red-500/[0.04]" :
                l.status === "warn"     ? "border-amber-500/20 bg-amber-500/[0.03]" :
                "border-slate-800 bg-slate-900/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-slate-100 truncate">{l.ingredient}</div>
                  <div className="text-[10px] font-mono text-slate-500 mt-0.5">{l.id.slice(0, 12)}… · {FACILITY_NAME[l.facility] ?? l.facility}</div>
                </div>
                <div className="shrink-0 text-right">
                  <StatusBadge status={l.status}/>
                  <div className={`text-[11px] font-mono mt-1 ${l.daysLeft <= 2 ? "text-red-300" : l.daysLeft <= 5 ? "text-amber-300" : "text-slate-400"}`}>
                    {l.daysLeft}d · {l.qty.toLocaleString()} kg
                  </div>
                </div>
              </div>
              <div className="mt-2 flex gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => setActiveLot(l)} className="px-1.5 py-0.5 text-[11px] rounded border border-slate-700 hover:border-blue-500 hover:bg-slate-800/40 text-slate-300 transition">Used in</button>
                <button
                  onClick={() => setTransferLotTarget(l)}
                  disabled={l.status === "expired"}
                  className="px-1.5 py-0.5 text-[11px] rounded border border-slate-700 hover:border-blue-500 hover:bg-slate-800/40 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >Transfer</button>
                <button onClick={() => setWriteOffLotTarget(l)} className="px-1.5 py-0.5 text-[11px] rounded border border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-500/10 text-amber-400 hover:text-amber-300 transition">Write-off</button>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden sm:block rounded-lg border border-slate-800 bg-slate-900/30 overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
          <table className="bp-data-table w-full min-w-[860px] text-[13px]">
            <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Lot ID</th>
                <SortTh label="Ingredient"  col="ingredient" activeCol={sortKey} dir={sortDir} onSort={handleIngSort}/>
                <SortTh label="Facility"    col="facility"   activeCol={sortKey} dir={sortDir} onSort={handleIngSort} filterActive={facility !== "all"}/>
                <SortTh label="Qty (kg)"    col="qty"        activeCol={sortKey} dir={sortDir} onSort={handleIngSort} right/>
                <SortTh label="Expiry"      col="expiry"     activeCol={sortKey} dir={sortDir} onSort={handleIngSort}/>
                <SortTh label="Days left"   col="expiry"     activeCol={sortKey} dir={sortDir} onSort={handleIngSort} right filterActive={daysFilter !== "All"}/>
                <SortTh label="Storage"     col="storage"    activeCol={sortKey} dir={sortDir} onSort={handleIngSort} filterActive={storage !== "All"}/>
                <SortTh label="Risk score"  col="risk"       activeCol={sortKey} dir={sortDir} onSort={handleIngSort} filterActive={risk !== "All"}/>
                <SortTh label="Status"      col="status"     activeCol={sortKey} dir={sortDir} onSort={handleIngSort}/>
                <th className="px-3 py-2 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map(l => (
                <tr key={l.id} onClick={() => setActiveLot(l)} className="border-t border-slate-800/80 hover:bg-slate-800/40 cursor-pointer transition">
                  <td className="px-3 py-2.5 font-mono text-slate-400 max-w-[120px]">
                    <span className="block truncate" title={l.id}>{l.id.slice(0, 12)}…</span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-100">{l.ingredient}</td>
                  <td className="px-3 py-2.5 text-slate-300">{FACILITY_NAME[l.facility] ?? l.facility}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">{l.qty.toLocaleString()}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-400">{l.expiry}</td>
                  <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${l.daysLeft <= 2 ? "text-red-300" : l.daysLeft <= 5 ? "text-amber-300" : "text-slate-300"}`}>{l.daysLeft}d</td>
                  <td className="px-3 py-2.5">
                    <Pill tone={l.storage === "frozen" ? "blue" : l.storage === "refrigerated" ? "teal" : "ghost"}>{l.storage}</Pill>
                  </td>
                  <td className="px-3 py-2.5"><RiskBar value={l.risk}/></td>
                  <td className="px-3 py-2.5"><StatusBadge status={l.status}/></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={e => { e.stopPropagation(); setActiveLot(l); }} className="px-1.5 py-0.5 text-[11px] rounded border border-slate-700 hover:border-blue-500 hover:bg-slate-800/40 text-slate-300 transition">Used in</button>
                      <button
                        onClick={e => { e.stopPropagation(); setTransferLotTarget(l); }}
                        disabled={l.status === "expired"}
                        className="px-1.5 py-0.5 text-[11px] rounded border border-slate-700 hover:border-blue-500 hover:bg-slate-800/40 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >Transfer</button>
                      <button onClick={e => { e.stopPropagation(); setWriteOffLotTarget(l); }} className="px-1.5 py-0.5 text-[11px] rounded border border-amber-500/30 hover:border-amber-500/60 hover:bg-amber-500/10 text-amber-400 hover:text-amber-300 transition">Write-off</button>
                      <button onClick={e => { e.stopPropagation(); setDeleteConfirmLot(l); }} className="px-1.5 py-0.5 text-[11px] rounded border border-red-500/30 hover:border-red-500/60 hover:bg-red-500/10 text-red-400 hover:text-red-300 transition">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {filtered.length > 200 && (
            <div className="px-4 py-2 border-t border-slate-800 text-[11px] text-slate-500 font-mono">
              Showing 200 of {filtered.length} lots — refine filters to see more
            </div>
          )}
        </div>

        <div className="mt-6">
          <SectionHeader title="Stock horizon" sub="Days of stock remaining at current consumption rate. Red marker = reorder by lead time."/>
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4 space-y-2">
            {horizon.map((h, i) => (
              <div key={i} className="grid grid-cols-[minmax(120px,200px)_1fr_auto] items-center gap-3">
                <div className="text-[12px] text-slate-300 truncate">{h.ingredient}</div>
                <div className="relative h-5 rounded bg-slate-800/60 overflow-hidden">
                  <div className={`h-full ${h.needReorder ? "bg-amber-500/40" : "bg-emerald-500/30"}`} style={{ width: `${Math.min(100, (h.days / 30) * 100)}%` }}/>
                  <div className="absolute top-0 bottom-0 w-[2px] bg-red-500" style={{ left: `${(h.leadTime / 30) * 100}%` }}/>
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-300">{h.days}d · {h.burn.toFixed(1)} kg/d</div>
              </div>
            ))}
          </div>
        </div>
        </>)}
        </div>
      </div>

      {activeLot && (
        <>
          <div className="fixed inset-0 z-20 bg-black/20" onClick={closeLot}/>
          <LotSlideIn
            lot={activeLot}
            onClose={closeLot}
            isClosing={lotClosing}
          />
        </>
      )}

      {writeOffLotTarget && (
        <WriteOffModal
          lot={writeOffLotTarget}
          onClose={() => setWriteOffLotTarget(null)}
          onSuccess={handleWriteOffSuccess}
        />
      )}

      {transferLotTarget && (
        <TransferModal
          lot={transferLotTarget}
          onClose={() => setTransferLotTarget(null)}
          onSuccess={handleTransferSuccess}
        />
      )}

      {addLotOpen && (
        <AddLotModal
          onClose={() => setAddLotOpen(false)}
          onSuccess={(lot) => {
            setAddedLots(prev => [lot, ...prev]);
            setAddLotOpen(false);
            showToast(`Lot ${lot.id.slice(0, 12)}… added.`, "success");
          }}
        />
      )}

      {ingredientsManagerOpen && (
        <IngredientsManagerModal onClose={() => setIngredientsManagerOpen(false)}/>
      )}

      {deleteConfirmLot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl border border-red-500/30 bg-[#0c111c] shadow-2xl p-6">
            <div className="text-[15px] font-semibold text-slate-100 mb-1">Delete lot?</div>
            <div className="text-[12px] font-mono text-slate-500 mb-4">{deleteConfirmLot.id} · {deleteConfirmLot.ingredient}</div>
            <div className="text-[12px] text-slate-400 mb-5">This permanently removes the lot record. This cannot be undone.</div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setDeletingLot(true);
                  const ok = await deleteLot(deleteConfirmLot.id.toLowerCase());
                  setDeletingLot(false);
                  if (ok) {
                    setDeletedLotIds(prev => new Set(prev).add(deleteConfirmLot.id));
                    setDeleteConfirmLot(null);
                    showToast(`Lot deleted.`, "success");
                  } else {
                    showToast("Delete failed.", "error");
                    setDeleteConfirmLot(null);
                  }
                }}
                disabled={deletingLot}
                className="flex-1 py-2 rounded-md bg-red-500 hover:bg-red-400 disabled:opacity-50 text-red-950 font-semibold text-[13px] flex items-center justify-center gap-2"
              >
                {deletingLot && <span className="w-3.5 h-3.5 border-2 border-red-950/40 border-t-red-950 rounded-full animate-spin"/>}
                Delete
              </button>
              <button onClick={() => setDeleteConfirmLot(null)} className="px-4 py-2 rounded-md border border-slate-700 text-slate-300 text-[13px] hover:border-slate-500">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast msg={toast.msg} kind={toast.kind} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
