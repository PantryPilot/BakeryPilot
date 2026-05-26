"use client";
import { useState } from "react";
import { Icon } from "../../components/Icon";
import { SectionHeader } from "../../components/atoms";

const ACCENT_COLORS = [
  { id: "blue",    label: "Ocean Blue", bg: "bg-blue-500",    ring: "ring-blue-500"    },
  { id: "emerald", label: "Emerald",    bg: "bg-emerald-500", ring: "ring-emerald-500" },
  { id: "violet",  label: "Violet",     bg: "bg-violet-500",  ring: "ring-violet-500"  },
  { id: "amber",   label: "Amber",      bg: "bg-amber-500",   ring: "ring-amber-500"   },
];

const INITIAL_TOGGLES = {
  toast:       { label: "Toast alerts",            sub: "Show banner toasts for critical and warning events",  on: true  },
  autoDismiss: { label: "Auto-dismiss after 5s",   sub: "Automatically hide toasts after 5 seconds",          on: true  },
  expiring:    { label: "Expiring lot alerts",      sub: "Notify when ingredient lots are expiring soon",      on: true  },
  supplier:    { label: "Supplier risk alerts",     sub: "Notify when a supplier is flagged as at risk",       on: true  },
  yield:       { label: "Yield anomaly alerts",     sub: "Notify when yield drops below threshold",           on: false },
};

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative w-10 h-6 rounded-full transition-colors duration-200 shrink-0 ${on ? "bg-blue-500" : "bg-slate-700"}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-5" : "translate-x-1"}`}/>
    </button>
  );
}

export default function SettingsPage() {
  const [accent, setAccent] = useState("blue");
  const [toggles, setToggles] = useState(
    Object.fromEntries(Object.entries(INITIAL_TOGGLES).map(([k, v]) => [k, v.on]))
  );
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[720px] mx-auto p-6 space-y-5">
        <SectionHeader title="Settings" sub="Profile, appearance, and notification preferences"/>

        {/* ── Profile ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-[13px] font-semibold text-slate-200 uppercase tracking-wider">Profile</h3>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-[16px] font-semibold text-white shrink-0">
                AC
              </div>
              <div>
                <div className="text-[18px] font-semibold text-slate-100">Alex Chen</div>
                <div className="text-[12px] text-slate-400">Ops Manager · FGF Brands</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {[
                { label: "Display name", value: "Alex Chen",              readOnly: false },
                { label: "Role",         value: "Ops Manager",            readOnly: false },
                { label: "Email",        value: "alex.chen@fgfbrands.com",readOnly: true  },
                { label: "Facility",     value: "All Plants",             readOnly: true  },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{f.label}</label>
                  <input
                    defaultValue={f.value}
                    readOnly={f.readOnly}
                    className={`w-full rounded-md border px-3 py-2 text-[13px] outline-none transition ${
                      f.readOnly
                        ? "border-slate-800 bg-slate-900/20 text-slate-500 cursor-not-allowed"
                        : "border-slate-700 bg-slate-950/60 text-slate-100 focus:border-blue-500"
                    }`}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handleSave}
              className={`px-4 py-2 rounded-md font-semibold text-[13px] transition ${
                saved ? "bg-emerald-500 text-emerald-950" : "bg-blue-500 hover:bg-blue-400 text-blue-950"
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
            <p className="text-[11px] text-slate-500 mt-0.5">Customize dashboard accent color</p>
          </div>
          <div className="p-5 space-y-5">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Accent color</div>
              <div className="flex gap-3 flex-wrap">
                {ACCENT_COLORS.map(c => (
                  <button
                    key={c.id}
                    title={c.label}
                    onClick={() => setAccent(c.id)}
                    className={`w-8 h-8 rounded-full ${c.bg} transition-all duration-150 ${
                      accent === c.id
                        ? `ring-2 ring-offset-2 ring-offset-slate-900 ${c.ring} scale-110`
                        : "opacity-50 hover:opacity-80"
                    }`}
                  />
                ))}
                <span className="text-[11px] text-slate-500 self-center ml-1">
                  {ACCENT_COLORS.find(c => c.id === accent)?.label}
                </span>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Color scheme</div>
              <div className="flex gap-2 flex-wrap">
                {["Dark (default)", "High contrast"].map((label, i) => (
                  <button key={label} className={`px-3 py-1.5 rounded-md border text-[12px] transition ${
                    i === 0
                      ? "border-blue-500/40 bg-blue-500/10 text-blue-200"
                      : "border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"
                  }`}>
                    {label}
                  </button>
                ))}
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
            {Object.entries(INITIAL_TOGGLES).map(([key, n]) => (
              <div key={key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-[13px] text-slate-200">{n.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{n.sub}</div>
                </div>
                <Toggle
                  on={toggles[key] ?? n.on}
                  onClick={() => setToggles(prev => ({ ...prev, [key]: !prev[key] }))}
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
                { label: "Version",   value: "v0.4.0-hackathon" },
                { label: "Build",     value: "2026-05-26"        },
                { label: "Agent",     value: "LangGraph · claude-sonnet-4-6" },
                { label: "Backend",   value: "FastAPI · :8000"   },
                { label: "Frontend",  value: "Next.js 15 · React 19" },
                { label: "Team",      value: "PantryPilot · TMLS 2026" },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="text-slate-500">{item.label}</span>
                  <span className="text-slate-300 font-mono">{item.value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-800 flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shrink-0">
                <Icon name="spark" size={14} className="text-blue-950"/>
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
