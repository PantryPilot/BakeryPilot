"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { marked } from "marked";
import { Icon } from "./Icon";
import { ToolBreadcrumbs, ActionCard } from "./atoms";
import { ActionCardData } from "./atoms";
import { ChatSessionList } from "./ChatSessionList";
import { streamChat, fetchActionCard, adaptActionCard, confirmActionCard, rejectActionCard, BACKEND_URL } from "../lib/api";
import { useApp } from "../lib/context";
import {
  createSession,
  getCurrentSessionId,
  loadSession,
  saveSession,
  setCurrentSessionId,
  type ChatSessionMessage,
} from "../lib/chatSessions";
import { useDraggable } from "../lib/useDraggable";

const WELCOME_MESSAGE: Message = {
  role: "assistant",
  agent: "OrchestratorAgent",
  text: "Hi. I have full read across plants, suppliers, and orders. What would you like to know?",
  time: "now",
};

interface Message {
  role: "user" | "assistant";
  agent?: string;
  text: string;
  time: string;
  tools?: string[];
  card?: ActionCardData | null;
  thinking?: boolean;
  status?: string;
  streaming?: boolean;
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function CopilotButton() {
  const { chatOpen, setChatOpen } = useApp();
  const [popupClosing, setPopupClosing] = useState(false);
  const pathname = usePathname();
  const bottomClass = pathname === '/facilities' ? 'bottom-[91px]' : 'bottom-6';

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
        data-tour="copilot-button"
        className={`fixed ${bottomClass} right-5 z-50 w-12 h-12 rounded-full bg-blue-500 hover:bg-blue-400 text-white shadow-[0_8px_24px_-4px_rgba(59,130,246,0.6)] flex items-center justify-center transition-all`}
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
  if (ctx.startsWith("Schedule · optimise")) {
    return "Review the current production schedule, run the changeover optimizer diff, explain the proposed changes, and create a schedule_change action card with draft_schedule_change so I can accept or reject the plan.";
  }
  if (ctx.startsWith("Supplier:")) return `What is the status of ${ctx.replace("Supplier: ", "")}? Show me their delivery performance and any issues.`;
  if (ctx.startsWith("Plant")) return `What is happening at ${ctx}? Give me a status summary.`;
  if (ctx.toLowerCase().includes("esg") || ctx.toLowerCase().includes("waste")) return "How much waste have we avoided this quarter? Show me the latest ESG numbers.";
  return ctx;
}

function CopilotPopup({ onClose, isClosing }: { onClose: () => void; isClosing?: boolean }) {
  const {
    chatContext,
    setChatContext,
    bumpScheduleRefresh,
    setPendingScheduleCardId,
    setShowScheduleProposal,
  } = useApp();
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sessionListOpen, setSessionListOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionListVersion, setSessionListVersion] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const voiceWsRef = useRef<WebSocket | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceFinalRef = useRef<string>("");
  const voiceBaseRef = useRef<string>("");
  const inflightRef = useRef(false);
  const cancelStreamRef = useRef<(() => void) | null>(null);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const draggable = useDraggable({
    storageKey: "bp-copilot-position-v1",
    disabled: expanded,
    width: 380,
    height: 520,
  });

  // Restore previous session on mount.
  useEffect(() => {
    const existing = getCurrentSessionId();
    if (existing) {
      const loaded = loadSession(existing);
      if (loaded && loaded.messages.length > 0) {
        setSessionId(existing);
        setMessages(loaded.messages as Message[]);
        return;
      }
    }
    // No restorable session — keep welcome in memory; session is created on first message.
    setSessionId(null);
  }, []);

  // Persist messages to current session whenever they change in a meaningful way.
  useEffect(() => {
    const hasUserContent = messages.some((m) => m.role === "user");
    if (!hasUserContent) return;
    const t = setTimeout(() => {
      const persistable: ChatSessionMessage[] = messages.map((m) => ({
        role: m.role,
        agent: m.agent,
        text: m.text,
        time: m.time,
        tools: m.tools,
        card: m.card ?? null,
      }));
      let id = sessionId;
      if (!id) {
        const fresh = createSession();
        id = fresh.id;
        setSessionId(id);
      }
      saveSession({
        id,
        title: "",
        messages: persistable,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setSessionListVersion((v) => v + 1);
    }, 250);
    return () => clearTimeout(t);
  }, [messages, sessionId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isThinking]);

  useEffect(() => () => { cancelStreamRef.current?.(); }, []);

  // Auto-grow the composer up to ~10 lines as the user types.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [input]);

  const handleNewSession = useCallback(() => {
    cancelStreamRef.current?.();
    cancelStreamRef.current = null;
    inflightRef.current = false;
    setIsThinking(false);
    setMessages([WELCOME_MESSAGE]);
    setSessionId(null);
    setCurrentSessionId(null);
    setInput("");
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    cancelStreamRef.current?.();
    cancelStreamRef.current = null;
    inflightRef.current = false;
    setIsThinking(false);
    const loaded = loadSession(id);
    if (!loaded) return;
    setSessionId(id);
    setCurrentSessionId(id);
    setMessages(loaded.messages.length > 0 ? (loaded.messages as Message[]) : [WELCOME_MESSAGE]);
    setInput("");
  }, []);

  useEffect(() => () => { cancelStreamRef.current?.(); }, []);

  const handleConfirmCard = useCallback(async (card: ActionCardData) => {
    if (!card.cardId) throw new Error("missing card id");
    const result = await confirmActionCard(card.cardId);
    if (!result) throw new Error("confirm failed");
    bumpScheduleRefresh();
    setMessages((m) =>
      m.map((msg) =>
        msg.card?.cardId === card.cardId ? { ...msg, card: adaptActionCard(result) } : msg,
      ),
    );
  }, [bumpScheduleRefresh]);

  const handleRejectCard = useCallback(async (card: ActionCardData) => {
    if (!card.cardId) throw new Error("missing card id");
    const result = await rejectActionCard(card.cardId);
    if (!result) throw new Error("reject failed");
    setMessages((m) =>
      m.map((msg) =>
        msg.card?.cardId === card.cardId ? { ...msg, card: adaptActionCard(result) } : msg,
      ),
    );
  }, []);

  const handleActionCardEvent = useCallback(async (cardId: string) => {
    if (!cardId) return;
    const raw = await fetchActionCard(cardId);
    if (!raw) return;
    const card = adaptActionCard(raw);
    const summary = card.flags?.[0]?.text ?? "";
    if (raw.kind === "schedule_change") {
      setPendingScheduleCardId(cardId);
      setShowScheduleProposal(true);
    }
    setMessages((m) => {
      const next = [...m];
      const last = next[next.length - 1];
      if (last?.role === "assistant") {
        const text = last.text.replace(/```action_card\s*\{[\s\S]*?\}\s*```/g, "").trim() || summary || last.text;
        next[next.length - 1] = {
          ...last,
          card,
          text,
          agent: raw.kind === "schedule_change" ? "SchedulerAgent" : last.agent,
          streaming: false,
          thinking: false,
        };
      }
      return next;
    });
  }, [setPendingScheduleCardId, setShowScheduleProposal]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || inflightRef.current) return;
    inflightRef.current = true;
    cancelStreamRef.current?.();
    const u = text.trim();
    setMessages(m => [
      ...m,
      { role: "user", text: u, time: nowTime() },
      { role: "assistant", agent: "OrchestratorAgent", text: "", time: nowTime(), thinking: true },
    ]);
    setIsThinking(true);

    cancelStreamRef.current = await streamChat(u, [], {
      onMessage: (chunk) => {
        setMessages(m => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, text: (last.text || "") + chunk, thinking: false, status: undefined, streaming: true };
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
      onActionCard: handleActionCardEvent,
      onDone: () => {
        inflightRef.current = false;
        cancelStreamRef.current = null;
        setIsThinking(false);
        setMessages(m => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && last.streaming) {
            next[next.length - 1] = { ...last, streaming: false };
          }
          return next;
        });
      },
      onError: () => {
        inflightRef.current = false;
        cancelStreamRef.current = null;
        setIsThinking(false);
        setMessages(m => {
          const next = [...m];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && !last.text) next.pop();
          else if (last?.role === "assistant") next[next.length - 1] = { ...last, streaming: false };
          return next;
        });
      },
    });
  }, [handleActionCardEvent]);

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

  const stopVoiceCapture = useCallback(() => {
    try { mediaRecorderRef.current?.stop(); } catch { /* ignore */ }
    try { voiceStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try {
      if (voiceWsRef.current?.readyState === WebSocket.OPEN) {
        voiceWsRef.current.send(JSON.stringify({ type: "CloseStream" }));
      }
    } catch { /* ignore */ }
    try { voiceWsRef.current?.close(); } catch { /* ignore */ }
    mediaRecorderRef.current = null;
    voiceStreamRef.current = null;
    voiceWsRef.current = null;
    setIsRecording(false);
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      stopVoiceCapture();
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      window.alert("Voice input is unavailable: this browser does not expose a microphone API.");
      return;
    }

    // 1) Fetch a Deepgram access token from the backend.
    let token = "";
    let model = "nova-3";
    try {
      const res = await fetch(`${BACKEND_URL}/api/voice/realtime_token`, { method: "POST" });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("voice token http", res.status, detail);
        window.alert(`Couldn't start voice (HTTP ${res.status}). Is the backend running and DEEPGRAM_API_KEY set?`);
        return;
      }
      const data = (await res.json()) as { access_token?: string; model?: string };
      token = data.access_token || "";
      if (data.model) model = data.model;
      if (!token) throw new Error("empty token");
    } catch (err) {
      console.error("voice token fetch failed:", err);
      window.alert("Couldn't start voice. Is the backend reachable?");
      return;
    }

    // 2) Get mic stream.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error("Microphone permission denied or unavailable:", err);
      window.alert("Microphone access was denied. Allow it in your browser site settings and try again.");
      return;
    }
    voiceStreamRef.current = stream;

    // 3) Open the Deepgram streaming WebSocket. Auth via subprotocol so
    //    the access token never leaks into the URL.
    const params = new URLSearchParams({
      model,
      smart_format: "true",
      interim_results: "true",
      punctuate: "true",
      language: "en",
      encoding: "opus",
    });
    const ws = new WebSocket(
      `wss://api.deepgram.com/v1/listen?${params.toString()}`,
      ["token", token],
    );
    voiceWsRef.current = ws;

    voiceBaseRef.current = (input ? input + " " : "");
    voiceFinalRef.current = "";

    ws.onopen = () => {
      // Pick the best opus-bearing container MediaRecorder supports.
      const candidates = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"];
      const mimeType = candidates.find(
        (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t),
      ) ?? "";
      let mr: MediaRecorder;
      try {
        mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch (err) {
        console.error("MediaRecorder construction failed:", err);
        window.alert("Voice recording is not supported in this browser.");
        stopVoiceCapture();
        return;
      }
      mr.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(e.data);
        }
      };
      mr.onerror = (e) => console.error("MediaRecorder error:", e);
      // 250 ms chunks → low-latency live transcription.
      mr.start(250);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          channel?: { alternatives?: Array<{ transcript?: string }> };
          is_final?: boolean;
          speech_final?: boolean;
        };
        const transcript = msg.channel?.alternatives?.[0]?.transcript ?? "";
        if (!transcript) return;
        if (msg.is_final || msg.speech_final) {
          voiceFinalRef.current = (voiceFinalRef.current + " " + transcript).trim();
          setInput(voiceBaseRef.current + voiceFinalRef.current);
        } else {
          // Show interim hypothesis live without committing it to final state.
          const live = (voiceFinalRef.current + " " + transcript).trim();
          setInput(voiceBaseRef.current + live);
        }
      } catch (err) {
        console.warn("Deepgram WS message parse error:", err);
      }
    };

    ws.onerror = (e) => {
      console.error("Deepgram WS error:", e);
    };

    ws.onclose = () => {
      // Ensure we tear down on remote close.
      try { mediaRecorderRef.current?.stop(); } catch { /* ignore */ }
      try { voiceStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
      mediaRecorderRef.current = null;
      voiceStreamRef.current = null;
      voiceWsRef.current = null;
      setIsRecording(false);
    };
  }, [isRecording, input, stopVoiceCapture]);

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
      data-drag-root
      style={{
        animation: isClosing ? "popup-out 220ms ease forwards" : "popup-in 220ms ease forwards",
        ...(!expanded && draggable.position
          ? { top: draggable.position.y, left: draggable.position.x, right: "auto", bottom: "auto" }
          : {}),
      }}
      className={
        expanded
          ? "fixed top-4 left-4 right-4 bottom-4 sm:top-8 sm:left-8 sm:right-8 sm:bottom-8 z-50 rounded-2xl border border-slate-700 bg-[#0c111c] shadow-2xl flex flex-col overflow-hidden"
          : `fixed bottom-32 right-2 sm:right-5 z-50 w-[calc(100vw-16px)] sm:w-[380px] h-[520px] rounded-2xl border border-slate-700 bg-[#0c111c] shadow-2xl flex flex-col overflow-hidden ${draggable.dragging ? "select-none" : ""}`
      }
    >
      <div
        onPointerDown={expanded ? undefined : draggable.onPointerDown}
        className={`h-12 flex items-center justify-between px-4 border-b border-slate-800 shrink-0 ${expanded ? "" : "cursor-move"}`}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(e => !e)}
            onPointerDown={(e) => e.stopPropagation()}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            title={expanded ? "Collapse" : "Expand"}
            aria-label={expanded ? "Collapse chat" : "Expand chat"}
          >
            {expanded ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
              </svg>
            )}
          </button>
          <button
            onClick={() => setSessionListOpen(o => !o)}
            onPointerDown={(e) => e.stopPropagation()}
            className={`p-1 rounded hover:bg-slate-800 transition ${sessionListOpen ? "text-blue-300 bg-slate-800" : "text-slate-400 hover:text-slate-200"}`}
            title={sessionListOpen ? "Hide chats" : "Show chats"}
            aria-label="Toggle chat history"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <button
            onClick={handleNewSession}
            onPointerDown={(e) => e.stopPropagation()}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
            title="New chat"
            aria-label="Start a new chat"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
          <span className="w-6 h-6 rounded-md bg-blue-500/20 text-blue-300 flex items-center justify-center">
            <Icon name="zap" size={12} />
          </span>
          <span className="text-[13px] font-semibold text-slate-100">Copilot</span>
        </div>
        <div className="flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
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

      <div className="flex-1 flex min-h-0">
        {sessionListOpen && (
          <ChatSessionList
            activeSessionId={sessionId}
            onSelect={handleSelectSession}
            onNew={handleNewSession}
            refreshKey={sessionListVersion}
          />
        )}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          <div className={expanded ? "max-w-[820px] mx-auto space-y-5" : "space-y-4"}>
            {messages.map((m, i) => (
              <PopupMessage key={i} m={m} onConfirmCard={handleConfirmCard} onRejectCard={handleRejectCard} />
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800 p-3 shrink-0">
        <div className={`flex items-end gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 focus-within:border-blue-500/60 transition ${expanded ? "max-w-[820px] mx-auto" : ""}`}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Ask anything… (Shift+Enter for new line)"
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-[13px] leading-relaxed text-slate-100 placeholder:text-slate-500 py-1"
            style={{ minHeight: 24, maxHeight: 220 }}
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
  const withoutActionCard = text.replace(/```action_card\s*\{[\s\S]*?\}\s*```/g, "").trim();
  const lines = withoutActionCard.split("\n");
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

function messageDisplayText(m: Message): string {
  const stripped = m.text.replace(/```action_card\s*\{[\s\S]*?\}\s*```/g, "").trim();
  if (stripped) return stripped;
  return m.card?.flags?.[0]?.text ?? "";
}

function PopupMessage({
  m,
  onConfirmCard,
  onRejectCard,
}: {
  m: Message;
  onConfirmCard?: (c: ActionCardData) => void | Promise<void>;
  onRejectCard?: (c: ActionCardData) => void | Promise<void>;
}) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md bg-slate-800 text-slate-100 text-[13px] leading-relaxed">
          {m.text}
        </div>
      </div>
    );
  }
  const displayText = messageDisplayText(m);

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
        ) : m.streaming ? (
          <div className="text-[13.5px] leading-relaxed text-slate-200 whitespace-pre-wrap break-words">
            {displayText}
            <span className="inline-block w-[7px] h-[14px] -mb-[2px] ml-[1px] bg-blue-400/70 animate-pulse"/>
          </div>
        ) : displayText ? (
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
            {cleanMarkdown(displayText)}
          </ReactMarkdown>
        ) : null}
      </div>
      {m.card && (
        <div className="pl-6 pt-2">
          <ActionCard card={m.card} onConfirm={onConfirmCard} onReject={onRejectCard} />
        </div>
      )}
      {!m.thinking && displayText && (
        <div className="pl-6 pt-1 flex items-center gap-3">
          <button
            onClick={() => downloadPdf(displayText, m.agent || "copilot")}
            className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition"
          >
            <Icon name="download" size={11} />
            Download PDF
          </button>
          <button
            onClick={() => downloadMarkdown(displayText, m.agent || "copilot")}
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
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value]);
  return (
    <div className="border-t border-slate-800 p-3 shrink-0">
      <div className="flex items-end gap-2 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 focus-within:border-blue-500/60 transition">
        <textarea
          ref={taRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder="Ask anything… (Shift+Enter for new line)"
          rows={1}
          className="flex-1 bg-transparent resize-none outline-none text-[13px] leading-relaxed text-slate-100 placeholder:text-slate-500 py-1"
          style={{ minHeight: 24, maxHeight: 240 }}
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
