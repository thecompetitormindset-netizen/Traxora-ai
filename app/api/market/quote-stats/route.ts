export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 10;

import { auth } from "@/auth";
import { toYahooSymbol } from "@/app/lib/yahooSymbol";

export type QuoteStats = {
  symbol:       string;
  yearHigh:     number | null;
  yearLow:      number | null;
  marketCap:    number | null;  // raw dollars
  avgVolume:    number | null;
  pe:           number | null;
  eps:          number | null;
  beta:         number | null;
  dividendYield:number | null;
};

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const sym = (new URL(req.url).searchParams.get("symbol") ?? "").trim();
  if (!sym) return Response.json({ error: "Missing symbol" }, { status: 400 });

  const yahoo = toYahooSymbol(sym);

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahoo)}&fields=fiftyTwoWeekHigh,fiftyTwoWeekLow,marketCap,averageDailyVolume10Day,trailingPE,epsTrailingTwelveMonths,beta,dividendYield`,
      {
        cache:   "no-store",
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
        signal:  AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) throw new Error(`Yahoo ${res.status}`);

    const json = await res.json();
    const q    = json?.quoteResponse?.result?.[0];
    if (!q) return Response.json({ error: "No data" }, { status: 404 });

    const stats: QuoteStats = {
      symbol:        sym,
      yearHigh:      q.fiftyTwoWeekHigh              ?? null,
      yearLow:       q.fiftyTwoWeekLow               ?? null,
      marketCap:     q.marketCap                     ?? null,
      avgVolume:     q.averageDailyVolume10Day        ?? null,
      pe:            q.trailingPE                    ?? null,
      eps:           q.epsTrailingTwelveMonths        ?? null,
      beta:          q.beta                          ?? null,
      dividendYield: q.dividendYield != null ? q.dividendYield * 100 : null,
    };

    return Response.json(stats);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 502 });
  }
}
