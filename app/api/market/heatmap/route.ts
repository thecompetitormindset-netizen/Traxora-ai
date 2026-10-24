import { viewer } from "@/app/lib/viewer";
import { yahooFetch } from "@/app/lib/yahooFetch";
export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 15;


type Row = { symbol: string; price: number | null; change: number | null };

// Yahoo's v7/finance/quote endpoint now requires an auth cookie/crumb (401
// Unauthorized without one). The v8/finance/chart endpoint, used elsewhere in
// this app (technicals, indices, crypto-movers), still works unauthenticated
// per symbol — fan out to one chart call per requested symbol instead.
async function fetchQuote(symbol: string): Promise<Row> {
  try {
    const res = await yahooFetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
      { timeoutMs: 8_000, budgetMs: 11_000, label: symbol },
    );
    if (!res) return { symbol, price: null, change: null };
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const closes: number[] = (result?.indicators?.quote?.[0]?.close ?? []).filter((v: unknown) => typeof v === "number");
    if (closes.length === 0) return { symbol, price: null, change: null };

    const meta  = result?.meta ?? {};
    const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : closes[closes.length - 1];
    // Yesterday's close from the actual daily series — meta.chartPreviousClose is
    // the close before this whole range window, not necessarily yesterday's.
    const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null;
    const change    = prevClose && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : null;

    return { symbol, price, change: change !== null ? parseFloat(change.toFixed(2)) : null };
  } catch {
    return { symbol, price: null, change: null };
  }
}

// Keyed on the requested symbols, since the caller chooses them. Without this
// every heatmap render refetched the whole grid.
const cache = new Map<string, { at: number; rows: Row[] }>();
const TTL = 5 * 60_000;
const MAX_KEYS = 50;

export async function GET(req: Request) {
  const session = await viewer();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const url  = new URL(req.url);
  const syms = (url.searchParams.get("symbols") ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (syms.length === 0) return Response.json([], { status: 200 });

  const key = syms.join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.rows);

  const rows = await Promise.all(syms.map(fetchQuote));
  if (rows.some(r => r.price !== null)) {
    // The key comes from the query string, so the map is bounded and evicts
    // oldest-first rather than growing with whatever callers ask for.
    if (cache.size >= MAX_KEYS) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), rows });
  }
  return Response.json(rows);
}
