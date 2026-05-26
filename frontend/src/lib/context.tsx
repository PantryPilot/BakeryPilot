"use client";
import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from "react";
import { FacilityId } from "./data";
import { BACKEND_URL } from "./api";

export interface AppNotification {
  ref_id: string;
  kind: string;
  severity: "critical" | "warning";
  title: string;
  body: string;
  action: string;
  read: boolean;
}

interface AppState {
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
  markNotificationsRead: () => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [facility, setFacility] = useState<FacilityId>("all");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const esRef = useRef<EventSource | null>(null);

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
      facility, setFacility,
      chatOpen, setChatOpen,
      chatContext, setChatContext,
      sidebarCollapsed, setSidebarCollapsed,
      mobileSidebarOpen, setMobileSidebarOpen,
      openChatContext,
      notifications, unreadCount, dismissNotification, markNotificationsRead,
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
