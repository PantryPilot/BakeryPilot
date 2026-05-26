"use client";
import { useEffect, useState } from "react";
import { BACKEND_URL } from "../lib/api";
import { useApp } from "../lib/context";
import { Icon } from "./Icon";

interface Alert {
  kind: string;
  severity: "critical" | "warning";
  title: string;
  body: string;
  action: string;
  ref_id: string;
}

const KIND_ICON: Record<string, string> = {
  expiring_lot: "box",
  supplier_risk: "truck",
  yield_spike: "zap",
};

export function AlertBanner() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const { setChatOpen, setChatContext } = useApp();

  useEffect(() => {
    const es = new EventSource(`${BACKEND_URL}/api/alerts`);

    es.addEventListener("alert", (e: MessageEvent) => {
      try {
        const alert: Alert = JSON.parse(e.data as string);
        setAlerts(prev => {
          if (prev.some(a => a.ref_id === alert.ref_id)) return prev;
          return [...prev, alert];
        });
      } catch {}
    });

    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  const visible = alerts.filter(a => !dismissed.has(a.ref_id));
  if (visible.length === 0) return null;

  const dismiss = (refId: string) => {
    setDismissed(prev => new Set([...prev, refId]));
  };

  const askCopilot = (alert: Alert) => {
    dismiss(alert.ref_id);
    setChatContext(alert.action);
    setChatOpen(true);
  };

  return (
    <div className="fixed top-16 right-4 z-40 flex flex-col gap-2 max-w-[340px]">
      {visible.slice(0, 5).map(alert => (
        <div
          key={alert.ref_id}
          className={`rounded-lg border px-3 py-2.5 shadow-lg flex gap-3 items-start text-[12px] ${
            alert.severity === "critical"
              ? "border-red-500/40 bg-red-950/60 text-red-100"
              : "border-amber-500/40 bg-amber-950/60 text-amber-100"
          }`}
        >
          <span className={`mt-0.5 shrink-0 ${alert.severity === "critical" ? "text-red-400" : "text-amber-400"}`}>
            <Icon name={KIND_ICON[alert.kind] ?? "zap"} size={14} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold leading-tight">{alert.title}</div>
            <div className="text-[11px] opacity-70 mt-0.5 leading-tight">{alert.body}</div>
            <button
              onClick={() => askCopilot(alert)}
              className="mt-1.5 text-[10px] font-medium underline underline-offset-2 opacity-80 hover:opacity-100"
            >
              Ask Copilot →
            </button>
          </div>
          <button
            onClick={() => dismiss(alert.ref_id)}
            className="shrink-0 opacity-50 hover:opacity-100 mt-0.5"
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
