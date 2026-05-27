"use client";
import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

const TOUR_KEY = "bp-tour-v1";

interface Step {
  id: string;
  title: string;
  body: string;
  target?: string;
  side?: "right" | "bottom" | "left" | "top" | "center";
}

const STEPS: Step[] = [
  {
    id: "welcome",
    title: "Welcome to BakeryPilot",
    body: "BakeryPilot is your AI-powered operations copilot for industrial bakery supply chains. This tour walks you through every module in under two minutes.",
    side: "center",
  },
  {
    id: "sidebar",
    title: "Navigation sidebar",
    body: "All modules live here. Click any item to switch views. Collapse the sidebar with the arrow at the bottom to reclaim screen space.",
    target: "[data-tour='sidebar']",
    side: "right",
  },
  {
    id: "flowsight",
    title: "FlowSight — Facility map",
    body: "An interactive PixiJS map of all your plants. See live ingredient flows, stock levels on every node, and transfer links between facilities in real time.",
    target: "[data-tour='nav-flowsight']",
    side: "right",
  },
  {
    id: "inventory",
    title: "Inventory — Ingredient lots",
    body: "Browse all ingredient lots across every facility. Filter by spoilage risk, expiry date, or ingredient type. The agent can suggest substitutions when a lot runs low.",
    target: "[data-tour='nav-inventory']",
    side: "right",
  },
  {
    id: "production",
    title: "Production — Runs & yield",
    body: "Track active and completed production runs. See actual-vs-planned yield variance per shift, and drill into anomalies to understand root causes.",
    target: "[data-tour='nav-production']",
    side: "right",
  },
  {
    id: "suppliers",
    title: "Suppliers — Risk scorecard",
    body: "Every supplier's on-time rate, lead time, MOQ exposure, and live disruption signals in one place. The agent can draft negotiation emails when risk spikes.",
    target: "[data-tour='nav-suppliers']",
    side: "right",
  },
  {
    id: "schedule",
    title: "Schedule — Production planning",
    body: "View and manage the MES production schedule. The OR-Tools optimizer suggests changeover sequences that minimise allergen cross-contact and downtime.",
    target: "[data-tour='nav-schedule']",
    side: "right",
  },
  {
    id: "facility",
    title: "Facility selector",
    body: "Switch context between plants. Everything — inventory, schedule, yield — filters to the selected facility. Choose 'All Plants' for a portfolio view.",
    target: "[data-tour='facility-selector']",
    side: "bottom",
  },
  {
    id: "notifications",
    title: "Smart notifications",
    body: "Real-time alerts for expiring lots, supplier disruptions, and yield spikes arrive here. Each alert has a one-click 'Ask Copilot' shortcut that pre-fills the chat with context.",
    target: "[data-tour='notifications']",
    side: "bottom",
  },
  {
    id: "copilot",
    title: "AI Copilot",
    body: "Ask anything in plain English or French: 'Which lots expire this week?', 'Preview landed cost for 500 kg of flour', or 'Plan my week across all operations'. The copilot calls real backend tools and never fabricates data.",
    target: "[data-tour='copilot-button']",
    side: "top",
  },
];

const PAD = 8;
const TOOLTIP_W = 340;

interface Rect { top: number; left: number; width: number; height: number }

function getRect(selector: string): Rect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function tooltipStyle(rect: Rect | null, side: Step["side"]): React.CSSProperties {
  if (!rect || side === "center") {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: TOOLTIP_W,
    };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (side === "right") {
    const left = Math.min(rect.left + rect.width + PAD + 12, vw - TOOLTIP_W - 16);
    const top = Math.max(16, Math.min(rect.top + rect.height / 2 - 80, vh - 220));
    return { position: "fixed", left, top, width: TOOLTIP_W };
  }
  if (side === "left") {
    const left = Math.max(16, rect.left - TOOLTIP_W - 12);
    const top = Math.max(16, Math.min(rect.top + rect.height / 2 - 80, vh - 220));
    return { position: "fixed", left, top, width: TOOLTIP_W };
  }
  if (side === "bottom") {
    const left = Math.max(16, Math.min(rect.left + rect.width / 2 - TOOLTIP_W / 2, vw - TOOLTIP_W - 16));
    const top = rect.top + rect.height + PAD + 12;
    return { position: "fixed", left, top, width: TOOLTIP_W };
  }
  // top
  const left = Math.max(16, Math.min(rect.left + rect.width / 2 - TOOLTIP_W / 2, vw - TOOLTIP_W - 16));
  const top = Math.max(16, rect.top - PAD - 180);
  return { position: "fixed", left, top, width: TOOLTIP_W };
}

function spotlightStyle(rect: Rect | null): React.CSSProperties {
  if (!rect) return { display: "none" };
  return {
    position: "fixed",
    top: rect.top - PAD,
    left: rect.left - PAD,
    width: rect.width + PAD * 2,
    height: rect.height + PAD * 2,
    borderRadius: 10,
    boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
    border: "2px solid rgba(99,179,237,0.5)",
    pointerEvents: "none",
    transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)",
    zIndex: 9998,
  };
}

interface TourGuideProps {
  onClose: () => void;
}

function TourGuideInner({ onClose }: TourGuideProps) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const current = STEPS[step];

  const updateRect = useCallback(() => {
    if (current.target) {
      setRect(getRect(current.target));
    } else {
      setRect(null);
    }
  }, [current.target]);

  useEffect(() => {
    updateRect();
    window.addEventListener("resize", updateRect);
    return () => window.removeEventListener("resize", updateRect);
  }, [updateRect]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && step < STEPS.length - 1) setStep(s => s + 1);
      if (e.key === "ArrowLeft" && step > 0) setStep(s => s - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onClose]);

  const isLast = step === STEPS.length - 1;

  return (
    <>
      {/* Backdrop — clickable only on welcome (no spotlight) */}
      <div
        className="fixed inset-0 z-[9997]"
        style={{ background: rect ? "transparent" : "rgba(0,0,0,0.72)" }}
        onClick={rect ? undefined : onClose}
      />

      {/* Spotlight cutout */}
      {rect && <div style={spotlightStyle(rect)} />}

      {/* Tooltip card */}
      <div
        className="z-[9999] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        style={tooltipStyle(rect, current.side)}
      >
        {/* Progress dots */}
        <div className="flex items-center gap-1.5 px-4 pt-3">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`rounded-full transition-all duration-200 ${i === step ? "w-5 h-1.5 bg-blue-400" : "w-1.5 h-1.5 bg-slate-700 hover:bg-slate-500"}`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
          <span className="ml-auto text-[11px] font-mono text-slate-500">
            {step + 1} / {STEPS.length}
          </span>
        </div>

        {/* Content */}
        <div className="px-4 py-3">
          <div className="text-[14px] font-semibold text-slate-100 leading-snug mb-1.5">
            {current.title}
          </div>
          <p className="text-[13px] text-slate-400 leading-relaxed">
            {current.body}
          </p>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2 px-4 pb-3">
          <button
            onClick={onClose}
            className="text-[12px] text-slate-500 hover:text-slate-300 transition-colors mr-auto"
          >
            Skip tour
          </button>
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="px-3 py-1.5 rounded-md text-[12px] text-slate-300 hover:bg-slate-800 border border-slate-700 transition-colors"
            >
              ← Back
            </button>
          )}
          <button
            onClick={() => isLast ? onClose() : setStep(s => s + 1)}
            className="px-4 py-1.5 rounded-md text-[12px] font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            {isLast ? "Done ✓" : "Next →"}
          </button>
        </div>
      </div>
    </>
  );
}

export function TourGuide({ onClose }: TourGuideProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<TourGuideInner onClose={onClose} />, document.body);
}

export function useTour() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    if (!localStorage.getItem(TOUR_KEY)) {
      setOpen(true);
      localStorage.setItem(TOUR_KEY, "1");
    }
  }, []);

  return { open, start: () => setOpen(true), close: () => setOpen(false) };
}
