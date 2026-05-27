"use client";

import type { ActionCardData } from "../components/atoms";

export interface ChatSessionMessage {
  role: "user" | "assistant";
  agent?: string;
  text: string;
  time: string;
  tools?: string[];
  card?: ActionCardData | null;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatSessionMessage[];
  createdAt: number;
  updatedAt: number;
}

const SESSIONS_KEY = "bp-copilot-sessions-v1";
const CURRENT_SESSION_KEY = "bp-copilot-current-session-v1";
const MAX_SESSIONS = 30;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeRead<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded — silently drop */
  }
}

function newId(): string {
  if (isBrowser() && typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function stripTransientFlags(m: ChatSessionMessage): ChatSessionMessage {
  return {
    role: m.role,
    agent: m.agent,
    text: m.text,
    time: m.time,
    tools: m.tools,
    card: m.card ?? null,
  };
}

export function deriveSessionTitle(messages: ChatSessionMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user" && m.text.trim());
  if (!firstUser) return "New chat";
  const t = firstUser.text.trim().replace(/\s+/g, " ");
  return t.length > 48 ? t.slice(0, 48) + "…" : t;
}

export function listSessions(): ChatSession[] {
  const sessions = safeRead<ChatSession[]>(SESSIONS_KEY, []);
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadSession(id: string): ChatSession | null {
  return listSessions().find((s) => s.id === id) ?? null;
}

export function saveSession(session: ChatSession): void {
  const sessions = listSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  const cleaned: ChatSession = {
    ...session,
    title: session.messages.some((m) => m.role === "user")
      ? deriveSessionTitle(session.messages)
      : session.title || "New chat",
    messages: session.messages.map(stripTransientFlags),
    updatedAt: Date.now(),
  };
  if (idx >= 0) {
    sessions[idx] = cleaned;
  } else {
    sessions.unshift(cleaned);
  }
  const capped = sessions
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS);
  safeWrite(SESSIONS_KEY, capped);
}

export function createSession(initialMessage?: ChatSessionMessage): ChatSession {
  const now = Date.now();
  const session: ChatSession = {
    id: newId(),
    title: "New chat",
    messages: initialMessage ? [initialMessage] : [],
    createdAt: now,
    updatedAt: now,
  };
  saveSession(session);
  setCurrentSessionId(session.id);
  return session;
}

export function deleteSession(id: string): void {
  const sessions = listSessions().filter((s) => s.id !== id);
  safeWrite(SESSIONS_KEY, sessions);
  if (getCurrentSessionId() === id) {
    setCurrentSessionId(sessions[0]?.id ?? null);
  }
}

export function getCurrentSessionId(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(CURRENT_SESSION_KEY);
}

export function setCurrentSessionId(id: string | null): void {
  if (!isBrowser()) return;
  if (id) {
    window.localStorage.setItem(CURRENT_SESSION_KEY, id);
  } else {
    window.localStorage.removeItem(CURRENT_SESSION_KEY);
  }
}

export function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
