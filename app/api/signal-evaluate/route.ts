export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/auth";
import { evaluate, type ResolvedPrediction, type EvalReport } from "@/app/lib/evaluate";

type IncomingSignal = {
  symbol:     string;
  signal:     "BUY" | "SELL";
  confidence: string;
  price:      number;
  time:       number;          // ms epoch
  score?:     number;
};

type DailyBar = { date: string; close: number };

// Fetch 1 year of daily bars from Yahoo Finance for a symbol.
// Returns sorted oldest-first array of { date: "YYYY-MM-DD", close }.
async function fetchBars(symbol: string): Promise<DailyBar[]> {
  try {
    const yahooSymbol = symbol.endsWith(".COMM")
      ? symbol.replace(/\.COMM$/, "") + "=F"
      : symbol.replace(/\.US$/, "");

    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=2y`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const closes: number[] = result?.indicators?.quote?.[0]?.close ?? [];

    return timestamps
      .map((ts, i) => ({
        date:  new Date(ts * 1000).toISOString().slice(0, 10),
        close: closes[i],
      }))
      .filter((b) => b.close != null && b.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

// Given bars and a signal timestamp, return the close price N trading days later.
// We use bar-array index distance (each bar = 1 trading day) so weekends/holidays
// are skipped automatically — the "T+3 trading days" you actually care about.
function exitPriceAt(bars: DailyBar[], signalMs: number, horizonTradingDays: number): number | null {
  const sigDate = new Date(signalMs).toISOString().slice(0, 10);
  // Find the first bar on or after the signal date
  const sigIdx = bars.findIndex((b) => b.date >= sigDate);
  if (sigIdx === -1) return null;
  const exitIdx = sigIdx + horizonTradingDays;
  return exitIdx < bars.length ? bars[exitIdx].close : null;
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let signals: IncomingSignal[] = [];
  try {
    const body = await req.json() as { signals: IncomingSignal[] };
    signals = Array.isArray(body.signals) ? body.signals : [];
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  // Only attempt to resolve signals that are old enough for the horizon
  const HORIZON = 3; // trading days
  const minAgeMs = HORIZON * 1.5 * 24 * 3600 * 1000; // 4.5 calendar days to be safe
  const resolvable = signals.filter((s) => Date.now() - s.time >= minAgeMs);

  if (resolvable.length === 0) {
    return Response.json({ resolved: [], report: null, message: "No signals old enough to evaluate yet (need ≥3 trading days)." });
  }

  // Fetch bars once per unique symbol (parallelised)
  const uniqueSymbols = [...new Set(resolvable.map((s) => s.symbol))];
  const barsMap = new Map<string, DailyBar[]>();
  await Promise.allSettled(
    uniqueSymbols.map(async (sym) => {
      const bars = await fetchBars(sym);
      if (bars.length > 0) barsMap.set(sym, bars);
    }),
  );

  // Resolve each signal against T+3 trading-day exit price
  const resolved: ResolvedPrediction[] = [];
  for (const sig of resolvable) {
    const bars = barsMap.get(sig.symbol);
    if (!bars) continue;

    const exitPrice = exitPriceAt(bars, sig.time, HORIZON);
    if (exitPrice == null) continue;

    const conf = (["High", "Medium", "Low"] as const).find((c) => c === sig.confidence) ?? "Low";
    resolved.push({
      symbol:      sig.symbol,
      timestamp:   sig.time,
      signal:      sig.signal,
      confidence:  conf,
      score:       sig.score ?? 0,
      entryPrice:  sig.price,
      exitPrice,
      horizonDays: HORIZON,
    });
  }

  const report: EvalReport | null = resolved.length >= 3 ? evaluate(resolved) : null;

  return Response.json({ resolved, report });
}
