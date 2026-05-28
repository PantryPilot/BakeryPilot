"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "./Icon";
import { TourGuide, useTour } from "./TourGuide";
import { FACILITIES } from "../lib/data";
import { useApp } from "../lib/context";
import { useEsgCounter } from "../lib/hooks";

import type { TranslationKey } from "../lib/i18n";

const NAV: Array<{ id: string; route: string; labelKey: TranslationKey; icon: string; tour: string }> = [
  { id: "home",       route: "/",                        labelKey: "sidebar.home",       icon: "home",     tour: ""                  },
  { id: "facilities", route: "/facilities",              labelKey: "sidebar.flowsight",  icon: "grid",     tour: "nav-flowsight"     },
  { id: "materials",  route: "/materials",               labelKey: "sidebar.inventory",  icon: "box",      tour: "nav-inventory"     },
  { id: "production", route: "/production",              labelKey: "sidebar.production", icon: "factory",  tour: "nav-production"    },
  { id: "retailers",  route: "/retailers",                labelKey: "sidebar.retailers",  icon: "bars",     tour: "nav-retailers"     },
  { id: "suppliers",  route: "/scorecard?tab=suppliers", labelKey: "sidebar.suppliers",  icon: "truck",    tour: "nav-suppliers"     },
  { id: "schedule",   route: "/schedule",                labelKey: "sidebar.schedule",   icon: "calendar", tour: "nav-schedule"      },
  { id: "settings",  route: "/settings",                 labelKey: "sidebar.settings",   icon: "settings", tour: ""                  },
  { id: "admin",      route: "/admin",                   labelKey: "sidebar.admin",      icon: "database", tour: ""                  },
];

// ─── Sidebar ──────────────────────────────────────────────────────────────────

type SidebarContentProps = {
  mobile: boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  setMobileSidebarOpen: (v: boolean) => void;
  pathname: string;
  searchParams: ReturnType<typeof useSearchParams>;
  t: (key: import("../lib/i18n").TranslationKey) => string;
};

function SidebarContent({
  mobile,
  sidebarCollapsed,
  setSidebarCollapsed,
  setMobileSidebarOpen,
  pathname,
  searchParams,
  t,
}: SidebarContentProps) {
  return (
    <aside data-tour="sidebar" className={`
      flex flex-col bg-[#0a0d14] border-r border-slate-800/80 h-full
      ${mobile
        ? "w-[240px]"
        : `shrink-0 transition-all duration-200 ${sidebarCollapsed ? "w-[64px]" : "w-[208px]"}`
      }
    `}>
      <div className="h-14 flex items-center px-4 gap-2.5 border-b border-slate-800/80 shrink-0">
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
            <path d="M4 14c0-5 4-9 8-9s8 4 8 9c0 3-3 5-8 5s-8-2-8-5z"/>
            <path d="M9 11v-1M15 11v-1M12 11v-2"/>
          </svg>
        </div>
        <div className={`flex-1 min-w-0 overflow-hidden transition-all duration-200 ${(!mobile && sidebarCollapsed) ? "w-0 opacity-0" : "opacity-100"}`}>
          <div className="text-[14px] font-semibold text-slate-100 leading-none whitespace-nowrap">BakeryPilot</div>
          <div className="text-[10px] text-slate-500 mt-0.5 tracking-wider uppercase whitespace-nowrap">{t("sidebar.brand_tagline")}</div>
        </div>
      </div>

      <nav className="flex-1 py-3">
        {NAV.map(item => {
          const [basePath, query] = item.route.split("?");
          let active = false;
          if (pathname === basePath) {
            if (query) {
              const params = new URLSearchParams(query);
              active = [...params.entries()].every(([k, v]) => searchParams.get(k) === v);
            } else if (basePath === "/scorecard") {
              active = searchParams.get("tab") !== "suppliers";
            } else {
              active = true;
            }
          }
          return (
            <Link
              key={item.id}
              href={item.route}
              onClick={() => mobile && setMobileSidebarOpen(false)}
              {...(item.tour ? { "data-tour": item.tour } : {})}
              className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 relative ${active ? "text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-[2px] rounded-r-sm bg-blue-500 transition-all duration-200 ${active ? "opacity-100" : "opacity-0"}`}/>
              <Icon
                name={item.icon}
                size={18}
                className={`transition-colors duration-150 shrink-0 ${active ? "text-blue-400" : ""}`}
              />
              <span className={`
                text-[13px] font-medium whitespace-nowrap overflow-hidden transition-all duration-200
                ${(!mobile && sidebarCollapsed) ? "opacity-0 w-0 translate-x-2" : "opacity-100 translate-x-0"}
              `}>
                {t(item.labelKey)}
              </span>
            </Link>
          );
        })}
      </nav>

      <button
        onClick={() => {
          if (mobile) setMobileSidebarOpen(false);
          else setSidebarCollapsed(!sidebarCollapsed);
        }}
        className="border-t border-slate-800/80 py-3 text-slate-500 hover:text-slate-300 text-[11px] font-mono transition-colors duration-150 shrink-0 flex items-center justify-center gap-1.5"
      >
        {mobile ? (
          <>✕ {t("btn.close")}</>
        ) : (
          <>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round"
              className={`transition-transform duration-300 ${sidebarCollapsed ? "rotate-0" : "rotate-180"}`}
            >
              <path d="M9 18l6-6-6-6"/>
            </svg>
            <span className={`overflow-hidden transition-all duration-200 ${sidebarCollapsed ? "w-0 opacity-0" : "opacity-100"}`}>
              {t("sidebar.collapse")}
            </span>
          </>
        )}
      </button>
    </aside>
  );
}

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen, t } = useApp();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-full">
        <SidebarContent
          mobile={false}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          setMobileSidebarOpen={setMobileSidebarOpen}
          pathname={pathname}
          searchParams={searchParams}
          t={t}
        />
      </div>

      {/* Mobile overlay drawer */}
      {mobileSidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed top-0 left-0 bottom-0 z-50 md:hidden shadow-2xl">
            <SidebarContent
              mobile={true}
              sidebarCollapsed={sidebarCollapsed}
              setSidebarCollapsed={setSidebarCollapsed}
              setMobileSidebarOpen={setMobileSidebarOpen}
              pathname={pathname}
              searchParams={searchParams}
              t={t}
            />
          </div>
        </>
      )}
    </>
  );
}

// ─── Notification Panel ───────────────────────────────────────────────────────

const KIND_ICON: Record<string, string> = {
  expiring_lot: "box",
  supplier_risk: "truck",
  yield_spike: "zap",
};

function NotificationPanel({ onClose, excludeRef }: { onClose: () => void; excludeRef: React.RefObject<HTMLElement | null> }) {
  const { notifications, dismissNotification, openChatContext, t } = useApp();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (excludeRef.current?.contains(e.target as Node)) return;
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, excludeRef]);

  const handleAskCopilot = (refId: string, action: string) => {
    dismissNotification(refId);
    openChatContext(action);
    onClose();
  };

  return (
    <div
      ref={panelRef}
      className="absolute top-full right-0 mt-1 w-[360px] rounded-lg border border-slate-700 bg-slate-900 shadow-2xl z-50 overflow-hidden"
      style={{ maxHeight: "min(480px, calc(100vh - 80px))" }}
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800">
        <span className="text-[12px] font-semibold text-slate-200 uppercase tracking-wider">{t("topbar.notifications")}</span>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-0.5">
          <Icon name="x" size={14}/>
        </button>
      </div>

      {notifications.length === 0 && (
        <div className="px-4 py-8 text-[13px] text-slate-500 text-center">{t("topbar.notifications_empty")}</div>
      )}

      <div className="overflow-y-auto" style={{ maxHeight: "400px" }}>
        {notifications.map(n => (
          <div
            key={n.ref_id}
            className={`flex gap-3 px-4 py-3 border-b border-slate-800/60 last:border-b-0 ${!n.read ? "bg-slate-800/30" : ""}`}
          >
            <span className={`mt-0.5 shrink-0 ${n.severity === "critical" ? "text-red-400" : "text-amber-400"}`}>
              <Icon name={KIND_ICON[n.kind] ?? "zap"} size={14}/>
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold text-slate-100 leading-tight">{n.title}</div>
              <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{n.body}</div>
              <button
                onClick={() => handleAskCopilot(n.ref_id, n.action)}
                className="mt-1.5 text-[10px] font-medium text-blue-400 hover:text-blue-300 underline underline-offset-2"
              >
                Ask Copilot →
              </button>
            </div>
            <button
              onClick={() => dismissNotification(n.ref_id)}
              className="shrink-0 text-slate-600 hover:text-slate-400 mt-0.5"
            >
              <Icon name="x" size={12}/>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── User Menu ────────────────────────────────────────────────────────────────

function UserMenu({ onClose }: { onClose: () => void }) {
  const { facility, user } = useApp();
  const menuRef = useRef<HTMLDivElement>(null);
  const facilityLabel = FACILITIES.find(f => f.id === facility)?.name ?? "All Plants";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="absolute top-full right-0 mt-1 w-[220px] rounded-lg border border-slate-700 bg-slate-900 shadow-2xl z-50 overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-slate-800">
        <div className="text-[13px] font-semibold text-slate-100">{user.displayName}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">{user.role}</div>
        <div className="text-[10px] text-slate-500 font-mono mt-1 flex items-center gap-1">
          <Icon name="grid" size={10} className="text-slate-500"/>
          {facilityLabel}
        </div>
      </div>
      <div className="py-1">
        <Link
          href="/settings"
          className="w-full text-left px-4 py-2 text-[13px] text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors flex items-center gap-2"
          onClick={onClose}
        >
          <Icon name="settings" size={14} className="text-slate-500"/>
          Settings
        </Link>
        <button
          className="w-full text-left px-4 py-2 text-[13px] text-red-400 hover:bg-slate-800 hover:text-red-300 transition-colors flex items-center gap-2"
          onClick={onClose}
        >
          <Icon name="x" size={14} className="text-slate-500"/>
          Sign out
        </button>
      </div>
    </div>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

function userInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(p => p[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "?";
}

export function TopBar() {
  const { facility, setFacility, unreadCount, markNotificationsRead, mobileSidebarOpen, setMobileSidebarOpen, user, theme, setTheme, notifications, hideToast, language, setLanguage, t } = useApp();
  const [facilityOpen, setFacilityOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const facilityRef = useRef<HTMLDivElement>(null);
  const notifBellRef = useRef<HTMLButtonElement>(null);
  const { open: tourOpen, start: startTour, close: closeTour } = useTour();

  // Close facility dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (facilityRef.current && !facilityRef.current.contains(e.target as Node)) {
        setFacilityOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNotifToggle = () => {
    if (!notifOpen) {
      markNotificationsRead();
      notifications.forEach(n => { if (!n.toastHidden) hideToast(n.ref_id); });
    }
    setNotifOpen(o => !o);
    setUserOpen(false);
  };

  const handleUserToggle = () => {
    setUserOpen(o => !o);
    setNotifOpen(false);
  };

  return (
    <>
      <header className="h-14 shrink-0 border-b border-slate-800/80 bg-[#0a0d14]/80 backdrop-blur flex items-center px-4 gap-3 z-30">
        {/* Hamburger — mobile only */}
        <button
          className="md:hidden p-1.5 rounded-md hover:bg-slate-800/60 text-slate-300"
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          aria-label="Open navigation"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="2" y1="5" x2="16" y2="5"/>
            <line x1="2" y1="9" x2="16" y2="9"/>
            <line x1="2" y1="13" x2="16" y2="13"/>
          </svg>
        </button>

        {/* Facility selector */}
        <div className="relative" ref={facilityRef} data-tour="facility-selector">
          <button
            onClick={() => setFacilityOpen(o => !o)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-800 hover:border-slate-600 transition"
          >
            <Icon name="grid" size={14} className="text-slate-400"/>
            <span className="text-[13px] text-slate-200 hidden sm:inline">
              {FACILITIES.find(f => f.id === facility)?.name}
            </span>
            {FACILITIES.find(f => f.id === facility)?.city && (
              <span className="text-[11px] text-slate-500 font-mono hidden lg:inline">
                {FACILITIES.find(f => f.id === facility)?.city}
              </span>
            )}
            <Icon name="chevron" size={14} className="text-slate-500"/>
          </button>
          {facilityOpen && (
            <div className="absolute top-full mt-1 left-0 min-w-[220px] rounded-md border border-slate-800 bg-slate-900 shadow-xl z-40 overflow-hidden">
              {FACILITIES.map(f => (
                <button key={f.id} onClick={() => { setFacility(f.id); setFacilityOpen(false); }}
                  className={`w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2 text-[13px] ${facility === f.id ? "text-blue-300 bg-slate-800/50" : "text-slate-200"}`}>
                  <span className="flex-1">{f.name}</span>
                  {f.city && <span className="text-[11px] text-slate-500 font-mono">{f.city}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1"/>


        {/* Language toggle (EN ⇄ FR) */}
        <button
          onClick={() => setLanguage(language === "en" ? "fr" : "en")}
          className="px-2 py-1 rounded-md border border-slate-700 hover:border-slate-500 text-[11px] font-mono uppercase tracking-wider text-slate-300 hover:text-slate-100 transition-colors"
          aria-label={t("topbar.language")}
          title={t("topbar.language")}
        >
          {language === "en" ? "EN" : "FR"}
        </button>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-800/60 text-slate-300 transition-colors"
          aria-label={theme === "dark" ? t("topbar.toggle_theme_to_light") : t("topbar.toggle_theme_to_dark")}
          title={theme === "dark" ? t("topbar.toggle_theme_to_light") : t("topbar.toggle_theme_to_dark")}
          suppressHydrationWarning
        >
          <span key={theme} className="theme-toggle-icon" suppressHydrationWarning>
            {theme === "dark" ? <Icon name="moon" size={18}/> : <Icon name="sun" size={18}/>}
          </span>
        </button>

        {/* Tour button */}
        <button
          onClick={startTour}
          className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 transition-colors"
          aria-label={t("topbar.start_tour")}
          title={t("topbar.start_tour")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 8v1M12 11v5"/>
          </svg>
        </button>

        {/* Notification bell */}
        <div className="relative" data-tour="notifications">
          <button
            ref={notifBellRef}
            onClick={handleNotifToggle}
            className="relative w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-800/60 text-slate-300 transition-colors"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
            title={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
          >
            <Icon name="bell" size={18}/>
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] rounded-full bg-amber-400 flex items-center justify-center text-[9px] font-bold text-amber-950 px-0.5">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} excludeRef={notifBellRef}/>}
        </div>

        {/* User avatar */}
        <div className="relative">
          <button
            onClick={handleUserToggle}
            className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-[11px] font-semibold text-white hover:opacity-90 transition-opacity"
            aria-label="User menu"
            aria-expanded={userOpen}
          >
            {userInitials(user.displayName)}
          </button>
          {userOpen && <UserMenu onClose={() => setUserOpen(false)}/>}
        </div>
      </header>

      {tourOpen && <TourGuide onClose={closeTour}/>}
    </>
  );
}

// ─── BottomStrip ──────────────────────────────────────────────────────────────

export function BottomStrip() {
  const { data: esg, status: esgStatus } = useEsgCounter();
  const { t } = useApp();
  const colorMap: Record<string, string> = {
    green: "text-emerald-300",
    red:   "text-red-300",
    amber: "text-amber-300",
    slate: "text-slate-300",
  };

  const wasteValue = esgStatus === "live" && esg.wasteAvoided !== undefined ? `$${esg.wasteAvoided.toLocaleString()}` : "--";
  const co2Value   = esgStatus === "live" && esg.co2eSaved    !== undefined ? `${esg.co2eSaved.toFixed(1)} t`         : "--";
  const disruptionsValue = esgStatus === "live" && esg.disruptionsCaught !== undefined ? String(esg.disruptionsCaught) : "--";
  const moqTaxValue = esgStatus === "live" && esg.moqTaxYtd !== undefined ? `$${esg.moqTaxYtd.toLocaleString()}` : "--";

  const stats = [
    { label: t("bottom.waste_avoided"),      value: wasteValue, tone: "green", icon: "leaf", priority: true  },
    { label: t("bottom.co2e_saved"),         value: co2Value,   tone: "green", icon: "drop", priority: false },
    { label: t("bottom.active_disruptions"), value: disruptionsValue, tone: "slate", icon: "warn", priority: true  },
    { label: t("bottom.moq_tax_ytd"),        value: moqTaxValue,      tone: "amber", icon: "diff", priority: false },
  ];

  return (
    <div className="h-12 shrink-0 border-t border-slate-800/80 bg-[#0a0d14]/95 flex items-stretch overflow-x-auto">
      {/* On mobile: only show priority stats inline; on larger screens show all */}
      {stats.map((s, i) => (
        <div
          key={i}
          className={`flex-1 min-w-0 flex items-center justify-center gap-2 border-r border-slate-800/40 last:border-r-0 px-2
            ${s.priority ? "flex" : "hidden sm:flex"}`}
        >
          <Icon name={s.icon} size={14} className={`${colorMap[s.tone]} opacity-80 shrink-0`}/>
          <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500 truncate hidden md:inline">{s.label}</span>
          <span className={`text-[13px] font-mono tabular-nums font-semibold ${colorMap[s.tone]} whitespace-nowrap`}>{s.value}</span>
          {s.tone === "red" && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0"/>}
        </div>
      ))}
    </div>
  );
}
