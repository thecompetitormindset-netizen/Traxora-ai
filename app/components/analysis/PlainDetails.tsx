"use client";

import { useEffect, useState } from "react";
import type { AnalystRatings } from "@/app/api/market/analyst-ratings/route";
import type { Technicals } from "@/app/api/market/technicals/route";
import type { TradePlan } from "./types";

// "More details" on the Signals page, in everyday words. The engine reports
// in trader shorthand ("VWAP", "Order Block", "BSL"); this turns the parts a
// beginner can use into plain sentences and leaves the rest out. Every
// sentence comes from a real number — nothing is invented.

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (s: string) => { const m = s.match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };

/** One engine observation → one plain sentence, or null when it has no plain meaning. */
function plainPoint(p: string): string | null {
  const [head, ...rest] = p.split(":");
  const body = rest.join(":");
  const key = head.trim().toLowerCase();
  if (key === "price zone") {
    if (/premium/i.test(body)) return "The price is near the top of today’s range.";
    if (/discount/i.test(body)) return "The price is near the bottom of today’s range.";
    return "The price is in the middle of today’s range.";
  }
  if (key === "day momentum") {
    const [d, w] = (body.match(/[+-]?\d+(\.\d+)?%/g) ?? []).map(x => parseFloat(x));
    if (d == null) return null;
    const word = (n: number) => `${n >= 0 ? "up" : "down"} ${Math.abs(n).toFixed(1)}%`;
    return `It’s ${word(d)} today${w != null ? ` and ${word(w)} over the past week` : ""}.`;
  }
  if (key === "volume") {
    const x = num(body);
    if (x == null) return null;
    return x >= 1.5 ? `More people than usual are trading it today (${x.toFixed(1)}× normal).`
      : x <= 0.7 ? `Fewer people than usual are trading it today (${x.toFixed(1)}× normal).`
      : "A normal number of people are trading it today.";
  }
  if (key === "vwap") return /above/i.test(body) ? "It’s trading above today’s average price — buyers have had the edge today." : /below/i.test(body) ? "It’s trading below today’s average price — sellers have had the edge today." : null;
  if (key.startsWith("ema")) return /bullish/i.test(p) ? "Its short-term trend is rising." : /bearish/i.test(p) ? "Its short-term trend is falling." : null;
  if (key === "obv") return /rising/i.test(body) ? "More shares have been bought than sold lately." : /falling/i.test(body) ? "More shares have been sold than bought lately." : null;
  if (key === "vix") {
    const v = num(body);
    return v == null ? null : v < 18 ? "The overall market is calm." : v < 25 ? "The overall market is a little nervous." : "The overall market is nervous.";
  }
  if (key.startsWith("sector")) return /bullish/i.test(body) ? "Its industry is doing well this week." : /bearish/i.test(body) ? "Its industry is struggling this week." : "Its industry is flat this week.";
  return null; // volume profile and other shorthand: no plain equivalent worth showing
}

export function WhyList({ points }: { points: string[] }) {
  const lines = [...new Set(points.map(plainPoint).filter((x): x is string => !!x))];
  if (!lines.length) return null;
  return (
    <div>
      <h3 className="text-[15px]">What we looked at</h3>
      <ul className="mt-2 space-y-1.5 text-[14px] text-[var(--mx-text-2)] list-disc pl-5">
        {lines.map(l => <li key={l}>{l}</li>)}
      </ul>
    </div>
  );
}

export function PlanWhy({ plan, side }: { plan: TradePlan; side: "BUY" | "SELL" }) {
  const rr = num(plan.rrRatio);
  const buy = side === "BUY";
  return (
    <div>
      <h3 className="text-[15px]">Why this plan</h3>
      <ul className="mt-2 space-y-1.5 text-[14px] text-[var(--mx-text-2)] list-disc pl-5">
        <li>{buy ? "Get in close to a price where buyers stepped in before." : "Get in close to a price where sellers stepped in before."}</li>
        <li>{buy ? "The safety level sits just below that price — if it falls through, the idea was wrong, so you get out with a small loss." : "The safety level sits just above that price — if it rises through, the idea was wrong, so you get out with a small loss."}</li>
        <li>{buy ? "The goal is near a recent high, where the price may stall." : "The goal is near a recent low, where the price may stall."}</li>
        {rr != null && <li>If it works, you could make about {rr.toFixed(1)}× what you risk.</li>}
      </ul>
    </div>
  );
}

export function PlainAnalysts({ symbol, price }: { symbol: string; price: number | null }) {
  const [d, setD] = useState<AnalystRatings | null | "none">(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/market/analyst-ratings?symbol=${encodeURIComponent(symbol)}`)
      .then(r => (r.ok ? r.json() : null)).then(j => { if (live) setD(j && !j.error ? j as AnalystRatings : "none"); })
      .catch(() => { if (live) setD("none"); });
    return () => { live = false; };
  }, [symbol]);
  if (d === null) return <div className="h-12 rounded bg-[var(--mx-raised)] animate-pulse" />;
  if (d === "none" || !d.breakdown) return null;
  const b = d.breakdown;
  const buy = b.strongBuy + b.buy, hold = b.hold, sell = b.sell + b.strongSell, total = buy + hold + sell;
  if (!total) return null;
  const up = d.targetMean && price ? (d.targetMean / price - 1) * 100 : null;
  return (
    <div>
      <h3 className="text-[15px]">What analysts say</h3>
      <div className="mt-2 flex h-1.5 max-w-[320px] rounded-full overflow-hidden bg-[var(--mx-raised-2)]" aria-hidden="true">
        <span style={{ width: `${(buy / total) * 100}%` }} className="bg-[var(--mx-up)]" />
        <span style={{ width: `${(hold / total) * 100}%` }} className="bg-[var(--mx-text-3)]" />
        <span style={{ width: `${(sell / total) * 100}%` }} className="bg-[var(--mx-down)]" />
      </div>
      <p className="mt-2 text-[14px] text-[var(--mx-text-2)]">Of {total} professional analysts, {buy} say buy, {hold} say hold and {sell} say sell.</p>
      {d.targetMean != null && (
        <p className="mt-1 text-[14px] text-[var(--mx-text-2)]">
          On average they expect {usd(d.targetMean)} in about a year
          {up != null ? ` — ${Math.abs(up).toFixed(1)}% ${up >= 0 ? "above" : "below"} today’s price` : ""}
          {d.targetLow != null && d.targetHigh != null ? ` (guesses range from ${usd(d.targetLow)} to ${usd(d.targetHigh)})` : ""}.
        </p>
      )}
      <p className="mt-1 text-[12.5px] text-[var(--mx-text-3)]">Opinions, not guarantees.</p>
    </div>
  );
}

export function PlainTechnicals({ symbol }: { symbol: string }) {
  const [t, setT] = useState<Technicals | null | "none">(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/market/technicals?symbol=${encodeURIComponent(symbol)}`)
      .then(r => (r.ok ? r.json() : null)).then(j => { if (live) setT(j && !j.error ? j as Technicals : "none"); })
      .catch(() => { if (live) setT("none"); });
    return () => { live = false; };
  }, [symbol]);
  if (t === null) return <div className="h-12 rounded bg-[var(--mx-raised)] animate-pulse" />;
  if (t === "none") return null;

  const lines: { text: string; mood: 1 | 0 | -1 }[] = [];
  if (t.aboveSma200 != null) lines.push(t.aboveSma200
    ? { text: "Over the past year, the price has been trending up.", mood: 1 }
    : { text: "Over the past year, the price has been trending down.", mood: -1 });
  if (t.aboveSma50 != null) lines.push(t.aboveSma50
    ? { text: "Over the past few months, it’s been rising.", mood: 1 }
    : { text: "Over the past few months, it’s been falling.", mood: -1 });
  if (t.rsiSignal) lines.push(t.rsiSignal === "overbought"
    ? { text: "It has gone up fast lately and may be due for a breather.", mood: -1 }
    : t.rsiSignal === "oversold"
      ? { text: "It has dropped fast lately and may be due for a bounce.", mood: 1 }
      : { text: "It hasn’t moved too fast in either direction lately.", mood: 0 });
  if (t.macdCross) lines.push(t.macdCross === "bullish"
    ? { text: "Its short-term momentum just turned upward.", mood: 1 }
    : t.macdCross === "bearish"
      ? { text: "Its short-term momentum just turned downward.", mood: -1 }
      : { text: "Its short-term momentum is steady.", mood: 0 });
  if (!lines.length) return null;
  const ups = lines.filter(l => l.mood > 0).length, downs = lines.filter(l => l.mood < 0).length;

  return (
    <div>
      <h3 className="text-[15px]">The price trend</h3>
      <ul className="mt-2 space-y-1.5 text-[14px] text-[var(--mx-text-2)]">
        {lines.map(l => (
          <li key={l.text} className="flex gap-2">
            <span aria-hidden="true" className={l.mood > 0 ? "text-[var(--mx-up)]" : l.mood < 0 ? "text-[var(--mx-down)]" : "text-[var(--mx-text-3)]"}>{l.mood > 0 ? "↑" : l.mood < 0 ? "↓" : "→"}</span>
            {l.text}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[13px] text-[var(--mx-text-3)]">{ups} {ups === 1 ? "sign points" : "signs point"} up, {downs} down. Based on the past year of daily prices.</p>
    </div>
  );
}
