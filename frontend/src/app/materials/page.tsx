"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useApp } from "../../lib/context";
import { Icon } from "../../components/Icon";
import { Pill, RiskBar, StatusBadge, SectionHeader } from "../../components/atoms";
import { FACILITIES, Lot } from "../../lib/data";
import { useLots, useLotSubstitutions, useIngredients } from "../../lib/hooks";
import {
  writeOffLot,
  transferLot,
  applySubstitution,
  createLot,
  deleteLot,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  fetchIngredients,
  type BackendSubstitutionCandidate,
  type BackendIngredient,
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

function ChipGroup({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { id: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">{label}</span>
      {options.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`px-2 h-7 rounded-md text-[12px] border transition ${value === o.id ? "bg-blue-500/15 text-blue-200 border-blue-500/40" : "bg-transparent text-slate-400 border-slate-800 hover:border-slate-600 hover:text-slate-200"}`}>
          {o.label}
        </button>
      ))}
    </div>
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
            <div className="text-[15px] font-semibold text-slate-100">Write off lot</div>
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
              <div className="text-[16px] font-mono tabular-nums text-slate-100 mt-0.5">{lot.facility.toUpperCase()}</div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#0c111c] shadow-2xl p-6">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-2xl rounded-xl border border-slate-800 bg-[#0c111c] shadow-2xl flex flex-col max-h-[85vh]">
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
  lot, onClose, isClosing, onToast,
}: {
  lot: Lot;
  onClose: () => void;
  isClosing?: boolean;
  onLotUpdate?: (updated: Lot) => void;
  onToast: (msg: string, kind: "success" | "error") => void;
}) {
  const backendLotId = lot.id.toLowerCase();
  const { data: rawSubs, status: subsStatus } = useLotSubstitutions(backendLotId);
  const [usingIdx, setUsingIdx] = useState<number | null>(null);
  const [usedIdx, setUsedIdx] = useState<number | null>(null);

  const substitutes = rawSubs.map((s: BackendSubstitutionCandidate, i: number) => ({
    name: s.sku_name,
    facility: s.facility_name ?? s.facility_id ?? "—",
    qty: s.achievable_quantity,
    compat: s.margin_score,
    allergen: s.allergens && s.allergens.length > 0 ? s.allergens.join(", ") : "none",
    rank: i + 1,
    sku_id: s.sku_id,
  }));

  const handleUse = async (idx: number, sub: typeof substitutes[0]) => {
    setUsingIdx(idx);
    try {
      const result = await applySubstitution(backendLotId, {
        substitute_sku_id: sub.sku_id,
        quantity_kg: lot.qty,
      });
      if (!result) {
        onToast("Failed to apply substitution. Please try again.", "error");
      } else {
        setUsedIdx(idx);
        onToast(`Substitution action card created (${result.action_card_id.slice(0, 8)}…)`, "success");
      }
    } catch {
      onToast("Unexpected error applying substitution.", "error");
    } finally {
      setUsingIdx(null);
    }
  };

  return (
    <div
      style={{ animation: isClosing ? "slide-out-right 280ms ease forwards" : "slide-in-right 280ms ease forwards" }}
      className="fixed top-14 right-0 bottom-12 z-30 w-full sm:w-[640px] bg-[#0c111c] border-l border-slate-800 shadow-2xl flex flex-col"
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
            { label: "Facility",  value: lot.facility.toUpperCase() },
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
            Substitution candidates
            {subsStatus === "live" && <span className="ml-2 text-emerald-400 normal-case font-normal">· live</span>}
          </div>
          {subsStatus === "loading" && (
            <div className="text-[12px] text-slate-500 py-3">Loading…</div>
          )}
          {subsStatus !== "loading" && substitutes.length === 0 && (
            <div className="text-[12px] text-slate-500 py-3">No substitution candidates found for this lot.</div>
          )}
          <div className="space-y-1.5">
            {substitutes.map((s, i) => (
              <div key={i} className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-900/40 p-2.5">
                <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[11px] font-mono text-slate-300">{s.rank}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-slate-100">{s.name}</div>
                  <div className="text-[11px] font-mono text-slate-500">{s.facility} · {s.qty} kg avail · allergen {s.allergen}</div>
                </div>
                <div className="text-right">
                  <div className="text-[14px] font-mono tabular-nums text-emerald-300">{Math.round(s.compat * 100)}%</div>
                  <div className="text-[10px] text-slate-500">compat</div>
                </div>
                <button
                  onClick={() => handleUse(i, s)}
                  disabled={usingIdx === i || usedIdx === i}
                  className="px-2.5 py-1.5 rounded-md bg-blue-500 hover:bg-blue-400 disabled:opacity-60 disabled:cursor-not-allowed text-blue-950 font-semibold text-[12px] flex items-center gap-1.5 transition"
                >
                  {usingIdx === i && <span className="w-3 h-3 border-2 border-blue-950/40 border-t-blue-950 rounded-full animate-spin"/>}
                  {usedIdx === i ? "Applied" : "Use"}
                </button>
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MaterialsPage() {
  const { openChatContext } = useApp();
  const [facility, setFacility] = useState("all");
  const [storage, setStorage] = useState("All");
  const [risk, setRisk] = useState("All");
  const [sort, setSort] = useState("risk");
  const [query, setQuery] = useState("");
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
    showToast(`Lot transferred to ${updated.facility.toUpperCase()}.`, "success");
  }, [showToast]);

  const filtered = useMemo(() => {
    let l = mergedLots.slice();
    if (facility !== "all") l = l.filter(x => x.facility === facility);
    if (storage !== "All") l = l.filter(x => x.storage === storage.toLowerCase());
    if (risk !== "All") {
      const map: Record<string, string> = { "OK": "ok", "At Risk": "warn", "Critical": "critical", "Expired": "expired" };
      l = l.filter(x => x.status === map[risk]);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      l = l.filter(x => x.ingredient.toLowerCase().includes(q) || x.id.toLowerCase().includes(q));
    }
    if (sort === "risk")     l.sort((a, b) => b.risk - a.risk);
    if (sort === "expiry")   l.sort((a, b) => a.daysLeft - b.daysLeft);
    if (sort === "qty")      l.sort((a, b) => b.qty - a.qty);
    if (sort === "facility") l.sort((a, b) => a.facility.localeCompare(b.facility));
    return l;
  }, [mergedLots, facility, storage, risk, sort, query]);

  const horizon = useMemo(() => {
    const groups: Record<string, { ingredient: string; total: number }> = {};
    mergedLots.forEach(l => {
      if (!groups[l.ingredient]) groups[l.ingredient] = { ingredient: l.ingredient, total: 0 };
      groups[l.ingredient].total += l.qty;
    });
    return Object.values(groups).map(g => {
      const burn = Math.max(0.5, g.total * 0.1);
      const days = Math.min(60, Math.round(g.total / burn));
      const leadTime = 5;
      return { ...g, burn, days, leadTime, needReorder: days <= leadTime + 2 };
    }).sort((a, b) => a.days - b.days).slice(0, 10);
  }, [mergedLots]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1600px] mx-auto">
        <SectionHeader
          title="Inventory"
          sub={`${mergedLots.length} active lots · ${mergedLots.filter(l => l.status === "critical").length} critical · ${mergedLots.filter(l => l.status === "warn").length} at risk · ${backendStatus === "live" ? "live data" : backendStatus === "loading" ? "loading…" : "offline (seed data)"}`}
          right={
            <div className="flex items-center gap-2">
              <button onClick={() => setIngredientsManagerOpen(true)} className="px-3 py-1.5 rounded-md border border-slate-700 hover:border-slate-500 text-[12px] text-slate-200 flex items-center gap-2">
                <Icon name="settings" size={13}/> Ingredients
              </button>
              <button onClick={() => setAddLotOpen(true)} className="px-3 py-1.5 rounded-md bg-blue-500 hover:bg-blue-400 text-blue-950 font-semibold text-[12px] flex items-center gap-2">
                + Add Lot
              </button>
              <button onClick={() => openChatContext("Inventory · all plants")} className="px-3 py-1.5 rounded-md border border-slate-700 hover:border-blue-500 text-[12px] text-slate-200 flex items-center gap-2">
                <Icon name="chat" size={13}/> Ask copilot
              </button>
            </div>
          }
        />

        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 mb-4">
          <div className="flex flex-wrap items-start gap-3">
            <ChipGroup label="Facility" value={facility} onChange={setFacility} options={FILTER_FACILITY}/>
            <span className="w-px h-5 bg-slate-800"/>
            <ChipGroup label="Storage" value={storage} onChange={setStorage} options={FILTER_STORAGE.map(x => ({ id: x, label: x }))}/>
            <span className="w-px h-5 bg-slate-800"/>
            <ChipGroup label="Risk" value={risk} onChange={setRisk} options={FILTER_RISK.map(x => ({ id: x, label: x }))}/>
            <div className="flex-1"/>
            <div className="flex items-center gap-2 rounded-md border border-slate-800 px-2 h-8">
              <Icon name="search" size={13} className="text-slate-500"/>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search ingredient or lot ID"
                     className="bg-transparent outline-none text-[12px] text-slate-100 placeholder:text-slate-500 w-48"/>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span>Sort</span>
              <select value={sort} onChange={e => setSort(e.target.value)} className="bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-[12px] text-slate-200">
                <option value="risk">Spoilage Risk</option>
                <option value="expiry">Expiry Date</option>
                <option value="qty">Quantity</option>
                <option value="facility">Facility</option>
              </select>
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
                  <div className="text-[10px] font-mono text-slate-500 mt-0.5">{l.id.slice(0, 12)}… · {l.facility.toUpperCase()}</div>
                </div>
                <div className="shrink-0 text-right">
                  <StatusBadge status={l.status}/>
                  <div className={`text-[11px] font-mono mt-1 ${l.daysLeft <= 2 ? "text-red-300" : l.daysLeft <= 5 ? "text-amber-300" : "text-slate-400"}`}>
                    {l.daysLeft}d · {l.qty.toLocaleString()} kg
                  </div>
                </div>
              </div>
              <div className="mt-2 flex gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => setActiveLot(l)} className="px-1.5 py-0.5 text-[11px] rounded border border-slate-700 hover:border-blue-500 text-slate-300">Substitute</button>
                <button onClick={() => setTransferLotTarget(l)} className="px-1.5 py-0.5 text-[11px] rounded border border-slate-700 hover:border-blue-500 text-slate-300">Transfer</button>
                <button onClick={() => setWriteOffLotTarget(l)} className="px-1.5 py-0.5 text-[11px] rounded text-red-400 hover:text-red-300">Write off</button>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden sm:block rounded-lg border border-slate-800 bg-slate-900/30 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="bp-data-table w-full min-w-[860px] text-[13px]">
            <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                {["Lot ID", "Ingredient", "Facility", "Qty (kg)", "Expiry", "Days left", "Storage", "Risk score", "Status", "Actions"].map((h, i) => (
                  <th key={i} className={`px-3 py-2 text-left font-semibold ${[3, 5].includes(i) ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} onClick={() => setActiveLot(l)} className="border-t border-slate-800/80 hover:bg-slate-800/40 cursor-pointer transition">
                  <td className="px-3 py-2.5 font-mono text-slate-400 max-w-[120px]">
                    <span className="block truncate" title={l.id}>{l.id.slice(0, 12)}…</span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-100">{l.ingredient}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-300">{l.facility.toUpperCase()}</td>
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
                      <button onClick={e => { e.stopPropagation(); setActiveLot(l); }} className="px-1.5 py-0.5 text-[11px] rounded border border-slate-700 hover:border-blue-500 text-slate-300">Substitute</button>
                      <button onClick={e => { e.stopPropagation(); setTransferLotTarget(l); }} className="px-1.5 py-0.5 text-[11px] rounded border border-slate-700 hover:border-blue-500 text-slate-300">Transfer</button>
                      <button onClick={e => { e.stopPropagation(); setWriteOffLotTarget(l); }} className="px-1.5 py-0.5 text-[11px] rounded text-red-400 hover:text-red-300">Write off</button>
                      <button onClick={e => { e.stopPropagation(); setDeleteConfirmLot(l); }} className="px-1.5 py-0.5 text-[11px] rounded text-red-500 hover:text-red-400 border border-red-500/30 hover:border-red-500/60">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        <div className="mt-6">
          <SectionHeader title="Stock horizon" sub="Days of stock remaining at current consumption rate. Red marker = reorder by lead time."/>
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-4 space-y-2">
            {horizon.map((h, i) => (
              <div key={i} className="grid grid-cols-[minmax(120px,200px)_1fr_auto] items-center gap-3">
                <div className="text-[12px] text-slate-300 truncate">{h.ingredient}</div>
                <div className="relative h-5 rounded bg-slate-800/60 overflow-hidden">
                  <div className={`h-full ${h.needReorder ? "bg-amber-500/40" : "bg-emerald-500/30"}`} style={{ width: `${Math.min(100, (h.days / 60) * 100)}%` }}/>
                  <div className="absolute top-0 bottom-0 w-[2px] bg-red-500" style={{ left: `${(h.leadTime / 60) * 100}%` }}/>
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-300">{h.days}d · {h.burn.toFixed(1)} kg/d</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {activeLot && (
        <>
          <div className="fixed inset-0 z-20 bg-black/20" onClick={closeLot}/>
          <LotSlideIn
            lot={activeLot}
            onClose={closeLot}
            isClosing={lotClosing}
            onToast={showToast}
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
