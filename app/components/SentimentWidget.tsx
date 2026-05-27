"use client";

import { useEffect, useState } from "react";

type SentimentData = {
  score: number;
  label: string;
  color: string;
  vix: number | null;
  vixChange: number | null;
  spyPrice: number | null;
  spyChange: number | null;
};

const COLOR_MAP: Record<string, { bar: string; text: string; bg: string; border: string }> = {
  emerald: { bar: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  green:   { bar: "bg-emerald-400", text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  amber:   { bar: "bg-amber-400",   text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20" },
  orange:  { bar: "bg-orange-400",  text: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20" },
  rose:    { bar: "bg-rose-400",    text: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/20" },
};

export default function SentimentWidget() {
  const [data, setData] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sentiment")
      .then((r) => r.json())
      .then((d) => { setData(d?.error ? null : d); })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const c = COLOR_MAP[data?.color ?? "amber"] ?? COLOR_MAP.amber;

  return (
    <div className="bg-[#0C1017] border border-[#1C2333] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5675]">Market Sentiment</p>
          <p className="text-xs text-[#4B5675] mt-0.5">Based on VIX volatility + S&amp;P 500 momentum</p>
        </div>
        {!loading && data && (
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${c.bg} ${c.text} ${c.border}`}>
            {data.label}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-20 flex items-center justify-center">
          <span className="text-[#4B5675] text-sm animate-pulse">Loading…</span>
        </div>
      ) : !data ? (
        <div className="h-20 flex items-center justify-center">
          <span className="text-[#4B5675] text-sm">Sentiment unavailable</span>
        </div>
      ) : (
        <>
          {/* Score gauge */}
          <div className="mb-4">
            <div className="flex justify-between text-[10px] text-[#4B5675] mb-1.5">
              <span>Extreme Fear</span>
              <span className={`font-bold text-sm ${c.text}`}>{data.score} / 100</span>
              <span>Extreme Greed</span>
            </div>
            <div className="h-2 bg-[#1C2333] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${c.bar}`}
                style={{ width: `${data.score}%` }}
              />
            </div>
            {/* Scale markers */}
            <div className="flex justify-between mt-1">
              {["0", "25", "50", "75", "100"].map((n) => (
                <span key={n} className="text-[9px] text-[#4B5675]">{n}</span>
              ))}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#060A14]/60 border border-[#1C2333] rounded-xl p-3">
              <p className="text-[10px] text-[#4B5675] uppercase tracking-wide">VIX</p>
              <p className="text-lg font-black font-mono text-[#F1F5F9] mt-0.5">
                {data.vix ?? "—"}
              </p>
              {data.vixChange !== null && (
                <p className={`text-[10px] font-semibold mt-0.5 ${data.vixChange <= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {data.vixChange > 0 ? "+" : ""}{data.vixChange.toFixed(2)}% today
                </p>
              )}
              <p className="text-[9px] text-[#4B5675] mt-1">Volatility Index · low = calm</p>
            </div>
            <div className="bg-[#060A14]/60 border border-[#1C2333] rounded-xl p-3">
              <p className="text-[10px] text-[#4B5675] uppercase tracking-wide">SPY</p>
              <p className="text-lg font-black font-mono text-[#F1F5F9] mt-0.5">
                ${data.spyPrice ?? "—"}
              </p>
              {data.spyChange !== null && (
                <p className={`text-[10px] font-semibold mt-0.5 ${data.spyChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {data.spyChange >= 0 ? "+" : ""}{data.spyChange.toFixed(2)}% today
                </p>
              )}
              <p className="text-[9px] text-[#4B5675] mt-1">S&amp;P 500 ETF proxy</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
