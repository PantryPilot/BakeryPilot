"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { marked } from "marked";
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
  status?: string;
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function CopilotButton() {
  const { chatOpen, setChatOpen } = useApp();
  const [popupClosing, setPopupClosing] = useState(false);

  const handleClose = useCallback(() => {
    setPopupClosing(true);
    setTimeout(() => { setChatOpen(false); setPopupClosing(false); }, 220);
  }, [setChatOpen]);

  const handleToggle = () => {
    if (chatOpen) handleClose();
    else setChatOpen(true);
  };

  return (
    <>
      <button
        onClick={handleToggle}
        className="fixed bottom-[132px] right-5 z-50 w-12 h-12 rounded-full bg-blue-500 hover:bg-blue-400 text-white shadow-[0_8px_24px_-4px_rgba(59,130,246,0.6)] flex items-center justify-center transition-all"
        title="Copilot"
      >
        {chatOpen
          ? <Icon name="x" size={18} />
          : <Icon name="chat" size={18} />}
      </button>

      {chatOpen && <CopilotPopup onClose={handleClose} isClosing={popupClosing} />}
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

function CopilotPopup({ onClose, isClosing }: { onClose: () => void; isClosing?: boolean }) {
  const { chatContext, setChatContext } = useApp();
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
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
      { role: "assistant", agent: "OrchestratorAgent", text: "", time: nowTime(), thinking: true },
    ]);
    setIsThinking(true);

    await streamChat(u, [], {
      onMessage: (chunk) => {
        setMessages(m => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, text: (last.text || "") + chunk, thinking: false, status: undefined };
          }
          return next;
        });
      },
      onStatus: (statusText) => {
        setMessages(m => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && last.thinking) {
            next[next.length - 1] = { ...last, status: statusText };
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

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("file", blob, "voice.webm");
        try {
          const res = await fetch(`${BACKEND_URL}/api/voice/upload`, { method: "POST", body: form });
          const data = await res.json() as { transcription?: string };
          if (data.transcription) {
            setInput(data.transcription);
          }
        } catch {}
        setIsRecording(false);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setIsRecording(true);
    } catch {}
  }, [isRecording]);

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
    <div
      style={{ animation: isClosing ? "popup-out 220ms ease forwards" : "popup-in 220ms ease forwards" }}
      className="fixed bottom-32 right-2 sm:right-5 z-50 w-[calc(100vw-16px)] sm:w-[380px] h-[520px] rounded-2xl border border-slate-700 bg-[#0c111c] shadow-2xl flex flex-col overflow-hidden"
    >
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
            onClick={toggleRecording}
            disabled={isThinking}
            title={isRecording ? "Stop recording" : "Voice input"}
            className={`p-1.5 rounded transition disabled:opacity-40 ${isRecording ? "bg-red-500 hover:bg-red-400 text-white animate-pulse" : "text-slate-400 hover:text-slate-200"}`}
          >
            <Icon name="mic" size={14} />
          </button>
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

function parseCells(line: string): string[] {
  return line.split("|").map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
}

function isSeparator(cell: string): boolean {
  return /^[-: ]+$/.test(cell) && cell.includes("-");
}

function cleanTable(lines: string[]): string {
  const rows = lines.map(parseCells).filter(r => r.length > 0);
  if (rows.length === 0) return lines.join("\n");

  const sepIdx = rows.findIndex(r => r.every(isSeparator));
  const headerRows = sepIdx > 0 ? rows.slice(0, sepIdx) : [rows[0]];
  const dataRows = rows.slice(sepIdx > 0 ? sepIdx + 1 : 1).filter(r => !r.every(isSeparator));

  const colCount = Math.max(...rows.map(r => r.length));
  const pad = (row: string[]) => {
    const r = [...row];
    while (r.length < colCount) r.push("");
    return r.slice(0, colCount);
  };

  const toRow = (cells: string[]) => "| " + pad(cells).join(" | ") + " |";
  const sep = "| " + Array(colCount).fill("---").join(" | ") + " |";

  return [toRow(headerRows[0]), sep, ...dataRows.map(toRow)].join("\n");
}

function cleanMarkdown(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim().startsWith("|")) {
      const block: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        block.push(lines[i]);
        i++;
      }
      out.push(cleanTable(block));
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out.join("\n");
}

function fileSlug(agent: string) {
  const ts = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
  return `bakery-report_${agent.toLowerCase().replace(/\s+/g, "-")}_${ts}`;
}

function downloadMarkdown(text: string, agent: string) {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileSlug(agent)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf(text: string, agent: string) {
  const html = marked(text) as string;
  const content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>BakeryPilot — ${agent}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 820px; margin: 48px auto; color: #111827; line-height: 1.6; }
    h1,h2,h3,h4 { color: #111827; margin-top: 1.4em; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 13px; }
    th, td { border: 1px solid #d1d5db; padding: 7px 12px; text-align: left; }
    th { background: #f3f4f6; font-weight: 600; }
    code { background: #f3f4f6; padding: 2px 5px; border-radius: 4px; font-family: "SF Mono", monospace; font-size: 12px; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }
    .meta { color: #6b7280; font-size: 12px; margin-bottom: 1.5em; }
    @media print { body { margin: 28px; } }
  </style>
</head>
<body>
  <h2>BakeryPilot — ${agent}</h2>
  <p class="meta">Generated ${new Date().toLocaleString()}</p>
  <hr/>
  ${html}
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;
  const blob = new Blob([content], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) win.onload = () => URL.revokeObjectURL(url);
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
          <div className="space-y-2">
            {m.status && (
              <div className="flex items-center gap-2">
                <span className="relative flex w-1.5 h-1.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60"/>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400"/>
                </span>
                <span className="text-[12px] font-mono text-slate-400">{m.status}</span>
              </div>
            )}
            <span className="inline-flex gap-1 items-center text-slate-500 text-[12px]">
              <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          </div>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="text-[13.5px] leading-relaxed text-slate-200 mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="text-slate-100 font-semibold">{children}</strong>,
              ul: ({ children }) => <ul className="list-disc list-inside space-y-1 text-[13px] text-slate-200 mb-2">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 text-[13px] text-slate-200 mb-2">{children}</ol>,
              li: ({ children }) => <li className="text-slate-300">{children}</li>,
              code: ({ children }) => <code className="bg-slate-800 text-blue-300 rounded px-1 py-0.5 text-[12px] font-mono">{children}</code>,
              table: ({ children }) => <div className="overflow-x-auto mb-2"><table className="text-[12px] border-collapse w-full">{children}</table></div>,
              thead: ({ children }) => <thead className="bg-slate-800/60">{children}</thead>,
              th: ({ children }) => <th className="border border-slate-700 px-2 py-1 text-left text-slate-300 font-medium">{children}</th>,
              td: ({ children }) => <td className="border border-slate-700 px-2 py-1 text-slate-400">{children}</td>,
              h3: ({ children }) => <h3 className="text-[13px] font-semibold text-slate-100 mb-1 mt-2">{children}</h3>,
              h4: ({ children }) => <h4 className="text-[12px] font-semibold text-slate-200 mb-1">{children}</h4>,
            }}
          >
            {cleanMarkdown(m.text)}
          </ReactMarkdown>
        )}
      </div>
      {m.card && <div className="pl-6 pt-1"><ActionCard card={m.card} /></div>}
      {!m.thinking && m.text && (
        <div className="pl-6 pt-1 flex items-center gap-3">
          <button
            onClick={() => downloadPdf(m.text, m.agent || "copilot")}
            className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition"
          >
            <Icon name="download" size={11} />
            Download PDF
          </button>
          <button
            onClick={() => downloadMarkdown(m.text, m.agent || "copilot")}
            className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition"
          >
            <Icon name="download" size={11} />
            Download MD
          </button>
        </div>
      )}
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

// compact and suggested are reserved for future use by the chat page
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
