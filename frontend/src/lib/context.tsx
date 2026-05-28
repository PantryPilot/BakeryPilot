"use client";
import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from "react";
import { FacilityId } from "./data";
import {
  BACKEND_URL,
  fetchCurrentUser,
  fetchUserSettings,
  updateCurrentUser,
  updateUserSettings,
  type BackendUser,
  type BackendUserSettings,
} from "./api";
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

export interface NotificationPrefs {
  toast: boolean;
  autoDismiss: boolean;
  expiringLots: boolean;
  supplierRisk: boolean;
  yieldAnomaly: boolean;
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  toast: true,
  autoDismiss: true,
  expiringLots: true,
  supplierRisk: true,
  yieldAnomaly: false,
};

export interface AppUserInfo {
  userId: string;
  displayName: string;
  role: string;
  email: string;
  defaultFacilityId: string | null;
}

const FALLBACK_USER: AppUserInfo = {
  userId: "demo_user",
  displayName: "Alex Chen",
  role: "Ops Manager",
  email: "alex.chen@fgfbrands.com",
  defaultFacilityId: "plant-toronto",
};

const USER_CACHE_KEY = "bp:user";
const NOTIF_PREFS_CACHE_KEY = "bp:notif_prefs";

// In-memory set for this page session. Resets on hard refresh so toasts
// reappear, but won't re-fire when navigating between pages.
const seenThisSession = new Set<string>();

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
  pendingScheduleCardId: string | null;
  setPendingScheduleCardId: (id: string | null) => void;
  showScheduleProposal: boolean;
  setShowScheduleProposal: (v: boolean) => void;
  scheduleRefreshKey: number;
  bumpScheduleRefresh: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  dismissNotification: (refId: string) => void;
  hideToast: (refId: string) => void;
  markNotificationsRead: () => void;
  user: AppUserInfo;
  userStatus: "loading" | "live" | "fallback";
  updateUser: (patch: Partial<Pick<AppUserInfo, "displayName" | "role" | "defaultFacilityId">>) => Promise<void>;
  notificationPrefs: NotificationPrefs;
  updateNotificationPrefs: (patch: Partial<NotificationPrefs>) => Promise<void>;
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

function getInitialUser(): AppUserInfo {
  if (typeof window === "undefined") return FALLBACK_USER;
  try {
    const raw = window.localStorage.getItem(USER_CACHE_KEY);
    if (raw) return { ...FALLBACK_USER, ...JSON.parse(raw) } as AppUserInfo;
  } catch {}
  return FALLBACK_USER;
}

function getInitialNotificationPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return DEFAULT_NOTIFICATION_PREFS;
  try {
    const raw = window.localStorage.getItem(NOTIF_PREFS_CACHE_KEY);
    if (raw) return { ...DEFAULT_NOTIFICATION_PREFS, ...JSON.parse(raw) } as NotificationPrefs;
  } catch {}
  return DEFAULT_NOTIFICATION_PREFS;
}

function settingsToPrefs(s: BackendUserSettings): NotificationPrefs {
  return {
    toast: s.notif_toast,
    autoDismiss: s.notif_auto_dismiss,
    expiringLots: s.notif_expiring_lots,
    supplierRisk: s.notif_supplier_risk,
    yieldAnomaly: s.notif_yield_anomaly,
  };
}

function userToInfo(u: BackendUser): AppUserInfo {
  return {
    userId: u.user_id,
    displayName: u.display_name,
    role: u.role,
    email: u.email,
    defaultFacilityId: u.default_facility_id,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(getInitialTheme);
  const [accent, setAccentState] = useState<AccentColor>(getInitialAccent);
  const [facility, setFacility] = useState<FacilityId>("all");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState<string | null>(null);
  const [pendingScheduleCardId, setPendingScheduleCardId] = useState<string | null>(null);
  const [showScheduleProposal, setShowScheduleProposal] = useState(false);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);
  const bumpScheduleRefresh = useCallback(() => {
    setScheduleRefreshKey((k) => k + 1);
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [user, setUser] = useState<AppUserInfo>(getInitialUser);
  const [userStatus, setUserStatus] = useState<"loading" | "live" | "fallback">("loading");
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(getInitialNotificationPrefs);
  const settingsLoadedFromBackend = useRef(false);
  const esRef = useRef<EventSource | null>(null);

  // Local setters keep optimistic UX; an effect below persists to backend.
  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    if (settingsLoadedFromBackend.current) {
      void updateUserSettings({ theme: next });
    }
  }, []);

  const setAccent = useCallback((next: AccentColor) => {
    setAccentState(next);
    if (settingsLoadedFromBackend.current) {
      void updateUserSettings({ accent: next });
    }
  }, []);

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

  // Cache user + notification prefs to localStorage for fast bootstrap.
  useEffect(() => {
    try { window.localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user)); } catch {}
  }, [user]);
  useEffect(() => {
    try { window.localStorage.setItem(NOTIF_PREFS_CACHE_KEY, JSON.stringify(notificationPrefs)); } catch {}
  }, [notificationPrefs]);

  // Load user + settings from backend; backend is the source of truth and
  // overrides cached values if it returns something different.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [u, s] = await Promise.all([fetchCurrentUser(), fetchUserSettings()]);
      if (!alive) return;
      if (u) {
        setUser(userToInfo(u));
        setUserStatus("live");
      } else {
        setUserStatus("fallback");
      }
      if (s) {
        if (isThemeMode(s.theme)) setThemeState(s.theme);
        if (isAccentColor(s.accent)) setAccentState(s.accent);
        setNotificationPrefs(settingsToPrefs(s));
        settingsLoadedFromBackend.current = true;
      }
    })();
    return () => { alive = false; };
  }, []);

  const updateUser = useCallback(
    async (patch: Partial<Pick<AppUserInfo, "displayName" | "role" | "defaultFacilityId">>) => {
      const optimistic = { ...user, ...patch };
      setUser(optimistic);
      const res = await updateCurrentUser({
        display_name: patch.displayName,
        role: patch.role,
        default_facility_id: patch.defaultFacilityId ?? undefined,
      });
      if (res) setUser(userToInfo(res));
    },
    [user],
  );

  const updateNotificationPrefs = useCallback(
    async (patch: Partial<NotificationPrefs>) => {
      const next = { ...notificationPrefs, ...patch };
      setNotificationPrefs(next);
      await updateUserSettings({
        notif_toast: next.toast,
        notif_auto_dismiss: next.autoDismiss,
        notif_expiring_lots: next.expiringLots,
        notif_supplier_risk: next.supplierRisk,
        notif_yield_anomaly: next.yieldAnomaly,
      });
    },
    [notificationPrefs],
  );

  useEffect(() => {
    if (esRef.current) return;
    const es = new EventSource(`${BACKEND_URL}/api/alerts`);
    esRef.current = es;

    es.addEventListener("alert", (e: MessageEvent) => {
      try {
        const alert = JSON.parse(e.data as string);
        const alreadySeen = seenThisSession.has(alert.ref_id as string);
        setNotifications(prev => {
          if (prev.some(n => n.ref_id === alert.ref_id)) return prev;
          return [...prev, { ...alert, read: false, toastHidden: alreadySeen }];
        });
        seenThisSession.add(alert.ref_id as string);
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
      pendingScheduleCardId,
      setPendingScheduleCardId,
      showScheduleProposal,
      setShowScheduleProposal,
      scheduleRefreshKey,
      bumpScheduleRefresh,
      notifications, unreadCount, dismissNotification, hideToast, markNotificationsRead,
      user, userStatus, updateUser,
      notificationPrefs, updateNotificationPrefs,
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
