"use client";
import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

const TOUR_KEY = "bp-tour-v1";
const DEMO_VIDEO_URL = "https://youtu.be/xRnEM6mPpQk";

interface Step {
  id: string;
  title: string;
  body: string;
  target?: string;
  side?: "right" | "bottom" | "left" | "top" | "center";
  videoUrl?: string;
}

const STEPS: Step[] = [
  {
    id: "welcome",
    title: "Welcome to BakeryPilot",
    body: "BakeryPilot is your AI-powered operations copilot for industrial bakery supply chains. This tour walks you through every module in a few minutes.",
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
    id: "retailers",
    title: "Retailers — Customer POs",
    body: "Enter firm purchase orders from retailers (Costco, Walmart, Loblaws, etc.). Each new PO triggers a production schedule proposal you can review and confirm on the Schedule page.",
    target: "[data-tour='nav-retailers']",
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
    id: "admin",
    title: "Admin — Data & copilot config",
    body: "Operator tooling: refresh live data sources (weather, news, commodity prices), switch the copilot LLM model, and browse or edit any database table when you need to inspect or fix seed data.",
    target: "[data-tour='nav-admin']",
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
  {
    id: "demo-video",
    title: "Want a deeper walkthrough?",
    body: "This tour covers the basics. For a full feature demo with narration, watch the video walkthrough on YouTube.",
    side: "center",
    videoUrl: DEMO_VIDEO_URL,
  },
];

const PAD = 8;
const TOOLTIP_W = 340;
const TOOLTIP_W_WIDE = 380;

interface Rect { top: number; left: number; width: number; height: number }

function getRect(selector: string): Rect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function tooltipStyle(rect: Rect | null, side: Step["side"], wide = false): React.CSSProperties {
  const width = wide ? TOOLTIP_W_WIDE : TOOLTIP_W;
  if (!rect || side === "center") {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width,
    };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (side === "right") {
    const left = Math.min(rect.left + rect.width + PAD + 12, vw - width - 16);
    const top = Math.max(16, Math.min(rect.top + rect.height / 2 - 80, vh - 220));
    return { position: "fixed", left, top, width };
  }
  if (side === "left") {
    const left = Math.max(16, rect.left - width - 12);
    const top = Math.max(16, Math.min(rect.top + rect.height / 2 - 80, vh - 220));
    return { position: "fixed", left, top, width };
  }
  if (side === "bottom") {
    const left = Math.max(16, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - 16));
    const top = rect.top + rect.height + PAD + 12;
    return { position: "fixed", left, top, width };
  }
  // top
  const left = Math.max(16, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - 16));
  const top = Math.max(16, rect.top - PAD - 180);
  return { position: "fixed", left, top, width };
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
  const isCenterOverlay = !current.target;

  return (
    <>
      {/* Backdrop: dim full screen on center steps (welcome + demo video) */}
      <div
        className="fixed inset-0 z-[9997]"
        style={{ background: isCenterOverlay ? "rgba(0,0,0,0.72)" : "transparent" }}
        onClick={isCenterOverlay ? onClose : undefined}
      />

      {/* Spotlight cutout */}
      {rect && <div style={spotlightStyle(rect)} />}

      {/* Tooltip card */}
      <div
        className="z-[9999] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        style={tooltipStyle(rect, current.side, !!current.videoUrl)}
        onClick={e => e.stopPropagation()}
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
          {current.videoUrl && (
            <a
              href={current.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-red-600/90 hover:bg-red-500 text-white text-[13px] font-medium transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/>
              </svg>
              Watch demo on YouTube
            </a>
          )}
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
