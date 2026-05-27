"use client";
import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from "react";
import { FacilityId } from "./data";
import { BACKEND_URL } from "./api";
import {
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  type AccentColor,
  type ThemeMode,
  isAccentColor,
  isThemeMode,
} from "./theme";

export interface AppNotification {
  ref_id: string;
  kind: string;
  severity: "critical" | "warning";
  title: string;
  body: string;
  action: string;
  read: boolean;
  toastHidden?: boolean; // auto-hidden from banner but still visible in bell panel
}

interface AppState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  accent: AccentColor;
  setAccent: (accent: AccentColor) => void;
  facility: FacilityId;
  setFacility: (f: FacilityId) => void;
  chatOpen: boolean;
  setChatOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  chatContext: string | null;
  setChatContext: (v: string | null) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (v: boolean) => void;
  openChatContext: (ctx: string) => void;
  notifications: AppNotification[];
  unreadCount: number;
  dismissNotification: (refId: string) => void;
  hideToast: (refId: string) => void;
  markNotificationsRead: () => void;
}

const AppContext = createContext<AppState | null>(null);

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const domTheme = document.documentElement.dataset.theme;
  if (isThemeMode(domTheme)) return domTheme;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(stored)) return stored;
  } catch {}
  return DEFAULT_THEME;
}

function getInitialAccent(): AccentColor {
  if (typeof window === "undefined") return DEFAULT_ACCENT;
  const domAccent = document.documentElement.dataset.accent;
  if (isAccentColor(domAccent)) return domAccent;
  try {
    const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    if (isAccentColor(stored)) return stored;
  } catch {}
  return DEFAULT_ACCENT;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [accent, setAccent] = useState<AccentColor>(getInitialAccent);
  const [facility, setFacility] = useState<FacilityId>("all");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.accent = accent;
    try {
      window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
    } catch {}
  }, [accent]);

  useEffect(() => {
    if (esRef.current) return;
    const es = new EventSource(`${BACKEND_URL}/api/alerts`);
    esRef.current = es;

    es.addEventListener("alert", (e: MessageEvent) => {
      try {
        const alert = JSON.parse(e.data as string);
        setNotifications(prev => {
          if (prev.some(n => n.ref_id === alert.ref_id)) return prev;
          return [...prev, { ...alert, read: false }];
        });
      } catch {}
    });

    es.onerror = () => es.close();
    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  const dismissNotification = useCallback((refId: string) => {
    setNotifications(prev => prev.filter(n => n.ref_id !== refId));
  }, []);

  const hideToast = useCallback((refId: string) => {
    setNotifications(prev => prev.map(n => n.ref_id === refId ? { ...n, toastHidden: true } : n));
  }, []);

  const markNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const openChatContext = (ctx: string) => {
    setChatContext(ctx);
    setChatOpen(true);
  };

  return (
    <AppContext.Provider value={{
      theme, setTheme,
      accent, setAccent,
      facility, setFacility,
      chatOpen, setChatOpen,
      chatContext, setChatContext,
      sidebarCollapsed, setSidebarCollapsed,
      mobileSidebarOpen, setMobileSidebarOpen,
      openChatContext,
      notifications, unreadCount, dismissNotification, hideToast, markNotificationsRead,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}
