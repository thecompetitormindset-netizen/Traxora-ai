export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim() || "";

  if (!query) return Response.json([]);

  try {
    const url =
      `https://query1.finance.yahoo.com/v1/finance/search` +
      `?q=${encodeURIComponent(query)}&lang=en-US&region=US&quotesCount=10&newsCount=0`;

    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return Response.json([]);

    const data = await res.json();
    const quotes: any[] = data?.quotes ?? [];

    const formatted = quotes
      .filter((q) => q.symbol && q.quoteType)
      .map((q) => ({
        code:     q.symbol as string,
        name:     (q.longname ?? q.shortname ?? q.symbol) as string,
        exchange: (q.exchDisp ?? q.exchange ?? "") as string,
        country:  "US",
        currency: "USD",
        type:     (q.typeDisp ?? q.quoteType ?? "") as string,
        symbol:   q.symbol as string,
        sector:   (q.sector ?? "") as string,
      }));

    return Response.json(formatted);
  } catch {
    return Response.json([]);
  }
}
