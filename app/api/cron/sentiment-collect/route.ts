export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 60;

import { cacheGet, cacheSet } from "../../../lib/sentiment";

const TICKERS = ["SPY","QQQ","AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","JPM"];
const LOCK_KEY = "cron:sentiment-collect:lock";
const RESULT_KEY = "cron:sentiment-collect:last";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prevent overlapping runs — lock for 12 minutes
  if (cacheGet(LOCK_KEY)) {
    return Response.json({ skipped: true, reason: "previous run still active" });
  }
  cacheSet(LOCK_KEY, true, 12 * 60 * 1_000);

  const started = Date.now();

  try {
    // Layer 1: Fetch Alpha Vantage news sentiment for major tickers
    const avKey = process.env.ALPHA_VANTAGE_API_KEY;
    let headlines: Array<{ title: string; ticker?: string; source?: string }> = [];

    if (avKey) {
      try {
        const tickerList = TICKERS.slice(0, 5).join(","); // AV free tier: 5 tickers
        const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${tickerList}&sort=LATEST&limit=50&apikey=${avKey}`;
        const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
        const d = await r.json();
        if (Array.isArray(d?.feed)) {
          headlines = (d.feed as Array<{ title?: string; source?: string; ticker_sentiment?: Array<{ ticker?: string }> }>)
            .slice(0, 50)
            .map(item => ({
              title:  item.title  ?? "",
              source: item.source ?? "",
              ticker: item.ticker_sentiment?.[0]?.ticker,
            }))
            .filter(h => h.title.length > 10);
        }
      } catch { /* AV down — continue with empty */ }
    }

    // Layer 1b: Yahoo Finance headlines for remaining tickers
    if (headlines.length < 20) {
      try {
        const yahooHeadlines = await Promise.allSettled(
          TICKERS.slice(5).map(async (sym) => {
            const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${sym}&newsCount=5&quotesCount=0`;
            const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5_000) });
            const d = await r.json();
            return ((d?.news ?? []) as Array<{ title?: string; publisher?: string }>)
              .map(n => ({ title: n.title ?? "", source: n.publisher ?? "", ticker: sym }));
          }),
        );
        for (const r of yahooHeadlines) {
          if (r.status === "fulfilled") headlines.push(...r.value);
        }
      } catch { /* Yahoo down */ }
    }

    if (headlines.length === 0) {
      return Response.json({ ok: false, reason: "No headlines collected", duration: Date.now() - started });
    }

    // Layer 2: Classify with Haiku (via internal endpoint)
    const classifyRes = await fetch(
      new URL("/api/sentiment/classify", req.url).toString(),
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ headlines: headlines.map(h => ({ text: h.title, ticker: h.ticker, source: h.source })) }),
        signal:  AbortSignal.timeout(25_000),
      },
    );

    let classified: Array<{ sentiment: string; confidence: number }> = [];
    if (classifyRes.ok) {
      const data = await classifyRes.json() as { classified: typeof classified };
      classified = data.classified ?? [];
    }

    const bullish = classified.filter(c => c.sentiment === "Bullish").length;
    const bearish = classified.filter(c => c.sentiment === "Bearish").length;
    const neutral = classified.length - bullish - bearish;

    const summary = {
      collected:  headlines.length,
      classified: classified.length,
      bullish,
      bearish,
      neutral,
      netSentimentScore: classified.length > 0 ? Math.round(((bullish - bearish) / classified.length) * 100) : 0,
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - started,
    };

    cacheSet(RESULT_KEY, summary, 60 * 60 * 1_000); // keep last run result 1h
    return Response.json({ ok: true, ...summary });
  } catch (err) {
    return Response.json({ ok: false, error: String(err), durationMs: Date.now() - started }, { status: 500 });
  }
}
