export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 12;

import { auth } from "@/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const url  = new URL(req.url);
  const syms = url.searchParams.get("symbols") ?? "";
  if (!syms) return Response.json([], { status: 200 });

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(syms)}&fields=regularMarketPrice,regularMarketChangePercent`,
      {
        cache:   "no-store",
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
        signal:  AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) throw new Error(`Yahoo ${res.status}`);

    const json = await res.json();
    const rows = (json?.quoteResponse?.result ?? []).map(
      (q: { symbol: string; regularMarketPrice?: number; regularMarketChangePercent?: number }) => ({
        symbol: q.symbol,
        price:  q.regularMarketPrice         ?? null,
        change: q.regularMarketChangePercent ?? null,
      }),
    );

    return Response.json(rows);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 502 });
  }
}
