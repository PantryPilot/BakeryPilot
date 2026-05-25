"use client";
import { useState, useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { Pill } from "./atoms";
import { ToolBreadcrumbs, ActionCard, StreamingText } from "./atoms";
import { SUGGESTED_PROMPTS } from "../lib/data";
import { pickAgent, pickTools, mockReply, pickCard } from "./ChatBrain";
import { ActionCardData } from "./atoms";

interface Message {
  role: "user" | "assistant";
  agent?: string;
  text: string;
  time: string;
  tools?: string[];
  card?: ActionCardData | null;
}

interface ChatDrawerProps {
  open: boolean;
  setOpen: (v: boolean) => void;
  context?: string | null;
}

export function ChatDrawer({ open, setOpen, context }: ChatDrawerProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", agent: "OrchestratorAgent", text: "Hi. I have full read across plants, suppliers, and orders. What would you like to know?", time: "07:42" },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  const send = () => {
    if (!input.trim()) return;
    const u = input.trim();
    setMessages(m => [...m, { role: "user", text: u, time: "now" }]);
    setInput("");
    setTimeout(() => {
      setMessages(m => [...m, {
        role: "assistant",
        agent: pickAgent(u),
        text: mockReply(u),
        time: "now",
        tools: pickTools(u),
        card: pickCard(u),
      }]);
    }, 450);
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-16 right-4 z-40 flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-blue-500 hover:bg-blue-400 text-blue-950 shadow-[0_8px_24px_-6px_rgba(59,130,246,0.6)] transition"
        >
          <Icon name="chat" size={16}/>
          <span className="text-[13px] font-semibold">Ask copilot</span>
        </button>
      )}

      <div className={`fixed top-14 right-0 bottom-12 z-40 w-[400px] bg-[#0c111c] border-l border-slate-800 shadow-2xl flex flex-col transition-transform ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="h-12 flex items-center justify-between px-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Icon name="chat" size={14} className="text-blue-400"/>
            <span className="text-[13px] font-semibold text-slate-100">Copilot</span>
            <Pill tone="ghost" className="font-mono">drawer</Pill>
          </div>
          <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-slate-800 text-slate-400">
            <Icon name="x" size={16}/>
          </button>
        </div>

        {context && (
          <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/40">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Context</div>
            <div className="text-[12px] text-slate-300 font-mono">{context}</div>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((m, i) => (
            <DrawerMessage key={i} m={m}/>
          ))}
        </div>

        <ChatBox value={input} setValue={setInput} onSend={send} compact/>
      </div>
    </>
  );
}

function DrawerMessage({ m }: { m: Message }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md bg-slate-800 text-slate-100 text-[13px]">{m.text}</div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
        <span className="w-5 h-5 rounded-md bg-blue-500/20 text-blue-300 flex items-center justify-center">
          <Icon name="zap" size={11}/>
        </span>
        <span>{m.agent || "Copilot"}</span>
        <span className="text-slate-600">·</span>
        <span className="font-mono">{m.time}</span>
      </div>
      {m.tools && <ToolBreadcrumbs tools={m.tools}/>}
      <StreamingText text={m.text}/>
      {m.card && <div className="pt-1"><ActionCard card={m.card}/></div>}
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
  const [showSuggested, setShowSuggested] = useState(true);
  const handleSend = () => { onSend(); setShowSuggested(false); };

  return (
    <div className="border-t border-slate-800 p-3">
      {suggested && showSuggested && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {SUGGESTED_PROMPTS.map((p, i) => (
            <button key={i} onClick={() => setValue(p)}
              className="px-2.5 py-1 rounded-full border border-slate-700 hover:border-slate-500 text-[11px] text-slate-300 hover:text-slate-100 transition">
              {p}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 focus-within:border-blue-500/60 transition">
        <textarea
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Ask anything · type / for commands"
          rows={1}
          className="flex-1 bg-transparent resize-none outline-none text-[13px] text-slate-100 placeholder:text-slate-500 max-h-32"
          style={{ minHeight: 24 }}
        />
        {onVoice && (
          <button onClick={onVoice} className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200">
            <Icon name="mic" size={16}/>
          </button>
        )}
        <button onClick={handleSend} className="p-1.5 rounded bg-blue-500 hover:bg-blue-400 text-blue-950">
          <Icon name="send" size={14}/>
        </button>
      </div>
    </div>
  );
}
