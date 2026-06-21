export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

import { auth } from "@/auth";

export type FlowRow = {
  symbol:        string;
  price:         number | null;
  callVol:       number;
  putVol:        number;
  pcRatio:       number | null;      // putVol / callVol
  callOI:        number;
  putOI:         number;
  totalVol:      number;
  volOIRatio:    number | null;      // totalVol / (callOI + putOI) — higher = unusual
  ivAtm:         number | null;      // % e.g. 45.2
  bias:          "bullish" | "bearish" | "neutral";
  expiry:        string | null;
  dte:           number | null;
};

const UNIVERSE = [
  "AAPL","MSFT","NVDA","TSLA","AMZN","GOOGL","META","AMD","NFLX",
  "JPM","BAC","GS","V","MA",
  "LLY","UNH","PFE","ABBV",
  "XOM","CVX",
  "SPY","QQQ","IWM","GLD",
];

async function fetchFlow(symbol: string): Promise<FlowRow | null> {
  try {
    const res = await fetch(
      `https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(symbol)}.json`,
      {
        cache: "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer": "https://www.cboe.com/",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return null;

    const json = await res.json();
    const data = json?.data;
    if (!data?.current_price || !Array.isArray(data.options)) return null;

    const stockPrice: number = data.current_price;
    const symLen = symbol.length;
    const today  = new Date().toISOString().split("T")[0];

    function parseOpt(name: string): { expiry: string; type: "C"|"P"; strike: number } | null {
      const body = name.slice(symLen);
      const m = /^(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(body);
      if (!m) return null;
      return { expiry: `20${m[1]}-${m[2]}-${m[3]}`, type: m[4] as "C"|"P", strike: parseInt(m[5], 10) / 1000 };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts = (data.options as any[]).reduce<
      { expiry: string; type: "C"|"P"; strike: number; vol: number; oi: number; iv: number; bid: number; ask: number }[]
    >((acc, o) => {
      const p = parseOpt(o.option as string);
      if (!p || p.expiry <= today) return acc;
      acc.push({
        ...p,
        vol: (o.volume as number) || 0,
        oi:  (o.open_interest as number) || 0,
        iv:  (o.iv as number) || 0,
        bid: (o.bid as number) || 0,
        ask: (o.ask as number) || 0,
      });
      return acc;
    }, []);

    if (!opts.length) return null;

    // Pick nearest expiry with 7+ DTE for meaningful flow
    const expiries = [...new Set(opts.map(o => o.expiry))].sort();
    const nowMs    = Date.now();
    const chosenExp = expiries.find(e => new Date(e + "T20:00:00Z").getTime() - nowMs >= 7 * 86_400_000) ?? expiries[0];
    const dte       = Math.max(1, Math.ceil((new Date(chosenExp + "T20:00:00Z").getTime() - nowMs) / 86_400_000));
    const expFmt    = new Date(chosenExp + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const nearOpts = opts.filter(o => o.expiry === chosenExp);
    const calls    = nearOpts.filter(o => o.type === "C");
    const puts     = nearOpts.filter(o => o.type === "P");

    const callVol = calls.reduce((s, c) => s + c.vol, 0);
    const putVol  = puts.reduce((s, p) => s + p.vol, 0);
    const callOI  = calls.reduce((s, c) => s + c.oi, 0);
    const putOI   = puts.reduce((s, p) => s + p.oi, 0);
    const totalVol = callVol + putVol;
    const totalOI  = callOI + putOI;

    const pcRatio    = callVol > 0 ? parseFloat((putVol / callVol).toFixed(2)) : null;
    const volOIRatio = totalOI > 0 ? parseFloat((totalVol / totalOI).toFixed(3)) : null;

    // ATM IV
    const atmCall = calls
      .filter(c => c.iv > 0)
      .sort((a, b) => Math.abs(a.strike - stockPrice) - Math.abs(b.strike - stockPrice))[0];
    const ivAtm = atmCall ? parseFloat((atmCall.iv * 100).toFixed(1)) : null;

    const bias: FlowRow["bias"] = pcRatio === null ? "neutral"
      : pcRatio < 0.7 ? "bullish"
      : pcRatio > 1.4 ? "bearish"
      : "neutral";

    return {
      symbol, price: stockPrice, callVol, putVol, pcRatio, callOI, putOI,
      totalVol, volOIRatio, ivAtm, bias, expiry: expFmt, dte,
    };
  } catch { return null; }
}

function fmtVol(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
void fmtVol; // used by clients

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  void req;

  // Fetch in batches of 6 to avoid overwhelming CBOE
  const rows: FlowRow[] = [];
  const batchSize = 6;
  for (let i = 0; i < UNIVERSE.length; i += batchSize) {
    const batch = UNIVERSE.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(fetchFlow));
    for (const r of results) { if (r) rows.push(r); }
  }

  // Sort by vol/OI ratio descending — highest unusual activity first
  rows.sort((a, b) => (b.volOIRatio ?? 0) - (a.volOIRatio ?? 0));

  return Response.json({ rows, updatedAt: new Date().toISOString() });
}
