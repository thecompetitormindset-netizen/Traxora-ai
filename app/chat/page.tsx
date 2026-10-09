"use client";

import { useEffect, useRef, useState } from "react";
import Sidebar from "@/app/components/Sidebar";
import Topbar from "@/app/components/Topbar";
import PaywallGuard from "@/app/components/PaywallGuard";
import Link from "next/link";
import { Glyph } from "../components/Icon";

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = "user" | "assistant";
type Message = { role: Role; content: string; ts: number };

// ── Starter prompts ───────────────────────────────────────────────────────────

const STARTERS = [
  "Explain order blocks and how to trade them",
  "What is a fair value gap?",
  "How do I calculate position size for a 1% risk trade?",
  "Explain the options Greeks (Delta, Gamma, Theta, Vega)",
  "How does liquidity sweep work in Smart Money Concepts?",
  "Explain market structure shift vs break of structure",
  "What is the difference between a CSP and a covered call?",
];

// ── Markdown-lite renderer ────────────────────────────────────────────────────

function renderContent(text: string): React.ReactNode {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) { nodes.push(<br key={i} />); i++; continue; }

    // Bold + inline code (simple pass)
    const inlined = line
      .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
      .map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={j} className="text-[#F1F5F9] font-bold">{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`"))
          return <code key={j} className="bg-[#1A1838] text-emerald-300 px-1 py-0.5 rounded text-[11px] font-mono">{part.slice(1, -1)}</code>;
        return part;
      });

    if (line.startsWith("- ") || line.startsWith("• ")) {
      nodes.push(<li key={i} className="ml-4 list-disc text-[#CBD5E1]">{inlined.slice(1)}</li>);
    } else if (/^\d+\./.test(line)) {
      nodes.push(<li key={i} className="ml-4 list-decimal text-[#CBD5E1]">{inlined.slice(line.indexOf(".") + 1)}</li>);
    } else if (line.startsWith("## ")) {
      nodes.push(<p key={i} className="font-bold text-[#F1F5F9] mt-2">{line.slice(3)}</p>);
    } else {
      nodes.push(<p key={i} className="text-[#CBD5E1]">{inlined}</p>);
    }
    i++;
  }
  return <div className="space-y-0.5 leading-relaxed text-sm">{nodes}</div>;
}

// ── Message bubble ────────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black mt-0.5 ${
        isUser ? "bg-violet-600" : "bg-emerald-600/40 border border-emerald-500/30"
      }`}>
        {isUser ? "U" : "✦"}
      </div>

      {/* Bubble */}
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
        isUser
          ? "bg-violet-600/20 border border-violet-500/20 rounded-tr-sm"
          : "bg-[#13112A] border border-[#252345] rounded-tl-sm"
      }`}>
        {isUser ? (
          <p className="text-sm text-[#F1F5F9]">{msg.content}</p>
        ) : (
          renderContent(msg.content)
        )}
      </div>
    </div>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black bg-emerald-600/40 border border-emerald-500/30">
        ✦
      </div>
      <div className="bg-[#13112A] border border-[#252345] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
        {[0, 1, 2].map(i => (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "traxora_chat_history";
const MAX_STORED  = 40;

export default function ChatPage() {
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input,    setInput]        = useState("");
  const [loading,  setLoading]      = useState(false);
  const [error,    setError]        = useState("");
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  // Restore history from sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function saveMessages(msgs: Message[]) {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-MAX_STORED))); } catch { /* ignore */ }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");
    setError("");

    const userMsg: Message = { role: "user", content: trimmed, ts: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    saveMessages(next);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json() as { ok: boolean; text?: string; error?: string };
      if (!data.ok || !data.text) throw new Error(data.error ?? "Failed");

      const aiMsg: Message = { role: "assistant", content: data.text, ts: Date.now() };
      const final = [...next, aiMsg];
      setMessages(final);
      saveMessages(final);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  function clearHistory() {
    setMessages([]);
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  const isEmpty = messages.length === 0;

  return (
    <PaywallGuard>
      <div className="flex min-h-screen text-[#F1F5F9]">
        <Sidebar />
        <main className="app-ambient min-w-0 flex-1 flex flex-col chat-main-height">
          <div className="p-3 sm:p-4 xl:p-5 pb-0 shrink-0">
            <Topbar />
            <div className="flex items-center justify-between mt-3 mb-2">
              <div>
                <h1 className="text-xl font-black tracking-tight text-gradient-green">AI Chat</h1>
                <p className="text-[10px] text-[#4B5675]">Ask about strategies, concepts, or how to use Traxora</p>
              </div>
              {!isEmpty && (
                <button type="button" onClick={clearHistory}
                  className="text-xs text-[#4B5675] hover:text-rose-400 transition border border-[#252345] px-3 py-1.5 rounded-xl">
                  Clear chat
                </button>
              )}
            </div>
          </div>

          {/* ── Chat area ── */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-4 xl:px-5 py-4 space-y-4 scrollbar-hide min-h-0">
            <div className="max-w-3xl mx-auto w-full space-y-4">

              {/* Empty state / starters */}
              {isEmpty && (
                <div className="pt-8">
                  <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-3xl">
                      ✦
                    </div>
                  </div>
                  <p className="text-center text-base font-bold text-[#F1F5F9] mb-1">What would you like to know?</p>
                  <p className="text-center text-sm text-[#4B5675] mb-8">
                    Trading concepts, strategies, options, market structure, or how to use Traxora.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {STARTERS.map(s => (
                      <button key={s} type="button" onClick={() => send(s)}
                        className="text-left px-4 py-3 rounded-2xl bg-[#13112A] border border-[#252345] hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all group">
                        <p className="text-xs text-[#CBD5E1] group-hover:text-[#F1F5F9] transition-colors leading-snug">{s}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              {messages.map((m, i) => <Bubble key={i} msg={m} />)}
              {loading && <TypingIndicator />}
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-rose-500/8 border border-rose-500/20 rounded-2xl">
                  <span className="text-rose-400 text-sm shrink-0"><Glyph e="⚠" /></span>
                  <p className="text-xs text-rose-300">{error}</p>
                  <button type="button" onClick={() => setError("")}
                    className="ml-auto text-rose-400 hover:text-rose-300 transition text-sm shrink-0">✕</button>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* ── Input area ── */}
          <div className="shrink-0 px-3 sm:px-4 xl:px-5 py-4 border-t border-[#1A1838]">
            <div className="max-w-3xl mx-auto">
              <div className="flex gap-2 items-end bg-[#13112A] border border-[#252345] focus-within:border-emerald-500/40 rounded-2xl p-2 transition-colors">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about order blocks, options strategies, position sizing…"
                  rows={1}
                  className="flex-1 bg-transparent resize-none outline-none text-sm text-[#F1F5F9] placeholder-[#4B5675] px-2 py-1.5 max-h-32 scrollbar-hide"
                  style={{ lineHeight: "1.5" }}
                />
                <button type="button" onClick={() => send(input)}
                  disabled={!input.trim() || loading}
                  className="shrink-0 w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center justify-between mt-2 px-1">
                <p className="text-[9px] text-[#333368]">Enter to send · Shift+Enter for new line · For live ticker analysis use the <Link href="/analysis" className="text-emerald-500/70 hover:text-emerald-400 transition-colors">Analysis page</Link></p>
                <p className="text-[9px] text-[#333368]">Educational use only · Not financial advice</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </PaywallGuard>
  );
}
