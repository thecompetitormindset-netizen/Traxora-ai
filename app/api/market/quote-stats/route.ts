export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 15;

import { auth } from "@/auth";
import { toYahooSymbol } from "@/app/lib/yahooSymbol";
import { getYahooCookie, YAHOO_UA } from "@/app/lib/yahooAuth";

export type QuoteStats = {
  symbol:        string;
  yearHigh:      number | null;
  yearLow:       number | null;
  marketCap:     number | null;
  avgVolume:     number | null;
  pe:            number | null;
  eps:           number | null;
  beta:          number | null;
  dividendYield: number | null;
};

function raw(obj: Record<string, unknown> | undefined, key: string): number | null {
  if (!obj) return null;
  const v = obj[key];
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "raw" in v) return (v as { raw?: number }).raw ?? null;
  return null;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const sym = (new URL(req.url).searchParams.get("symbol") ?? "").trim();
  if (!sym) return Response.json({ error: "Missing symbol" }, { status: 400 });

  const yahoo = toYahooSymbol(sym);

  try {
    const yAuth = await getYahooCookie();
    if (!yAuth) throw new Error("Yahoo auth failed");

    const res = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahoo)}` +
      `?modules=summaryDetail%2CdefaultKeyStatistics&crumb=${encodeURIComponent(yAuth.crumb)}`,
      {
        cache:   "no-store",
        headers: { "User-Agent": YAHOO_UA, Cookie: yAuth.cookie },
        signal:  AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) throw new Error(`Yahoo ${res.status}`);

    const json   = await res.json();
    const result = json?.quoteSummary?.result?.[0];
    if (!result) return Response.json({ error: "No data" }, { status: 404 });

    const sd = result.summaryDetail        as Record<string, unknown> ?? {};
    const ks = result.defaultKeyStatistics as Record<string, unknown> ?? {};

    const dyRaw = raw(sd, "dividendYield");
    const stats: QuoteStats = {
      symbol:        sym,
      yearHigh:      raw(sd, "fiftyTwoWeekHigh"),
      yearLow:       raw(sd, "fiftyTwoWeekLow"),
      marketCap:     raw(sd, "marketCap"),
      avgVolume:     raw(sd, "averageVolume"),
      pe:            raw(sd, "trailingPE"),
      eps:           raw(ks, "trailingEps"),
      beta:          raw(sd, "beta"),
      dividendYield: dyRaw != null ? dyRaw * 100 : null,
    };

    return Response.json(stats);
  } catch {
    return Response.json(null);
  }
}
