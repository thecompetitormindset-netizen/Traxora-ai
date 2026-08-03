"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

const GUEST_LIMIT = 3;

const GREETING: Message = {
  role: "assistant",
  content: "Hey! 👋 I'm Traxora AI. Ask me anything about stocks, markets, or trading — I'll give you a real answer. What's on your mind?",
};

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function AIChatWidget() {
  const { data: session, status } = useSession();
  const isGuest = status !== "loading" && !session?.user;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestCount, setGuestCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-open for guests after 3 seconds on landing page
  useEffect(() => {
    if (!isGuest) return;
    const timer = setTimeout(() => {
      setOpen(true);
      setMessages([GREETING]);
    }, 3000);
    return () => clearTimeout(timer);
  }, [isGuest]);

  // Open from sidebar "AI Chat" nav item
  useEffect(() => {
    function handleOpen() {
      setOpen(true);
      setMessages(prev => prev.length === 0 ? [GREETING] : prev);
    }
    window.addEventListener("traxora-open-chat", handleOpen);
    return () => window.removeEventListener("traxora-open-chat", handleOpen);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages([...next, assistantMsg]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });

      const raw = await res.text();
      let data: { ok: boolean; text?: string; error?: string };
      try { data = JSON.parse(raw); }
      catch { throw new Error("Invalid response"); }

      if (!data.ok) {
        setMessages([...next, { role: "assistant", content: data.error ?? "Something went wrong. Please try again." }]);
        return;
      }

      const newCount = guestCount + 1;
      setGuestCount(newCount);

      const reply = data.text ?? "";
      if (isGuest && newCount >= GUEST_LIMIT) {
        setMessages([...next, { role: "assistant", content: reply }, {
          role: "assistant",
          content: "SIGNUP_PROMPT",
        }]);
      } else {
        setMessages([...next, { role: "assistant", content: reply }]);
      }
    } catch {
      setMessages([...next, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Trigger button — on mobile sits on the LEFT above the nav (AutoTrader owns the right); on sm+ sits bottom-right */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open AI assistant"
        className="fixed bottom-28 right-4 sm:bottom-28 md:bottom-8 md:right-6 z-[var(--z-float)] w-12 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
      >
        {open ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Chat panel — anchors from the left on mobile (matching button), right on desktop */}
      {open && (
        <div className="fixed bottom-44 right-2 left-2 sm:left-auto sm:right-4 sm:bottom-44 md:right-6 md:bottom-24 md:w-[360px] h-[60vh] sm:h-[500px] max-h-[500px] bg-[#13112A] border border-[#252345] rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden z-[var(--z-float)]">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#252345] bg-[#0D0B1A] shrink-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F1F5F9]">Traxora AI</p>
              <p className="text-[10px] text-[#4B5675]">Ask about stocks, signals &amp; markets</p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Online
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[#4B5675] hover:text-[#F1F5F9] transition-colors"
                aria-label="Close chat"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                    <polyline points="16 7 22 7 22 13" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#F1F5F9]">Ask Traxora AI</p>
                  <p className="text-xs text-[#4B5675] mt-1 leading-relaxed max-w-[220px]">
                    Market analysis, smart money concepts, trade ideas, or any question about stocks and futures.
                  </p>
                </div>
              </div>
            )}
            {messages.map((msg, i) => {
              if (msg.content === "SIGNUP_PROMPT") {
                return (
                  <div key={i} className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-4 text-center">
                    <p className="text-sm font-bold text-[#F1F5F9] mb-1">Want more? Sign in free 🚀</p>
                    <p className="text-xs text-[#7B8DB4] mb-3">Get 20 messages per minute + full platform access.</p>
                    <Link href="/login" className="block w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-colors">
                      Sign in with Google →
                    </Link>
                  </div>
                );
              }
              return (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-emerald-600 text-white rounded-br-sm"
                        : "bg-[#1A1838] border border-[#252345] text-[#CBD5E1] rounded-bl-sm"
                    }`}
                  >
                    {msg.role === "assistant" && msg.content === "" && loading
                      ? <span className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0ms]"/>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:150ms]"/>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:300ms]"/>
                        </span>
                      : msg.content}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-[#252345] flex gap-2 shrink-0">
            <textarea
              rows={1}
              className="flex-1 bg-[#0D0B1A] border border-[#252345] focus:border-emerald-500/50 text-[#F1F5F9] text-sm rounded-xl px-3.5 py-2.5 resize-none outline-none placeholder:text-[#4B5675] transition-colors"
              placeholder={isGuest && guestCount >= GUEST_LIMIT ? "Sign in to keep chatting…" : "Ask about a stock or market…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading || (isGuest && guestCount >= GUEST_LIMIT)}
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || !input.trim() || (isGuest && guestCount >= GUEST_LIMIT)}
              aria-label="Send message"
              className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
