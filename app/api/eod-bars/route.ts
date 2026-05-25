export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "AAPL.US";

  const apiKey = process.env.EODHD_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Missing EODHD_API_KEY" }, { status: 500 });
  }

  const url =
    `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}` +
    `?api_token=${apiKey}` +
    `&fmt=json` +
    `&order=a`;

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    return Response.json({ error: "Failed to fetch bars" }, { status: 500 });
  }

  const data = await res.json();

  const cleaned = Array.isArray(data)
    ? data
        .map((item: any) => ({
          date: item.date,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume,
        }))
        .filter(
          (item: any) =>
            item.date &&
            item.open != null &&
            item.high != null &&
            item.low != null &&
            item.close != null &&
            item.volume != null,
        )
    : [];

  return Response.json(cleaned);
}
