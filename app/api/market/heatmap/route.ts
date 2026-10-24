import { viewer } from "@/app/lib/viewer";
import { marketQuotes } from "@/app/lib/marketQuote";
export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 15;


type Row = { symbol: string; price: number | null; change: number | null };

// Quotes come from marketQuote: Finnhub first, Yahoo as the fallback. Yahoo
// rate limits this deployment's address about two calls in three, and this
// route fans out over whatever symbols the caller asks for, so it was the
// worst-affected of the three. Finnhub's free tier is a per-minute budget
// rather than a burst limit, which suits one cached pass every five minutes.

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

  const quotes = await marketQuotes(syms, { yahooBudgetMs: 11_000 });
  const rows: Row[] = quotes.map(q => ({ symbol: q.symbol, price: q.price, change: q.change }));

  if (rows.some(r => r.price !== null)) {
    // The key comes from the query string, so the map is bounded and evicts
    // oldest-first rather than growing with whatever callers ask for.
    if (cache.size >= MAX_KEYS) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), rows });
  }
  return Response.json(rows);
}
