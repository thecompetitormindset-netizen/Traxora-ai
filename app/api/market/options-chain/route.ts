import { viewer } from "@/app/lib/viewer";
export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 20;


type Greek = {
  bid:    number | null;
  ask:    number | null;
  last:   number | null;
  iv:     number | null;   // percentage, e.g. 28.5
  delta:  number | null;
  gamma:  number | null;
  theta:  number | null;
  oi:     number | null;
  volume: number | null;
};

type ChainRow = {
  strike: number;
  call:   Greek;
  put:    Greek;
};

function toGreek(raw: Record<string, unknown> | undefined): Greek {
  if (!raw) return { bid: null, ask: null, last: null, iv: null, delta: null, gamma: null, theta: null, oi: null, volume: null };
  const n = (k: string) => (typeof raw[k] === "number" ? (raw[k] as number) : null);
  const rawIv = n("iv");
  return {
    bid:    n("bid"),
    ask:    n("ask"),
    last:   n("last"),
    iv:     rawIv !== null && rawIv > 0 ? parseFloat((rawIv * 100).toFixed(1)) : null,
    delta:  n("delta")  !== null ? parseFloat((n("delta") as number).toFixed(3))  : null,
    gamma:  n("gamma")  !== null ? parseFloat((n("gamma") as number).toFixed(4))  : null,
    theta:  n("theta")  !== null ? parseFloat((n("theta") as number).toFixed(4))  : null,
    oi:     n("open_interest"),
    volume: n("volume"),
  };
}

export async function GET(req: Request) {
  const session = await viewer();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const url    = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!symbol) return Response.json({ error: "Missing symbol" }, { status: 400 });

  const requestedExpiry = url.searchParams.get("expiry");

  try {
    const res = await fetch(
      `https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(symbol)}.json`,
      {
        cache: "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Referer":    "https://www.cboe.com/",
          "Accept":     "application/json",
        },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return Response.json({ error: `Options data unavailable (${res.status})` }, { status: 502 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = (await res.json())?.data;
    if (!data?.current_price || !Array.isArray(data.options)) {
      return Response.json({ error: "No options data for this symbol" }, { status: 404 });
    }

    const stockPrice: number = data.current_price;
    const symLen              = symbol.length;
    const today               = new Date().toISOString().split("T")[0];

    function parseOpt(name: string): { expiry: string; type: "C" | "P"; strike: number } | null {
      const body = name.slice(symLen);
      const m    = /^(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(body);
      if (!m) return null;
      return {
        expiry: `20${m[1]}-${m[2]}-${m[3]}`,
        type:   m[4] as "C" | "P",
        strike: parseInt(m[5], 10) / 1000,
      };
    }

    type ParsedOpt = { expiry: string; type: "C" | "P"; strike: number; raw: Record<string, unknown> };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = (data.options as any[]).reduce<ParsedOpt[]>((acc, opt) => {
      const p = parseOpt(opt.option as string);
      if (p && p.expiry > today) acc.push({ ...p, raw: opt as Record<string, unknown> });
      return acc;
    }, []);

    if (!parsed.length) return Response.json({ error: "No future-dated options found" }, { status: 404 });

    // All unique expiries sorted
    const expiries = [...new Set(parsed.map(o => o.expiry))].sort().slice(0, 16);

    // Prefer the requested expiry; otherwise pick 7+ DTE
    const nowMs = Date.now();
    const chosenExpiry =
      requestedExpiry && expiries.includes(requestedExpiry)
        ? requestedExpiry
        : expiries.find(e => new Date(e + "T20:00:00Z").getTime() - nowMs >= 7 * 86_400_000)
          ?? expiries[0];

    if (!chosenExpiry) return Response.json({ error: "No valid expiries" }, { status: 404 });

    const dte = Math.max(0, Math.ceil((new Date(chosenExpiry + "T20:00:00Z").getTime() - nowMs) / 86_400_000));

    // Build strike map for chosen expiry
    const strikeMap = new Map<number, { call?: ParsedOpt; put?: ParsedOpt }>();
    for (const opt of parsed.filter(o => o.expiry === chosenExpiry)) {
      const entry = strikeMap.get(opt.strike) ?? {};
      if (opt.type === "C") entry.call = opt;
      else                   entry.put  = opt;
      strikeMap.set(opt.strike, entry);
    }

    // Keep strikes within ±20% of price; fall back to all if too few
    const lo = stockPrice * 0.80, hi = stockPrice * 1.20;
    let strikes = [...strikeMap.keys()].sort((a, b) => a - b);
    const filtered = strikes.filter(s => s >= lo && s <= hi);
    if (filtered.length >= 8) strikes = filtered;

    const chain: ChainRow[] = strikes.map(strike => ({
      strike,
      call: toGreek(strikeMap.get(strike)?.call?.raw),
      put:  toGreek(strikeMap.get(strike)?.put?.raw),
    }));

    // Max OI across all rows for normalizing bar widths
    const maxOI = Math.max(
      1,
      ...chain.flatMap(r => [r.call.oi ?? 0, r.put.oi ?? 0]),
    );

    return Response.json({ symbol, price: stockPrice, expiry: chosenExpiry, expiries, dte, chain, maxOI });
  } catch {
    return Response.json(null);
  }
}
