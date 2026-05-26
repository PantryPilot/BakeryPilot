"use client";
import { createContext, useContext, useState, ReactNode } from "react";
import { FacilityId } from "./data";

interface AppState {
  facility: FacilityId;
  setFacility: (f: FacilityId) => void;
  chatOpen: boolean;
  setChatOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  chatContext: string | null;
  setChatContext: (v: string | null) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  openChatContext: (ctx: string) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [facility, setFacility] = useState<FacilityId>("all");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const openChatContext = (ctx: string) => {
    setChatContext(ctx);
    setChatOpen(true);
  };

  return (
    <AppContext.Provider value={{ facility, setFacility, chatOpen, setChatOpen, chatContext, setChatContext, sidebarCollapsed, setSidebarCollapsed, openChatContext }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}
