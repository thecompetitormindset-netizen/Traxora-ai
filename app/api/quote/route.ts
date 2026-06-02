export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "AAPL.US";

  const finnhubKey = process.env.FINNHUB_API_KEY;
  const eodhdKey   = process.env.EODHD_API_KEY;
  const alphaKey   = process.env.ALPHA_VANTAGE_API_KEY;

  // Finnhub — real-time, licensed, reliable
  if (finnhubKey) {
    try {
      const fhSymbol = symbol.replace(/\.(US|COMM)$/, "");
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(fhSymbol)}&token=${finnhubKey}`,
        { cache: "no-store" },
      );
      const data = await res.json() as { c?: number; h?: number; l?: number; o?: number; pc?: number; t?: number };
      if (res.ok && data.c && data.c > 0) {
        return Response.json({
          provider:      "Finnhub",
          symbol:        fhSymbol,
          price:         data.c,
          previousClose: data.pc ?? null,
          open:          data.o  ?? null,
          high:          data.h  ?? null,
          low:           data.l  ?? null,
          exchange:      null,
          timestamp:     data.t  ?? null,
        });
      }
    } catch {
      // fall through
    }
  }

  // Yahoo Finance fallback — real-time when it works
  try {
    const yahooSymbol = symbol.replace(/\.(US|COMM)$/, "");
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=1d`,
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } },
    );
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const meta   = result?.meta;
    const quotes = result?.indicators?.quote?.[0];

    if (meta && meta.regularMarketPrice != null) {
      const opens: number[] = quotes?.open ?? [];
      const highs: number[] = quotes?.high ?? [];
      const lows:  number[] = quotes?.low  ?? [];
      return Response.json({
        provider:      "Yahoo Finance",
        symbol:        meta.symbol ?? yahooSymbol,
        price:         meta.regularMarketPrice,
        previousClose: meta.previousClose ?? meta.chartPreviousClose ?? null,
        open:          opens.filter(Boolean).at(-1) ?? meta.regularMarketOpen    ?? null,
        high:          highs.filter(Boolean).at(-1) ?? meta.regularMarketDayHigh ?? null,
        low:           lows.filter(Boolean).at(-1)  ?? meta.regularMarketDayLow  ?? null,
        exchange:      meta.exchangeName ?? null,
        timestamp:     meta.regularMarketTime ?? null,
      });
    }
  } catch {
    // fall through
  }

  // EODHD fallback (15-min delayed on free tier)
  if (eodhdKey) {
    try {
      const res = await fetch(
        `https://eodhd.com/api/real-time/${encodeURIComponent(symbol)}?api_token=${eodhdKey}&fmt=json`,
        { cache: "no-store" },
      );
      const raw = await res.text();
      if (res.ok) {
        let data: any;
        try { data = JSON.parse(raw); } catch { data = null; }
        if (data && !data.error && data.close != null) {
          return Response.json({
            provider:      "EODHD",
            symbol:        data.code ?? symbol,
            price:         data.close         ?? null,
            previousClose: data.previousClose ?? null,
            open:          data.open          ?? null,
            high:          data.high          ?? null,
            low:           data.low           ?? null,
            exchange:      data.exchange      ?? null,
            timestamp:     data.timestamp     ?? null,
          });
        }
      }
    } catch {
      // fall through
    }
  }

  // Alpha Vantage fallback
  if (alphaKey) {
    try {
      const alphaSymbol = symbol.replace(".US", "");
      const res = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(alphaSymbol)}&apikey=${alphaKey}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      const quote = data?.["Global Quote"];
      if (quote && quote["05. price"]) {
        return Response.json({
          provider:      "Alpha Vantage",
          symbol:        quote["01. symbol"] ?? alphaSymbol,
          price:         Number(quote["05. price"])        || null,
          previousClose: Number(quote["08. previous close"]) || null,
          open:          Number(quote["02. open"])         || null,
          high:          Number(quote["03. high"])         || null,
          low:           Number(quote["04. low"])          || null,
          exchange:      null,
          timestamp:     quote["07. latest trading day"]  ?? null,
        });
      }
    } catch {
      // fall through
    }
  }

  // All providers failed — return empty data rather than a 500
  return Response.json({ symbol, price: null, previousClose: null, open: null, high: null, low: null });
}
