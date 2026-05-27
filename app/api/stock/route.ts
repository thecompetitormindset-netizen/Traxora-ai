export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "AAPL.US";
  const interval = searchParams.get("interval") || "d";

  const eodhdKey = process.env.EODHD_API_KEY;
  const alphaKey = process.env.ALPHA_VANTAGE_API_KEY;

  // 1) Try EODHD first
  if (eodhdKey) {
    try {
      const eodhdUrl =
        `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}` +
        `?api_token=${eodhdKey}` +
        `&fmt=json` +
        `&period=${interval}` +
        `&order=a`;

      const res = await fetch(eodhdUrl, { cache: "no-store" });
      const raw = await res.text();

      if (res.ok) {
        const data = JSON.parse(raw);

        if (Array.isArray(data) && data.length > 0) {
          const cleaned = data
            .map((item: any) => ({
              time: item.date,
              value: item.close,
            }))
            .filter((point: any) => point.time && point.value != null);

          return Response.json({
            provider: "EODHD",
            points: cleaned,
          });
        }
      }
    } catch {
      // fall through to Alpha Vantage
    }
  }

  // 2) Fallback to Alpha Vantage
  if (alphaKey) {
    try {
      const alphaSymbol = symbol.replace(/\.(US|COMM)$/, "");
      const alphaUrl =
        `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY` +
        `&symbol=${encodeURIComponent(alphaSymbol)}` +
        `&outputsize=compact` +
        `&apikey=${alphaKey}`;

      const res = await fetch(alphaUrl, { cache: "no-store" });
      const data = await res.json();

      const series = data?.["Time Series (Daily)"];
      if (series) {
        const cleaned = Object.entries(series)
          .map(([date, values]: [string, any]) => ({
            time: date,
            value: Number(values["4. close"]),
          }))
          .filter((point) => point.value != null)
          .sort((a, b) => a.time.localeCompare(b.time));

        if (cleaned.length > 0) {
          return Response.json({ provider: "Alpha Vantage", points: cleaned });
        }
      }
    } catch {
      // fall through to Yahoo Finance
    }
  }

  // 3) Free fallback: Yahoo Finance (no API key required)
  try {
    const yahooSymbol = symbol.replace(/\.(US|COMM)$/, "");
    const yahooUrl =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}` +
      `?interval=1d&range=1y`;

    const res = await fetch(yahooUrl, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const data = await res.json();

    const result = data?.chart?.result?.[0];
    const timestamps: number[] | undefined = result?.timestamp;
    const closes: number[] | undefined = result?.indicators?.quote?.[0]?.close;

    if (timestamps && closes && timestamps.length > 0) {
      const cleaned = timestamps
        .map((ts, i) => ({
          time: new Date(ts * 1000).toISOString().slice(0, 10),
          value: closes[i],
        }))
        .filter((p) => p.value != null);

      if (cleaned.length > 0) {
        return Response.json({ provider: "Yahoo Finance", points: cleaned });
      }
    }
  } catch {
    // fall through
  }

  return Response.json(
    { error: "All chart providers failed or are rate-limited" },
    { status: 500 },
  );
}
