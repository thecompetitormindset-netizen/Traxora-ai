"use client";

import { useState, useRef, useEffect } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: accumulated }]);
      }
    } catch {
      setMessages([...next, { role: "assistant", content: "Sorry, something went wrong. Make sure your API key is set." }]);
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
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open AI assistant"
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
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

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-[76px] right-6 z-50 w-[360px] h-[500px] bg-[#0C1017] border border-[#1C2333] rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#1C2333] bg-[#060A14] shrink-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F1F5F9]">Traxora AI</p>
              <p className="text-[10px] text-[#4B5675]">Ask about stocks, signals &amp; markets</p>
            </div>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Online
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                    <polyline points="16 7 22 7 22 13" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#F1F5F9]">Ask Traxora AI</p>
                  <p className="text-xs text-[#4B5675] mt-1 leading-relaxed max-w-[220px]">
                    Market analysis, ICT concepts, trade ideas, or any question about stocks and futures.
                  </p>
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-sm"
                      : "bg-[#111827] border border-[#1C2333] text-[#CBD5E1] rounded-bl-sm"
                  }`}
                >
                  {msg.content}
                  {msg.role === "assistant" && msg.content === "" && loading && (
                    <span className="inline-block w-1 h-4 bg-indigo-400 ml-0.5 animate-pulse rounded-sm" />
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-[#1C2333] flex gap-2 shrink-0">
            <textarea
              rows={1}
              className="flex-1 bg-[#060A14] border border-[#1C2333] focus:border-indigo-500/50 text-[#F1F5F9] text-sm rounded-xl px-3.5 py-2.5 resize-none outline-none placeholder:text-[#4B5675] transition-colors"
              placeholder="Ask about a stock or market…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="px-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors flex items-center justify-center"
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
