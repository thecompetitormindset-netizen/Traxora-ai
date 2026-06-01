"use client";

import { useRef, useState } from "react";

type Meta = {
  price:      number;
  name:       string;
  dailyMove:  number | null;
  upTarget:   number | null;
  downTarget: number | null;
  atmIV:      number | null;
  nextExpiry: string;
};

function renderMd(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-[#F1F5F9]">$1</strong>')
    .replace(/\n/g, "<br/>");
}

export default function OptionsTab() {
  const [symbol,   setSymbol]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [meta,     setMeta]     = useState<Meta | null>(null);
  const [text,     setText]     = useState("");
  const [error,    setError]    = useState("");
  const [analyzed, setAnalyzed] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const biasMatch = text.match(/\*\*BIAS:\s*(BULLISH|BEARISH|NEUTRAL)\*\*/i);
  const bias      = biasMatch?.[1]?.toUpperCase();
  const biasColor =
    bias === "BULLISH" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25" :
    bias === "BEARISH" ? "text-rose-400 bg-rose-500/10 border-rose-500/25" :
                         "text-amber-400 bg-amber-500/10 border-amber-500/25";

  async function analyze() {
    const sym = symbol.trim().toUpperCase();
    if (!sym || loading) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setMeta(null);
    setText("");
    setError("");
    setAnalyzed(sym);

    try {
      const res = await fetch("/api/ai/options-analysis", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ symbol: sym }),
        signal:  abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error ?? "Request failed");
      }

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let   t      = "";
      let   m: Partial<Meta> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = dec.decode(value).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (raw === "[DONE]") break;
          try {
            const d = JSON.parse(raw);
            if (d.type === "meta") {
              m = { price: d.price, name: d.name, dailyMove: d.dailyMove, upTarget: d.upTarget, downTarget: d.downTarget, atmIV: d.atmIV, nextExpiry: d.nextExpiry };
            } else if (d.type === "text") {
              t += d.text;
            }
          } catch { /* partial chunk */ }
        }
        if (Object.keys(m).length) setMeta(m as Meta);
        setText(t);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Analysis failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">

      {/* Search */}
      <div className="flex gap-2">
        <input
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && analyze()}
          placeholder="Enter ticker — AAPL, NVDA, TSLA, SPY…"
          className="flex-1 bg-[#13112A] border border-[#252345] rounded-xl px-4 py-3 text-sm text-[#F1F5F9] placeholder-[#4B5675] focus:outline-none focus:border-emerald-500/50"
        />
        <button
          type="button"
          onClick={analyze}
          disabled={loading || !symbol.trim()}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors px-5 py-3 rounded-xl text-sm font-bold whitespace-nowrap flex items-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Analysing…
            </>
          ) : "Analyse Options"}
        </button>
      </div>

      {/* Empty state */}
      {!analyzed && !loading && (
        <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-6 py-14 text-center">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-sm font-semibold text-[#F1F5F9] mb-2">Options Analysis</p>
          <p className="text-xs text-[#4B5675] max-w-sm mx-auto leading-relaxed">
            Enter any optionable ticker. You'll get today's expected move range (from live IV), directional bias, a specific call or put recommendation with strike + expiry, and Smart Money price levels.
          </p>
          <div className="flex items-center justify-center gap-4 mt-5 flex-wrap">
            {["AAPL", "NVDA", "TSLA", "SPY", "QQQ"].map(t => (
              <button key={t} type="button"
                onClick={() => { setSymbol(t); }}
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors">
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/25 rounded-xl px-4 py-3">
          <p className="text-xs text-rose-400">{error}</p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !meta && (
        <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-6 py-10 flex flex-col items-center gap-3">
          <svg className="animate-spin w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          <p className="text-sm text-[#4B5675]">Fetching live price + options chain…</p>
        </div>
      )}

      {/* Results */}
      {analyzed && meta && (
        <>
          {/* Symbol + price + bias */}
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <p className="text-xl font-black text-[#F1F5F9]">{analyzed}</p>
              {meta.name && meta.name !== analyzed && (
                <p className="text-xs text-[#4B5675]">{meta.name}</p>
              )}
            </div>
            <p className="text-xl font-mono font-black text-[#F1F5F9]">${meta.price.toFixed(2)}</p>
            {bias && (
              <span className={`text-xs font-black px-3 py-1.5 rounded-lg border ${biasColor}`}>
                {bias}
              </span>
            )}
            {loading && (
              <span className="text-[10px] text-[#4B5675] animate-pulse">streaming analysis…</span>
            )}
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {meta.dailyMove != null && (
              <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-4 py-3">
                <p className="text-[9px] text-[#4B5675] uppercase tracking-wider mb-1">Expected Move Today</p>
                <p className="text-lg font-black font-mono text-[#F1F5F9]">±${meta.dailyMove.toFixed(2)}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] font-mono text-emerald-400">▲ ${meta.upTarget?.toFixed(2)}</span>
                  <span className="text-[10px] font-mono text-rose-400">▼ ${meta.downTarget?.toFixed(2)}</span>
                </div>
              </div>
            )}
            {meta.atmIV != null && (
              <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-4 py-3">
                <p className="text-[9px] text-[#4B5675] uppercase tracking-wider mb-1">ATM Implied Vol</p>
                <p className="text-lg font-black font-mono text-[#F1F5F9]">{meta.atmIV.toFixed(1)}%</p>
                <p className="text-[10px] text-[#4B5675] mt-1">annualised IV</p>
              </div>
            )}
            {meta.nextExpiry && meta.nextExpiry !== "N/A" && (
              <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-4 py-3">
                <p className="text-[9px] text-[#4B5675] uppercase tracking-wider mb-1">Nearest Expiry</p>
                <p className="text-sm font-bold text-[#F1F5F9]">{meta.nextExpiry}</p>
                <p className="text-[10px] text-[#4B5675] mt-1">options chain</p>
              </div>
            )}
          </div>

          {/* AI analysis */}
          {text && (
            <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-5 py-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-emerald-400">✦</span>
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">AI Options Analysis</p>
              </div>
              <div
                className="text-[12.5px] text-[#94A3B8] leading-relaxed [&_strong]:font-semibold [&_strong]:text-[#F1F5F9]"
                dangerouslySetInnerHTML={{ __html: renderMd(text) }}
              />
            </div>
          )}

          {!loading && (
            <p className="text-center text-[11px] text-[#333368]">
              Based on live options chain · Not financial advice · Options carry significant risk of total loss
            </p>
          )}
        </>
      )}
    </div>
  );
}
