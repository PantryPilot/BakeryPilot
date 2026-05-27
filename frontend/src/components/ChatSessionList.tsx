"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import {
  ChatSession,
  deleteSession,
  formatRelativeTime,
  listSessions,
} from "../lib/chatSessions";

interface ChatSessionListProps {
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  refreshKey: number;
}

export function ChatSessionList({
  activeSessionId,
  onSelect,
  onNew,
  refreshKey,
}: ChatSessionListProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  useEffect(() => {
    setSessions(listSessions());
  }, [refreshKey]);

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    deleteSession(id);
    setSessions(listSessions());
  }

  return (
    <div className="flex flex-col h-full bg-slate-900/50 border-r border-slate-800/60 w-[200px] shrink-0 backdrop-blur-sm">
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 font-semibold mb-2 px-0.5">
          Chats
        </div>
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-700 bg-slate-800/60 hover:bg-slate-800 hover:border-slate-600 text-slate-200 hover:text-slate-100 text-[12px] font-medium transition"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 py-1">
        {sessions.length === 0 && (
          <div className="px-3 py-6 text-[11px] text-slate-500 text-center leading-relaxed">
            No previous chats yet.<br/>Send a message to start one.
          </div>
        )}
        {sessions.map((s) => {
          const active = s.id === activeSessionId;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`group w-full text-left pl-3.5 pr-2 py-2 transition relative ${
                active
                  ? "bg-blue-500/10 text-slate-100"
                  : "hover:bg-slate-800/40 text-slate-300"
              }`}
            >
              <span
                className={`absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-sm bg-blue-400 transition-opacity ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
              <div className="text-[12px] leading-snug line-clamp-2 pr-5">
                {s.title}
              </div>
              <div className="text-[10px] font-mono text-slate-500 mt-1">
                {formatRelativeTime(s.updatedAt)}
              </div>
              <button
                onClick={(e) => handleDelete(e, s.id)}
                className="absolute top-1.5 right-1.5 p-0.5 rounded text-slate-600 hover:text-red-400 hover:bg-slate-800 opacity-0 group-hover:opacity-100 transition"
                title="Delete chat"
                aria-label="Delete chat"
              >
                <Icon name="x" size={11} />
              </button>
            </button>
          );
        })}
      </div>
    </div>
  );
}
