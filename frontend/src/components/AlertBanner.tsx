"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/context";
import { Icon } from "./Icon";

const KIND_ICON: Record<string, string> = {
  expiring_lot: "box",
  supplier_risk: "truck",
  yield_spike: "zap",
};

const MAX_VISIBLE = 3;
const AUTO_HIDE_MS = 5000;

const KIND_PREF_KEY: Record<string, "expiringLots" | "supplierRisk" | "yieldAnomaly" | null> = {
  expiring_lot: "expiringLots",
  supplier_risk: "supplierRisk",
  yield_spike: "yieldAnomaly",
};

export function AlertBanner() {
  const { notifications, dismissNotification, hideToast, openChatContext, notificationPrefs } = useApp();
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());

  // Use a ref so timer callbacks always call the latest version of startExit
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const startExitRef = useRef((_id: string, _full: boolean) => {});

  startExitRef.current = (refId: string, fullDismiss: boolean) => {
    const existing = timersRef.current.get(refId);
    if (existing) { clearTimeout(existing); timersRef.current.delete(refId); }

    setExitingIds(prev => {
      if (prev.has(refId)) return prev;
      return new Set([...prev, refId]);
    });

    setTimeout(() => {
      setExitingIds(prev => { const n = new Set(prev); n.delete(refId); return n; });
      if (fullDismiss) dismissNotification(refId);
      else hideToast(refId);
    }, 280);
  };

  const toastList = notificationPrefs.toast
    ? notifications.filter(n => {
        if (n.toastHidden) return false;
        const prefKey = KIND_PREF_KEY[n.kind];
        if (prefKey && !notificationPrefs[prefKey]) return false;
        return true;
      })
    : [];
  const visible = toastList.slice(0, MAX_VISIBLE);
  const extraCount = toastList.length - visible.length;

  // Set auto-hide timers whenever the visible list changes
  const visibleKey = visible.map(n => n.ref_id).join(",");
  const autoDismiss = notificationPrefs.autoDismiss;
  useEffect(() => {
    const ids = new Set(visible.map(v => v.ref_id));

    if (autoDismiss) {
      visible.forEach(n => {
        if (!timersRef.current.has(n.ref_id)) {
          const id = n.ref_id;
          const t = setTimeout(() => startExitRef.current(id, false), AUTO_HIDE_MS);
          timersRef.current.set(n.ref_id, t);
        }
      });
    } else {
      // Clear any pending auto-dismiss timers
      for (const [id, t] of timersRef.current) {
        clearTimeout(t);
        timersRef.current.delete(id);
      }
    }

    // Clear timers for notifications no longer in the visible list
    for (const [id, t] of timersRef.current) {
      if (!ids.has(id)) { clearTimeout(t); timersRef.current.delete(id); }
    }
  // visibleKey captures all identity changes without triggering on unrelated renders
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, autoDismiss]);

  if (visible.length === 0 && extraCount === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-40 flex flex-col gap-2 max-w-[340px] pointer-events-none">
      {visible.map(n => (
        <div
          key={n.ref_id}
          style={{
            animation: exitingIds.has(n.ref_id)
              ? "toast-out 280ms ease forwards"
              : "toast-in 280ms ease forwards",
          }}
          className={`rounded-lg border px-3 py-2.5 shadow-lg flex gap-3 items-start text-[12px] pointer-events-auto ${
            n.severity === "critical"
              ? "border-red-500/40 bg-red-950/60 text-red-100"
              : "border-amber-500/40 bg-amber-950/60 text-amber-100"
          }`}
        >
          <span className={`mt-0.5 shrink-0 ${n.severity === "critical" ? "text-red-400" : "text-amber-400"}`}>
            <Icon name={KIND_ICON[n.kind] ?? "zap"} size={14}/>
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold leading-tight">{n.title}</div>
            <div className="text-[11px] opacity-70 mt-0.5 leading-tight">{n.body}</div>
            <button
              onClick={() => { startExitRef.current(n.ref_id, true); openChatContext(n.action); }}
              className="mt-1.5 text-[10px] font-medium underline underline-offset-2 opacity-80 hover:opacity-100"
            >
              Ask Copilot →
            </button>
          </div>
          <button
            onClick={() => startExitRef.current(n.ref_id, true)}
            className="shrink-0 opacity-50 hover:opacity-100 mt-0.5"
          >
            <Icon name="x" size={12}/>
          </button>
        </div>
      ))}
      {extraCount > 0 && (
        <p className="pointer-events-none self-end text-[10px] font-mono text-slate-400 pr-0.5">
          +{extraCount} more · open notification panel
        </p>
      )}
    </div>
  );
}
