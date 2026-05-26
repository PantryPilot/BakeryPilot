"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Icon } from "./Icon";
import { ToolBreadcrumbs, ActionCard } from "./atoms";
import { ActionCardData } from "./atoms";
import { streamChat, fetchActionCard, adaptActionCard, BACKEND_URL } from "../lib/api";
import { useApp } from "../lib/context";

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
  const { chatOpen, setChatOpen } = useApp();

  return (
    <>
      <button
        onClick={() => setChatOpen(o => !o)}
        className="fixed bottom-16 right-5 z-50 w-12 h-12 rounded-full bg-blue-500 hover:bg-blue-400 text-white shadow-[0_8px_24px_-4px_rgba(59,130,246,0.6)] flex items-center justify-center transition-all"
        title="Copilot"
      >
        {chatOpen
          ? <Icon name="x" size={18} />
          : <Icon name="chat" size={18} />}
      </button>

      {chatOpen && <CopilotPopup onClose={() => setChatOpen(false)} />}
    </>
  );
}


function contextToMessage(ctx: string): string {
  if (ctx.startsWith("Inventory")) return "What ingredient lots are currently at risk? Show me the critical and expiring ones.";
  if (ctx.startsWith("Schedule · optimise")) return "How can I optimise the current production schedule? What changes would reduce changeover time?";
  if (ctx.startsWith("Supplier:")) return `What is the status of ${ctx.replace("Supplier: ", "")}? Show me their delivery performance and any issues.`;
  if (ctx.startsWith("Plant")) return `What is happening at ${ctx}? Give me a status summary.`;
  if (ctx.toLowerCase().includes("esg") || ctx.toLowerCase().includes("waste")) return "How much waste have we avoided this quarter? Show me the latest ESG numbers.";
  return ctx;
}

function CopilotPopup({ onClose }: { onClose: () => void }) {
  const { chatContext, setChatContext } = useApp();
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

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isThinking) return;
    const u = text.trim();
    setMessages(m => [
      ...m,
      { role: "user", text: u, time: nowTime() },
      { role: "assistant", agent: "OrchestratorAgent", text: "", time: nowTime(), thinking: false },
    ]);
    setIsThinking(true);

    await streamChat(u, [], {
      onMessage: (chunk) => {
        setMessages(m => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, text: (last.text || "") + chunk };
          }
          return next;
        });
      },
      onActionCard: async (cardId) => {
        if (!cardId) return;
        const raw = await fetchActionCard(cardId);
        if (!raw) return;
        const card = adaptActionCard(raw);
        setMessages(m => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, card };
          }
          return next;
        });
      },
      onDone: () => setIsThinking(false),
      onError: () => {
        setIsThinking(false);
        setMessages(m => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && !last.text) next.pop();
          return next;
        });
      },
    });
  }, [isThinking]);

  useEffect(() => {
    if (chatContext) {
      setChatContext(null);
      sendMessage(contextToMessage(chatContext));
    }
  }, [chatContext, setChatContext, sendMessage]);

  const send = async () => {
    if (!input.trim() || isThinking) return;
    const u = input.trim();
    setInput("");
    await sendMessage(u);
  };

  const testPing = () => {
    setMessages(m => [...m, { role: "assistant", agent: "ping", text: "", time: nowTime(), thinking: true }]);
    let text = "";
    const es = new EventSource(`${BACKEND_URL}/api/chat/ping`);

    es.addEventListener("message", (e: MessageEvent) => {
      try {
        const p = JSON.parse(e.data as string);
        if (p.content) {
          text += p.content as string;
          const snap = text;
          setMessages(m => { const n = [...m]; n[n.length - 1] = { ...n[n.length - 1], text: snap, thinking: false }; return n; });
        }
      } catch {}
    });

    const finish = () => {
      es.close();
      if (!text) {
        setMessages(m => { const n = [...m]; n[n.length - 1] = { ...n[n.length - 1], text: "EventSource: no content — check CORS or backend", thinking: false }; return n; });
      }
    };

    es.addEventListener("done", finish);
    es.onerror = () => { finish(); };
  };

  return (
    <div className="fixed bottom-32 right-5 z-50 w-[380px] h-[520px] rounded-2xl border border-slate-700 bg-[#0c111c] shadow-2xl flex flex-col overflow-hidden">
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
          <button onClick={testPing} className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 hover:text-slate-200">ping</button>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400">
            <Icon name="x" size={15} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
        {messages.map((m, i) => (
          <PopupMessage key={i} m={m} />
        ))}
      </div>

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
      {m.tools && m.tools.length > 0 && <div className="pl-6"><ToolBreadcrumbs tools={m.tools} /></div>}
      <div className="pl-6">
        {m.thinking ? (
          <span className="inline-flex gap-1 items-center text-slate-500 text-[12px]">
            <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        ) : (
          <div className="text-[13.5px] leading-relaxed text-slate-200 whitespace-pre-wrap">{m.text}</div>
        )}
      </div>
      {m.card && <div className="pl-6 pt-1"><ActionCard card={m.card} /></div>}
    </div>
  );
}

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
