"use client";
import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { SectionHeader } from "../../components/atoms";
import { FACILITIES } from "../../lib/data";
import { useApp, type NotificationPrefs } from "../../lib/context";
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

const NOTIFICATION_FIELDS: { key: keyof NotificationPrefs; label: string; sub: string }[] = [
  { key: "toast",         label: "Toast alerts",          sub: "Show banner toasts for critical and warning events" },
  { key: "autoDismiss",   label: "Auto-dismiss after 5s", sub: "Automatically hide toasts after 5 seconds" },
  { key: "expiringLots",  label: "Expiring lot alerts",   sub: "Notify when ingredient lots are expiring soon" },
  { key: "supplierRisk",  label: "Supplier risk alerts",  sub: "Notify when a supplier is flagged as at risk" },
  { key: "yieldAnomaly",  label: "Yield anomaly alerts",  sub: "Notify when yield drops below threshold" },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(p => p[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "?";
}

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
  const {
    theme, setTheme, accent, setAccent,
    user, updateUser,
    notificationPrefs, updateNotificationPrefs,
  } = useApp();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState(user.role);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setDisplayName(user.displayName); }, [user.displayName]);
  useEffect(() => { setRole(user.role); }, [user.role]);

  const facilityLabel =
    FACILITIES.find(f => f.id === (user.defaultFacilityId as string))?.name ??
    user.defaultFacilityId ?? "All Plants";

  const handleSave = async () => {
    await updateUser({ displayName, role });
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
                {initials(user.displayName)}
              </div>
              <div>
                <div className="text-[18px] font-semibold text-slate-100">{user.displayName}</div>
                <div className="text-[12px] text-slate-400">{user.role} · FGF Brands</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Display name</label>
                <input
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-[13px] outline-none transition border-slate-700 bg-slate-950/60 text-slate-100 focus:border-[var(--bp-accent)]"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Role</label>
                <input
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-[13px] outline-none transition border-slate-700 bg-slate-950/60 text-slate-100 focus:border-[var(--bp-accent)]"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Email</label>
                <input
                  value={user.email}
                  readOnly
                  className="w-full rounded-md border px-3 py-2 text-[13px] outline-none transition border-slate-800 bg-slate-900/20 text-slate-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Facility</label>
                <input
                  value={facilityLabel}
                  readOnly
                  className="w-full rounded-md border px-3 py-2 text-[13px] outline-none transition border-slate-800 bg-slate-900/20 text-slate-500 cursor-not-allowed"
                />
              </div>
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
            {NOTIFICATION_FIELDS.map((field) => (
              <div key={field.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-[13px] text-slate-200">{field.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{field.sub}</div>
                </div>
                <Toggle
                  on={notificationPrefs[field.key]}
                  onClick={() => void updateNotificationPrefs({ [field.key]: !notificationPrefs[field.key] })}
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
