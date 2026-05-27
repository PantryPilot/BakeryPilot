"use client";
import { useState } from "react";
import { Icon } from "../../components/Icon";
import { SectionHeader } from "../../components/atoms";
import { useApp } from "../../lib/context";
import { DEFAULT_ACCENT, type AccentColor, type ThemeMode } from "../../lib/theme";

const ACCENT_COLORS = [
  { id: "blue", label: "Ocean Blue", hex: "#3b82f6" },
  { id: "emerald", label: "Emerald", hex: "#10b981" },
  { id: "violet", label: "Violet", hex: "#8b5cf6" },
  { id: "amber", label: "Amber", hex: "#f59e0b" },
  { id: "teal", label: "Teal Mist", hex: "#14b8a6" },
  { id: "indigo", label: "Indigo", hex: "#6366f1" },
] as const satisfies ReadonlyArray<{ id: AccentColor; label: string; hex: string }>;

const THEME_CHOICES = [
  { id: "dark", label: "Dark", desc: "Industrial dark slate interface" },
  { id: "light", label: "Light", desc: "Default clean operations dashboard" },
] as const satisfies ReadonlyArray<{ id: ThemeMode; label: string; desc: string }>;

const INITIAL_TOGGLES = {
  toast: { label: "Toast alerts", sub: "Show banner toasts for critical and warning events", on: true },
  autoDismiss: { label: "Auto-dismiss after 5s", sub: "Automatically hide toasts after 5 seconds", on: true },
  expiring: { label: "Expiring lot alerts", sub: "Notify when ingredient lots are expiring soon", on: true },
  supplier: { label: "Supplier risk alerts", sub: "Notify when a supplier is flagged as at risk", on: true },
  yield: { label: "Yield anomaly alerts", sub: "Notify when yield drops below threshold", on: false },
};

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative w-10 h-6 rounded-full overflow-hidden transition-colors duration-200 shrink-0 ${on ? "bg-[var(--bp-accent)]" : "bg-[var(--bp-toggle-off)]"}`}
    >
      <span
        className={`absolute left-1 top-1 w-4 h-4 rounded-full shadow transition-transform duration-200 ${
          on ? "translate-x-4 bg-white" : "translate-x-0 bg-[var(--bp-surface-strong)]"
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { theme, setTheme, accent, setAccent } = useApp();
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.entries(INITIAL_TOGGLES).map(([k, v]) => [k, v.on]))
  );
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleThemeChange = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    if (nextTheme === "light") {
      setAccent(DEFAULT_ACCENT);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[720px] mx-auto p-6 space-y-5">
        <SectionHeader title="Settings" sub="Profile, appearance, and notification preferences" />

        {/* ── Profile ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-[13px] font-semibold text-slate-200 uppercase tracking-wider">Profile</h3>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-4 mb-5">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-[16px] font-semibold shrink-0"
                style={{
                  color: "var(--bp-accent-foreground)",
                  background: "linear-gradient(135deg, var(--bp-accent), var(--bp-accent-hover))",
                }}
              >
                AC
              </div>
              <div>
                <div className="text-[18px] font-semibold text-slate-100">Alex Chen</div>
                <div className="text-[12px] text-slate-400">Ops Manager · FGF Brands</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {[
                { label: "Display name", value: "Alex Chen", readOnly: false },
                { label: "Role", value: "Ops Manager", readOnly: false },
                { label: "Email", value: "alex.chen@fgfbrands.com", readOnly: true },
                { label: "Facility", value: "All Plants", readOnly: true },
              ].map((field) => (
                <div key={field.label}>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{field.label}</label>
                  <input
                    defaultValue={field.value}
                    readOnly={field.readOnly}
                    className={`w-full rounded-md border px-3 py-2 text-[13px] outline-none transition ${
                      field.readOnly
                        ? "border-slate-800 bg-slate-900/20 text-slate-500 cursor-not-allowed"
                        : "border-slate-700 bg-slate-950/60 text-slate-100 focus:border-[var(--bp-accent)]"
                    }`}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handleSave}
              className={`px-4 py-2 rounded-md font-semibold text-[13px] transition ${
                saved
                  ? "bg-emerald-500 text-emerald-950"
                  : "bg-[var(--bp-accent)] hover:bg-[var(--bp-accent-hover)] text-[var(--bp-accent-foreground)]"
              }`}
            >
              {saved ? "✓ Saved" : "Save changes"}
            </button>
          </div>
        </div>

        {/* ── Appearance ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-[13px] font-semibold text-slate-200 uppercase tracking-wider">Appearance</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Choose theme and accent style</p>
          </div>
          <div className="p-5 space-y-5">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Theme</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {THEME_CHOICES.map((choice) => {
                  const active = choice.id === theme;
                  return (
                    <button
                      key={choice.id}
                      onClick={() => handleThemeChange(choice.id)}
                      className={`rounded-lg border px-3 py-2 text-left transition ${
                        active
                          ? "border-[rgba(var(--bp-accent-rgb),0.45)] bg-[rgba(var(--bp-accent-rgb),0.12)]"
                          : "border-slate-700 hover:border-slate-500"
                      }`}
                    >
                      <div className={`text-[13px] font-medium ${active ? "text-[var(--bp-accent)]" : "text-slate-200"}`}>{choice.label}</div>
                      <div className="text-[11px] text-slate-500 mt-1">{choice.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Accent color</div>
              <div className="flex gap-3 flex-wrap">
                {ACCENT_COLORS.map((color) => (
                  <button
                    key={color.id}
                    title={color.label}
                    onClick={() => setAccent(color.id)}
                    className={`w-8 h-8 rounded-full transition-all duration-150 ${
                      accent === color.id
                        ? "ring-2 ring-offset-2 ring-offset-[var(--bp-surface-strong)] scale-110"
                        : "opacity-50 hover:opacity-80"
                    }`}
                    style={{
                      backgroundColor: color.hex,
                      boxShadow: accent === color.id ? `0 0 0 2px ${color.hex}` : undefined,
                    }}
                  />
                ))}
                <span className="text-[11px] text-slate-500 self-center ml-1">
                  {ACCENT_COLORS.find((color) => color.id === accent)?.label}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Notifications ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-[13px] font-semibold text-slate-200 uppercase tracking-wider">Notifications</h3>
          </div>
          <div className="p-5 divide-y divide-slate-800/60">
            {Object.entries(INITIAL_TOGGLES).map(([key, notification]) => (
              <div key={key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-[13px] text-slate-200">{notification.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{notification.sub}</div>
                </div>
                <Toggle
                  on={toggles[key] ?? notification.on}
                  onClick={() => setToggles((prev) => ({ ...prev, [key]: !prev[key] }))}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── About ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-[13px] font-semibold text-slate-200 uppercase tracking-wider">About</h3>
          </div>
          <div className="p-5">
            <div className="space-y-0 divide-y divide-slate-800/60 text-[12px]">
              {[
                { label: "Version", value: "v0.4.0-hackathon" },
                { label: "Build", value: "2026-05-26" },
                { label: "Agent", value: "LangGraph · claude-sonnet-4-6" },
                { label: "Backend", value: "FastAPI · :8000" },
                { label: "Frontend", value: "Next.js 15 · React 19" },
                { label: "Team", value: "PantryPilot · TMLS 2026" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="text-slate-500">{item.label}</span>
                  <span className="text-slate-300 font-mono">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-800 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg, var(--bp-accent), var(--bp-accent-hover))" }}
              >
                <Icon name="spark" size={14} className="text-[var(--bp-accent-foreground)]" />
              </div>
              <div>
                <div className="text-[12px] text-slate-200 font-medium">BakeryPilot</div>
                <div className="text-[10px] text-slate-500">Agentic ops copilot for FGF Brands bakery operations</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
