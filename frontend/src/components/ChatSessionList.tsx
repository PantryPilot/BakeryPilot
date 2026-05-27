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
    <div className="flex flex-col h-full bg-[#080b12] border-r border-slate-800/70 w-[200px] shrink-0">
      <div className="px-3 py-2.5 border-b border-slate-800 shrink-0">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-blue-500/90 hover:bg-blue-400 text-white text-[12px] font-medium transition"
        >
          <Icon name="spark" size={12} />
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {sessions.length === 0 && (
          <div className="px-3 py-4 text-[11px] text-slate-500 text-center">
            No previous chats yet
          </div>
        )}
        {sessions.map((s) => {
          const active = s.id === activeSessionId;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`group w-full text-left px-3 py-2 border-b border-slate-800/60 transition relative ${
                active ? "bg-slate-800/60" : "hover:bg-slate-800/30"
              }`}
            >
              <div className="text-[12px] text-slate-200 leading-snug line-clamp-2 pr-5">
                {s.title}
              </div>
              <div className="text-[10px] font-mono text-slate-500 mt-1">
                {formatRelativeTime(s.updatedAt)}
              </div>
              <button
                onClick={(e) => handleDelete(e, s.id)}
                className="absolute top-1.5 right-1.5 p-0.5 rounded text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
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
