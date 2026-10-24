import { viewer } from "@/app/lib/viewer";
import { marketQuote } from "@/app/lib/marketQuote";
export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 10;


const INDICES = [
  { symbol: "SPY",     label: "S&P 500"  },
  { symbol: "QQQ",     label: "NASDAQ"   },
  { symbol: "DIA",     label: "Dow"      },
  { symbol: "GLD",     label: "Gold"     },
  { symbol: "BTC-USD", label: "Bitcoin"  },
];

export type IndexRow = {
  symbol: string;
  label:  string;
  price:  number | null;
  change: number | null;
};

// Quotes come from marketQuote: Finnhub first, Yahoo as the fallback. Yahoo
// rate limits this deployment's address about two calls in three, so the four
// ETFs here now take the reliable path. BTC-USD is not on Finnhub's /quote, so
// it skips straight to Yahoo — which is the one symbol in this list that was
// always going to need it.

// The index list is fixed, so one slot is enough. Without this every dashboard
// load refetched all of them, which is a burst of requests per visitor for
// figures that barely move inside a minute.
let cache: { at: number; rows: IndexRow[] } | null = null;
const TTL = 60_000;

export async function GET() {
  const session = await viewer();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  if (cache && Date.now() - cache.at < TTL) return Response.json(cache.rows);

  const rows: IndexRow[] = await Promise.all(
    INDICES.map(async ({ symbol, label }) => {
      const q = await marketQuote(symbol, { yahooBudgetMs: 7_000 });
      return { symbol, label, price: q.price, change: q.change };
    }),
  );

  // Don't cache a pass where everything failed; that would hold an empty board
  // for a minute after a blip instead of retrying on the next visit.
  if (rows.some(r => r.price !== null)) cache = { at: Date.now(), rows };
  return Response.json(rows);
}
