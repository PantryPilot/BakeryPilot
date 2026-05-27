"use client";

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
  const selected = models.find((m) => m.id === value);
  const availableModels = models.filter((m) => m.available);

  if (availableModels.length === 0) {
    return (
      <span className="text-[10px] font-mono text-slate-500">
        No models configured
      </span>
    );
  }

  return (
    <label className={`inline-flex items-center gap-2 ${compact ? "" : "min-w-0"}`}>
      {!compact && (
        <span className="text-[10px] uppercase tracking-wider text-slate-500 shrink-0">
          Model
        </span>
      )}
      <div className="relative min-w-0">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`appearance-none rounded-md border border-slate-700 bg-slate-900 text-slate-200 outline-none focus:border-blue-500/60 disabled:opacity-50 ${
            compact
              ? "pl-2 pr-7 py-1 text-[11px] max-w-[160px]"
              : "pl-3 pr-8 py-1.5 text-[12px] max-w-[220px]"
          }`}
          title={selected?.description}
        >
          {models.map((model) => (
            <option key={model.id} value={model.id} disabled={!model.available}>
              {model.available ? model.label : `${model.label} (no API key)`}
            </option>
          ))}
        </select>
        <Icon
          name="chevron"
          size={12}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
        />
      </div>
      {selected && (
        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 shrink-0">
          <span className="rounded px-1.5 py-0.5 bg-slate-800 text-slate-400">
            {providerBadge(selected.provider)}
          </span>
          {selected.tier === "free" && (
            <span className="rounded px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400">
              free
            </span>
          )}
        </span>
      )}
    </label>
  );
}
