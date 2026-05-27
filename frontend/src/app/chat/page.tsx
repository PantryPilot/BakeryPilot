"use client";
import { useState, useEffect, useRef } from "react";
import { Icon } from "../../components/Icon";
import { Pill, Dot, ToolBreadcrumbs, ActionCard } from "../../components/atoms";
import { ChatBox } from "../../components/ChatDrawer";
import { ActionCardData } from "../../components/atoms";
import { streamChat, fetchActionCard, adaptActionCard } from "../../lib/api";

interface Message {
  role: "user" | "assistant";
  agent?: string;
  time: string;
  text: string;
  tools?: string[];
  card?: ActionCardData | null;
}

function VoiceLog({ open, onClose, onTranscript }: { open: boolean; onClose: () => void; onTranscript: (t: string) => void }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!open) { setSecs(0); return; }
    const id = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [open]);
  if (!open) return null;
  const stop = () => {
    setTimeout(() => {
      onTranscript("Received 1,840 kg flour from Northstar — Plant 1, Bay 3, lot tag NM-92418");
      onClose();
    }, 700);
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center">
      <div className="w-[440px] rounded-2xl border border-slate-700 bg-[#0c111c] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex w-2 h-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60"/>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400"/>
            </span>
            <span className="text-[12px] uppercase tracking-wider font-semibold text-red-300">Recording</span>
          </div>
          <span className="font-mono text-[14px] text-slate-200 tabular-nums">{String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}</span>
        </div>
        <div className="my-8 h-20 flex items-center justify-center gap-1">
          {Array.from({ length: 28 }).map((_, i) => (
            <div key={i} className="w-1 bg-red-400 rounded-full" style={{ height: `${10 + Math.abs(Math.sin((i + secs * 4) * 0.5)) * 60}px`, opacity: 0.4 + Math.abs(Math.sin((i + secs * 4) * 0.5)) * 0.6, transition: "height 0.1s" }}/>
          ))}
        </div>
        <div className="text-[11px] font-mono text-slate-500 text-center mb-5">faster-whisper · stt streaming</div>
        <div className="flex items-center justify-between gap-3">
          <button onClick={onClose} className="px-3 py-2 text-slate-400 hover:text-slate-200 text-[13px]">Cancel</button>
          <button onClick={stop} className="flex-1 py-2.5 rounded-md bg-red-500 hover:bg-red-400 text-red-950 font-semibold text-[13px]">Stop &amp; transcribe</button>
        </div>
      </div>
    </div>
  );
}

function VerificationBadge({ level }: { level: "auto" | "peer" | "sup" | "dual" }) {
  const map = {
    auto: { cls: "border-emerald-500/40 bg-emerald-500/10", dot: "bg-emerald-400", text: "text-emerald-300", label: "Auto-commit",      desc: "Routine update · high confidence" },
    peer: { cls: "border-amber-500/40 bg-amber-500/10",     dot: "bg-amber-400",   text: "text-amber-300",   label: "Peer verify",      desc: "Co-worker confirmation needed" },
    sup:  { cls: "border-orange-500/40 bg-orange-500/10",   dot: "bg-orange-400",  text: "text-orange-300",  label: "Supervisor sign-off", desc: "Manager approval needed" },
    dual: { cls: "border-red-500/40 bg-red-500/10",         dot: "bg-red-400",     text: "text-red-300",     label: "Dual sign-off",    desc: "Two senior staff must confirm" },
  };
  const m = map[level];
  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border ${m.cls}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${m.dot}`}/>
      <span className={`text-[11px] font-semibold ${m.text}`}>{m.label}</span>
      <span className="text-[10px] text-slate-500 font-mono">· {m.desc}</span>
    </div>
  );
}

function ThinkingIndicator({ agent }: { agent: string }) {
  const [a, setA] = useState(agent);
  useEffect(() => {
    const list = ["ProcurementAgent", "SchedulerAgent", "InventoryAgent"];
    let i = 0;
    const id = setInterval(() => { i = (i + 1) % list.length; setA(list[i]); }, 1600);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-2 text-[11px] text-slate-500">
      <span className="w-6 h-6 rounded-md bg-slate-800 flex items-center justify-center"><Icon name="zap" size={12}/></span>
      <span className="font-mono">{a} thinking</span>
      <span className="inline-flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }}/>
        <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }}/>
        <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }}/>
      </span>
    </div>
  );
}

function ChatMessageFull({ m }: { m: Message }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%]">
          <div className="px-3.5 py-2 rounded-2xl rounded-br-md bg-slate-800 text-slate-100 text-[14px]">{m.text}</div>
          <div className="text-[10px] font-mono text-slate-500 text-right mt-1">{m.time}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-blue-500/20 text-blue-300 flex items-center justify-center"><Icon name="zap" size={12}/></span>
        <span className="text-[11px] uppercase tracking-wider text-slate-300 font-semibold">{m.agent}</span>
        <span className="text-slate-700">·</span>
        <span className="text-[11px] font-mono text-slate-500">{m.time}</span>
      </div>
      {m.tools && <div className="pl-8"><ToolBreadcrumbs tools={m.tools}/></div>}
      <div className="pl-8 text-[14px] text-slate-200 leading-relaxed whitespace-pre-wrap">{m.text}</div>
      {m.card && <div className="pl-8 pt-1"><ActionCard card={m.card}/></div>}
    </div>
  );
}

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [voice, setVoice] = useState(false);
  const [thread, setThread] = useState<Message[]>([
    {
      role: "assistant",
      agent: "OrchestratorAgent",
      time: "now",
      text: "Morning. I have full read across plants, suppliers, and orders. What would you like to know?",
    },
  ]);
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [thread]);

  const send = async () => {
    if (!input.trim() || isThinking) return;
    const u = input.trim();
    const history = thread.map(m => ({ role: m.role, content: m.text }));
    setThread(t => [
      ...t,
      { role: "user", text: u, time: "now" },
      { role: "assistant", agent: "OrchestratorAgent", time: "now", text: "" },
    ]);
    setInput("");
    setIsThinking(true);

    await streamChat(u, history, {
      onMessage: (chunk) => {
        setThread(t => {
          const next = [...t];
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
        setThread(t => {
          const next = [...t];
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
        setThread(t => {
          const next = [...t];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && !last.text) next.pop();
          return next;
        });
      },
    });
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col border-r border-slate-800/60 min-w-0">
        <div className="px-6 py-4 border-b border-slate-800/60 flex items-center gap-3">
          <Icon name="chat" size={18} className="text-blue-400"/>
          <div className="flex-1">
            <h1 className="text-[16px] font-semibold text-slate-100">Copilot</h1>
            <div className="text-[11px] text-slate-500 font-mono">
              Multi-agent · streaming SSE
            </div>
          </div>
          <Pill tone="green"><Dot tone="green" pulse/> connected</Pill>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
          <div className="max-w-[760px] mx-auto space-y-5">
            {thread.map((m, i) => <ChatMessageFull key={i} m={m}/>)}
            {isThinking && <ThinkingIndicator agent="OrchestratorAgent"/>}
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="max-w-[760px] mx-auto">
            <ChatBox value={input} setValue={setInput} onSend={send} suggested onVoice={() => setVoice(true)}/>
          </div>
        </div>
      </div>

      <aside className="hidden lg:flex w-[420px] shrink-0 bg-[#0a0d14] flex-col">
        <div className="px-5 py-4 border-b border-slate-800/60">
          <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500 mb-1">Context · most recent</div>
          <div className="text-[13px] text-slate-200 font-mono">Latest ActionCard from thread</div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {thread.filter(m => m.card).at(-1)?.card
            ? <ActionCard card={thread.filter(m => m.card).at(-1)!.card!}/>
            : <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-[12px] text-slate-500">No action cards yet — ask me to place an order, schedule a run, or substitute a lot.</div>
          }
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Verification chain · voice-logged update</div>
            <VerificationBadge level="peer"/>
            <div className="mt-3 space-y-2">
              {[
                { who: "J. Doan · receiver", time: "07:38", note: "Voice log · 1,840 kg flour · NM-92418" },
                { who: "M. Patel · peer",    time: "07:39", note: "Confirmed weight, photo attached" },
                { who: "System",             time: "07:39", note: "Committed to lot ledger · LOT-22094" },
              ].map((v, i) => (
                <div key={i} className="flex gap-3 text-[12px]">
                  <span className="font-mono text-slate-500 w-12 shrink-0 tabular-nums">{v.time}</span>
                  <div>
                    <div className="text-slate-200">{v.who}</div>
                    <div className="text-slate-500">{v.note}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">confidence</span>
              <span className="text-slate-200 tabular-nums">0.94</span>
            </div>
          </div>
        </div>
      </aside>

      <VoiceLog open={voice} onClose={() => setVoice(false)} onTranscript={t => setInput(t)}/>
    </div>
  );
}
