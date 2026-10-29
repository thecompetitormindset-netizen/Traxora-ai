export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 15;

import { marketQuotes } from "@/app/lib/marketQuote";
import { nyseSessionStatus } from "@/app/lib/marketTime";

// A few index prices for the landing page, which anyone can see.
//
// Every other market route in this app is behind a session. This one cannot
// be, because the page it feeds is the first thing a visitor sees — and that
// changes the economics completely. An authenticated route's load is bounded
// by how many accounts exist; a public one's is bounded by how much traffic
// arrives, which is not a number anyone controls.
//
// So the payload is computed at most once a minute and everyone is served the
// same copy. A hundred visitors in that minute cost exactly what one does. The
// cache is also what makes this safe to leave public: without it, a page
// refresh would be an upstream API call, and the free tiers this runs on would
// be gone in an afternoon.
//
// Prices are delayed. The response says so rather than leaving the page to
// imply otherwise — the landing copy already tells visitors prices run about
// fifteen minutes behind, and a live-looking widget must not quietly contradict
// it.

const INDICES = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq" },
  { symbol: "DIA", label: "Dow" },
];

export type PulseRow = { symbol: string; label: string; price: number | null; change: number | null };

export type MarketPulse = {
  rows: PulseRow[];
  asOf: string;
  marketOpen: boolean;
  sessionDetail: string;
  /** False when nothing could be fetched, so the page can stay quiet instead of showing blanks. */
  available: boolean;
};

const TTL = 60_000;
let cache: { at: number; data: MarketPulse } | null = null;

/**
 * One in-flight refresh at a time.
 *
 * Without this, the first requests after the cache expires all miss together
 * and each starts its own fetch — the stampede that caching is supposed to
 * prevent, happening precisely when traffic is highest. Latecomers wait on the
 * first refresh instead of starting another.
 */
let inFlight: Promise<MarketPulse> | null = null;

async function refresh(): Promise<MarketPulse> {
  const quotes = await marketQuotes(INDICES.map(i => i.symbol), { yahooBudgetMs: 8_000 });
  const session = nyseSessionStatus();

  const rows: PulseRow[] = INDICES.map((idx, i) => ({
    symbol: idx.symbol,
    label: idx.label,
    price: quotes[i]?.price ?? null,
    change: quotes[i]?.change ?? null,
  }));

  return {
    rows,
    asOf: new Date().toISOString(),
    marketOpen: session.status === "OPEN",
    sessionDetail: session.detail,
    available: rows.some(r => r.price !== null),
  };
}

export async function GET() {
  const now = Date.now();

  if (cache && now - cache.at < TTL) {
    return Response.json(cache.data, { headers: { "Cache-Control": "public, s-maxage=60" } });
  }

  try {
    inFlight ??= refresh().finally(() => { inFlight = null; });
    const data = await inFlight;

    // A pass where nothing arrived is not cached: holding an empty board for a
    // minute after one blip is worse than trying again on the next visit.
    if (data.available) cache = { at: Date.now(), data };

    return Response.json(data, { headers: { "Cache-Control": "public, s-maxage=60" } });
  } catch {
    // Serving the last good copy beats serving nothing, even past its minute.
    if (cache) {
      return Response.json(cache.data, { headers: { "Cache-Control": "public, s-maxage=60" } });
    }
    return Response.json(
      { rows: [], asOf: new Date().toISOString(), marketOpen: false, sessionDetail: "", available: false } satisfies MarketPulse,
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
