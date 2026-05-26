"use client";
import { useApp } from "../lib/context";
import { Icon } from "./Icon";

const KIND_ICON: Record<string, string> = {
  expiring_lot: "box",
  supplier_risk: "truck",
  yield_spike: "zap",
};

export function AlertBanner() {
  const { notifications, dismissNotification, openChatContext } = useApp();

  const visible = notifications.filter(n => n.severity === "critical" || n.severity === "warning");
  if (visible.length === 0) return null;

  const askCopilot = (refId: string, action: string) => {
    dismissNotification(refId);
    openChatContext(action);
  };

  return (
    <div className="fixed top-16 right-4 z-40 flex flex-col gap-2 max-w-[340px] pointer-events-none">
      {visible.slice(0, 5).map(n => (
        <div
          key={n.ref_id}
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
              onClick={() => askCopilot(n.ref_id, n.action)}
              className="mt-1.5 text-[10px] font-medium underline underline-offset-2 opacity-80 hover:opacity-100"
            >
              Ask Copilot →
            </button>
          </div>
          <button
            onClick={() => dismissNotification(n.ref_id)}
            className="shrink-0 opacity-50 hover:opacity-100 mt-0.5"
          >
            <Icon name="x" size={12}/>
          </button>
        </div>
      ))}
    </div>
  );
}
