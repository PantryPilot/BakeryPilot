"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import type { ChatModelOption } from "../lib/chatModels";
import { providerBadge } from "../lib/chatModels";

interface ModelSelectorProps {
  models: ChatModelOption[];
  value: string;
  onChange: (modelId: string) => void;
  compact?: boolean;
  disabled?: boolean;
}

export function ModelSelector({
  models,
  value,
  onChange,
  compact = false,
  disabled = false,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const PANEL_WIDTH = 260;
  const selected = models.find((m) => m.id === value);

  const computePos = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8));
    setPanelPos({ top: r.bottom + 6, left });
  };

  const toggleOpen = () => {
    if (!open) computePos();
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onReflow = () => computePos();
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open]);

  if (models.length === 0) {
    return (
      <span className="text-[10px] font-mono text-slate-500">
        No models configured
      </span>
    );
  }

  const grouped = models.reduce<Record<string, ChatModelOption[]>>((acc, m) => {
    (acc[m.provider] ||= []).push(m);
    return acc;
  }, {});
  const providerOrder = ["anthropic", "openai", "google", "groq"];
  const orderedProviders = [
    ...providerOrder.filter((p) => grouped[p]),
    ...Object.keys(grouped).filter((p) => !providerOrder.includes(p)),
  ];

  const triggerCls = compact
    ? "h-7 px-2 text-[11px] gap-1.5 max-w-[140px]"
    : "h-8 pl-2.5 pr-2 text-[12px] gap-2 max-w-[220px]";

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        title={selected ? `${selected.label} — ${selected.description}` : "Select model"}
        className={`flex items-center rounded-md border border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:bg-slate-800/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${triggerCls}`}
      >
        {selected && !compact && (
          <span className="rounded px-1.5 py-0.5 text-[9px] font-mono bg-slate-800 text-slate-400 shrink-0">
            {providerBadge(selected.provider)}
          </span>
        )}
        <span className="truncate flex-1 text-left">
          {selected?.label ?? "Select model"}
        </span>
        <Icon
          name="chevron"
          size={12}
          className={`text-slate-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            style={{ top: panelPos.top, left: panelPos.left, width: PANEL_WIDTH }}
            className="fixed z-[200] rounded-lg border border-slate-700 bg-[#0c111c] shadow-2xl shadow-black/40 overflow-hidden"
          >
            <div className="max-h-[320px] overflow-y-auto py-1">
              {orderedProviders.map((provider, pi) => (
                <div key={provider}>
                  {pi > 0 && <div className="my-1 h-px bg-slate-800" />}
                  <div className="px-3 pt-1.5 pb-0.5 text-[9px] uppercase tracking-wider text-slate-500 font-mono">
                    {providerBadge(provider)}
                  </div>
                  {grouped[provider].map((m) => {
                    const isSelected = m.id === value;
                    const isDisabled = !m.available;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={isDisabled}
                        onClick={() => {
                          if (isDisabled) return;
                          onChange(m.id);
                          setOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
                          isDisabled
                            ? "text-slate-600 cursor-not-allowed"
                            : isSelected
                              ? "bg-blue-500/10 text-blue-100"
                              : "text-slate-200 hover:bg-slate-800/70"
                        }`}
                      >
                        <span className="w-3 shrink-0 text-blue-400">
                          {isSelected && <Icon name="check" size={12} />}
                        </span>
                        <span className="flex-1 min-w-0 truncate">{m.label}</span>
                        {m.tier === "free" && !isDisabled && (
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-mono bg-emerald-500/10 text-emerald-400 shrink-0">
                            free
                          </span>
                        )}
                        {isDisabled && (
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-mono bg-slate-800 text-slate-500 shrink-0">
                            no key
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
