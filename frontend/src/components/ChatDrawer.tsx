"use client";
import { useState, useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { ToolBreadcrumbs, ActionCard, StreamingText } from "./atoms";
import { pickAgent, pickTools, pickCard } from "./ChatBrain";
import { streamChat } from "../lib/api";
import { ActionCardData } from "./atoms";

interface Message {
  role: "user" | "assistant";
  agent?: string;
  text: string;
  time: string;
  tools?: string[];
  card?: ActionCardData | null;
  thinking?: boolean;
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function CopilotButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-16 right-5 z-50 w-12 h-12 rounded-full bg-blue-500 hover:bg-blue-400 text-white shadow-[0_8px_24px_-4px_rgba(59,130,246,0.6)] flex items-center justify-center transition-all"
        title="Copilot"
      >
        {open
          ? <Icon name="x" size={18} />
          : <Icon name="chat" size={18} />}
      </button>

      {open && <CopilotPopup onClose={() => setOpen(false)} />}
    </>
  );
}

function CopilotPopup({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      agent: "OrchestratorAgent",
      text: "Hi. I have full read across plants, suppliers, and orders. What would you like to know?",
      time: nowTime(),
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isThinking]);

  const send = async () => {
    if (!input.trim() || isThinking) return;
    const u = input.trim();
    const agent = pickAgent(u);
    const tools = pickTools(u);

    setMessages(m => [
      ...m,
      { role: "user", text: u, time: nowTime() },
      { role: "assistant", agent, text: "", time: nowTime(), tools, thinking: true },
    ]);
    setInput("");
    setIsThinking(true);

    let accumulated = "";

    await streamChat(u, [], {
      onMessage: (chunk) => {
        accumulated += chunk;
        setMessages(m => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, text: accumulated, thinking: false };
          }
          return next;
        });
      },
      onActionCard: () => {
        const card = pickCard(u);
        if (!card) return;
        setMessages(m => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, card };
          }
          return next;
        });
      },
      onDone: () => {
        setIsThinking(false);
        setMessages(m => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && !last.text) {
            next[next.length - 1] = { ...last, text: "No response received.", thinking: false };
          }
          return next;
        });
      },
      onError: () => {
        setIsThinking(false);
        setMessages(m => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, text: "Agent unreachable — is the backend running?", thinking: false };
          }
          return next;
        });
      },
    });
  };

  return (
    <div className="fixed bottom-32 right-5 z-50 w-[380px] h-[520px] rounded-2xl border border-slate-700 bg-[#0c111c] shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-blue-500/20 text-blue-300 flex items-center justify-center">
            <Icon name="zap" size={12} />
          </span>
          <span className="text-[13px] font-semibold text-slate-100">Copilot</span>
        </div>
        <div className="flex items-center gap-2">
          {isThinking && (
            <span className="inline-flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          )}
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400">
            <Icon name="x" size={15} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
        {messages.map((m, i) => (
          <PopupMessage key={i} m={m} />
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 p-3 shrink-0">
        <div className="flex items-end gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 focus-within:border-blue-500/60 transition">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Ask anything…"
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-[13px] text-slate-100 placeholder:text-slate-500 max-h-24"
            style={{ minHeight: 22 }}
          />
          <button
            onClick={send}
            disabled={isThinking}
            className="p-1.5 rounded bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white transition"
          >
            <Icon name="send" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function PopupMessage({ m }: { m: Message }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md bg-slate-800 text-slate-100 text-[13px] leading-relaxed">
          {m.text}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
        <span className="w-4 h-4 rounded bg-blue-500/20 text-blue-300 flex items-center justify-center">
          <Icon name="zap" size={9} />
        </span>
        <span>{m.agent || "Copilot"}</span>
        <span className="text-slate-700">·</span>
        <span className="font-mono">{m.time}</span>
      </div>
      {m.tools && <div className="pl-6"><ToolBreadcrumbs tools={m.tools} /></div>}
      <div className="pl-6">
        {m.thinking ? (
          <span className="inline-flex gap-1 items-center text-slate-500 text-[12px]">
            <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        ) : (
          <StreamingText text={m.text} />
        )}
      </div>
      {m.card && <div className="pl-6 pt-1"><ActionCard card={m.card} /></div>}
    </div>
  );
}

// Keep ChatBox export for the /chat page
interface ChatBoxProps {
  value: string;
  setValue: (v: string) => void;
  onSend: () => void;
  compact?: boolean;
  suggested?: boolean;
  onVoice?: () => void;
}

export function ChatBox({ value, setValue, onSend, compact, suggested, onVoice }: ChatBoxProps) {
  const handleSend = () => onSend();
  return (
    <div className="border-t border-slate-800 p-3 shrink-0">
      <div className="flex items-end gap-2 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 focus-within:border-blue-500/60 transition">
        <textarea
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder="Ask anything…"
          rows={1}
          className="flex-1 bg-transparent resize-none outline-none text-[13px] text-slate-100 placeholder:text-slate-500 max-h-32"
          style={{ minHeight: 24 }}
        />
        {onVoice && (
          <button onClick={onVoice} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200">
            <Icon name="mic" size={16} />
          </button>
        )}
        <button onClick={handleSend} className="p-1.5 rounded bg-blue-500 hover:bg-blue-400 text-white">
          <Icon name="send" size={14} />
        </button>
      </div>
    </div>
  );
}
