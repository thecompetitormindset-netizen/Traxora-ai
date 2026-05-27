export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "AAPL.US";

  const eodhdKey = process.env.EODHD_API_KEY;
  const alphaKey = process.env.ALPHA_VANTAGE_API_KEY;

  // Try EODHD first
  if (eodhdKey) {
    try {
      const eodhdUrl =
        `https://eodhd.com/api/real-time/${encodeURIComponent(symbol)}` +
        `?api_token=${eodhdKey}&fmt=json`;

      const res = await fetch(eodhdUrl, { cache: "no-store" });
      const raw = await res.text();

      if (res.ok) {
        let data: any;

        try {
          data = JSON.parse(raw);
        } catch {
          data = null;
        }

        if (data && !data.error && data.close != null) {
          return Response.json({
            provider: "EODHD",
            symbol: data.code ?? symbol,
            price: data.close ?? null,
            previousClose: data.previousClose ?? null,
            open: data.open ?? null,
            high: data.high ?? null,
            low: data.low ?? null,
            exchange: data.exchange ?? null,
            timestamp: data.timestamp ?? null,
          });
        }
      }
    } catch {
      // ignore and fall through
    }
  }

  // Fallback to Alpha Vantage
  if (alphaKey) {
    try {
      const alphaSymbol = symbol.replace(".US", "");

      const alphaUrl =
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE` +
        `&symbol=${encodeURIComponent(alphaSymbol)}` +
        `&apikey=${alphaKey}`;

      const res = await fetch(alphaUrl, { cache: "no-store" });
      const data = await res.json();

      const quote = data?.["Global Quote"];

      if (quote && quote["05. price"]) {
        return Response.json({
          provider: "Alpha Vantage",
          symbol: quote["01. symbol"] ?? alphaSymbol,
          price: Number(quote["05. price"]) || null,
          previousClose: Number(quote["08. previous close"]) || null,
          open: Number(quote["02. open"]) || null,
          high: Number(quote["03. high"]) || null,
          low: Number(quote["04. low"]) || null,
          exchange: null,
          timestamp: quote["07. latest trading day"] ?? null,
        });
      }
    } catch {
      // ignore and return final error
    }
  }

  // Fallback to Yahoo Finance (no API key required)
  try {
    const yahooSymbol = symbol.replace(/\.(US|COMM)$/, "");
    const yahooUrl =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}` +
      `?interval=1d&range=5d`;

    const res = await fetch(yahooUrl, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const data = await res.json();

    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    const quotes = result?.indicators?.quote?.[0];

    if (meta && meta.regularMarketPrice != null) {
      const opens: number[] = quotes?.open ?? [];
      const highs: number[] = quotes?.high ?? [];
      const lows: number[] = quotes?.low ?? [];

      return Response.json({
        provider: "Yahoo Finance",
        symbol: meta.symbol ?? yahooSymbol,
        price: meta.regularMarketPrice,
        previousClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
        open: opens.filter(Boolean).at(-1) ?? null,
        high: highs.filter(Boolean).at(-1) ?? null,
        low: lows.filter(Boolean).at(-1) ?? null,
        exchange: meta.exchangeName ?? null,
        timestamp: meta.regularMarketTime ?? null,
      });
    }
  } catch {
    // fall through
  }

  return Response.json(
    { error: "Could not fetch quote from available providers", symbol },
    { status: 500 },
  );
}
