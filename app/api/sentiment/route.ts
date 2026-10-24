export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

import { cacheGet, cacheSet } from "../../lib/sentiment";
import { changePctOrZero } from "@/app/lib/quoteSanity";
import { fullQuote } from "@/app/lib/marketQuote";
import { vixQuote } from "@/app/lib/vixQuote";

const CACHE_KEY = "sentiment:market-data";
const CACHE_TTL = 15 * 60 * 1_000; // 15 minutes

// ── Helpers ────────────────────────────────────────────────────────────────

function momentum5d(closes: number[]): number {
  const v = closes.filter(Boolean);
  if (v.length < 2) return 0;
  return ((v.at(-1)! - v[0]) / v[0]) * 100;
}

function vixTermStructure(vix: number, prevVix: number): "contango" | "backwardation" | "flat" {
  const diff = vix - prevVix;
  if (diff >  0.5) return "backwardation"; // spot > future = fear spiking
  if (diff < -0.5) return "contango";      // spot < future = calm
  return "flat";
}

function vixToFG(vix: number): number {
  if (vix < 12) return 92;
  if (vix < 15) return 78;
  if (vix < 18) return 63;
  if (vix < 20) return 52;
  if (vix < 25) return 40;
  if (vix < 30) return 26;
  if (vix < 40) return 14;
  return 5;
}

function scoreLabel(s: number) {
  if (s >= 80) return { label: "Extreme Greed", color: "emerald" };
  if (s >= 60) return { label: "Greed",         color: "green"   };
  if (s >= 40) return { label: "Neutral",        color: "amber"   };
  if (s >= 20) return { label: "Fear",           color: "orange"  };
  return            { label: "Extreme Fear",     color: "rose"    };
}

function sentimentRegime(score: number): string {
  if (score >= 65) return "Risk-On";
  if (score >= 45) return "Transitional";
  return "Risk-Off";
}

// Derive a put/call proxy from VIX momentum:
// VIX rising fast = investors buying more puts = put/call high
function putCallProxy(vixChg: number): { value: number; avg: number; interpretation: string } {
  const value = Math.max(0.4, Math.min(2.5, 1.0 + vixChg * 0.04));
  const avg   = 0.85;
  const interpretation =
    value > 1.2 ? "Elevated put buying — defensive hedging" :
    value < 0.7 ? "Call dominant — speculative bullishness" :
    "Balanced options flow";
  return { value: +value.toFixed(2), avg, interpretation };
}

// Fetch Alpha Vantage news sentiment for market headlines
async function fetchAVNews(): Promise<Array<{ title: string; source: string; sentiment: string; score: number }>> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return [];
  try {
    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=financial_markets,economy_macro&sort=LATEST&limit=20&apikey=${key}`;
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    const d = await r.json();
    if (!Array.isArray(d?.feed)) return [];
    return (d.feed as Array<{ title?: string; source?: string; overall_sentiment_label?: string; overall_sentiment_score?: number }>)
      .slice(0, 20)
      .map(item => ({
        title:     item.title     ?? "",
        source:    item.source    ?? "",
        sentiment: item.overall_sentiment_label ?? "Neutral",
        score:     typeof item.overall_sentiment_score === "number" ? item.overall_sentiment_score : 0,
      }));
  } catch { return []; }
}

// Finnhub general market news — used when Alpha Vantage key is not configured
async function fetchFinnhubNews(): Promise<Array<{ title: string; source: string; sentiment: string; score: number }>> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];
  try {
    const url = `https://finnhub.io/api/v1/news?category=general&token=${key}`;
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    const d = await r.json() as Array<{ headline?: string; source?: string }>;
    if (!Array.isArray(d)) return [];
    return d.slice(0, 20)
      .filter(item => item.headline)
      .map(item => ({
        title:     item.headline!,
        source:    item.source ?? "Finnhub",
        sentiment: "Neutral", // Finnhub doesn't pre-score sentiment; Haiku will classify
        score:     0,
      }));
  } catch { return []; }
}

// ── Main handler ───────────────────────────────────────────────────────────

export async function GET() {
  const cached = cacheGet<object>(CACHE_KEY);
  if (cached) return Response.json(cached);

  try {
    // The three ETFs go through fullQuote, which prefers Finnhub for the price
    // and still returns the Yahoo close series the 5-day momentum term needs —
    // so their changes stay right even when Yahoo is shut out, and only the
    // momentum term degrades.
    const [vixData, spy, qqq, iwm, avItems] = await Promise.all([
      // VIX no longer depends on Yahoo. vixQuote tries FRED when a key is set,
      // then Cboe — which publishes VIX and answered keylessly in 448ms — and
      // only then Yahoo. This route returned 503 without VIX, so at Yahoo's
      // roughly one-in-six it was down most of the time.
      vixQuote(),
      fullQuote("SPY", { range: "6d", yahooBudgetMs: 12_000 }),
      fullQuote("QQQ", { range: "6d", yahooBudgetMs: 12_000 }),
      fullQuote("IWM", { range: "6d", yahooBudgetMs: 12_000 }),
      fetchAVNews(),
    ]);
    const newsItems = avItems.length > 0 ? avItems : await fetchFinnhubNews();

    const vix      = vixData?.level;
    // Null when no source stated a previous close. It is never substituted
    // from a `close` field, so term structure degrades to "flat" rather than
    // reporting a direction that was inferred from the current level.
    const prevVix  = vixData?.previousClose ?? undefined;
    const vixChg   = vix != null ? changePctOrZero(vix, prevVix ?? null) : 0;

    const spyPrice = spy?.price;
    const spyChg   = spy?.changePercent ?? 0;

    const qqqPrice = qqq?.price;
    const qqqChg   = qqq?.changePercent ?? 0;

    const iwmPrice = iwm?.price;
    const iwmChg   = iwm?.changePercent ?? 0;

    if (vix == null) {
      return Response.json({ error: "Market data unavailable" }, { status: 503 });
    }

    // Fear & Greed composite
    const fgBase   = vixToFG(vix);
    const fgMomentum = Math.max(-12, Math.min(12, momentum5d(spy?.closes ?? []) * 2.5));
    const newsAvg  = newsItems.length > 0
      ? newsItems.reduce((s, n) => s + n.score, 0) / newsItems.length
      : 0;
    const fgNews   = Math.round(newsAvg * 50 + 50);
    const fearGreed = Math.round(Math.max(0, Math.min(100, fgBase * 0.60 + (fgBase + fgMomentum) * 0.30 + fgNews * 0.10)));

    // Overall score on -100 to +100 scale
    const overallScore = Math.round((fearGreed - 50) * 2);

    const { label, color } = scoreLabel(fearGreed);
    const regime = sentimentRegime(fearGreed);
    const termStructure = prevVix != null ? vixTermStructure(vix, prevVix) : "flat";
    const pcProxy = putCallProxy(vixChg);

    // Individual component inputs (each 0–100) so the dashboard widget
    // can show the actual math rather than just the composite output.
    const vixInput      = vixToFG(vix);                                                    // VIX  → 0-100
    const momentumInput = Math.round(Math.max(0, Math.min(100, 50 + momentum5d(spy?.closes ?? []) * 5))); // trend → 0-100
    const newsInput     = fgNews;                                                           // news → 0-100

    const payload = {
      // Legacy fields (keeps SentimentWidget working)
      score:    fearGreed,
      label,
      color,
      vix:      vix     ? +vix.toFixed(2)      : null,
      vixChange: vixChg ? +vixChg.toFixed(2)   : null,
      spyPrice:  spyPrice ? +spyPrice.toFixed(2) : null,
      spyChange: spyChg   ? +spyChg.toFixed(2)  : null,

      // Extended fields (for the Pulse page)
      overallScore,
      fearGreed,
      regime,
      qqqPrice:  qqqPrice  ? +qqqPrice.toFixed(2) : null,
      qqqChange: qqqChg    ? +qqqChg.toFixed(2)   : null,
      iwmPrice:  iwmPrice  ? +iwmPrice.toFixed(2) : null,
      iwmChange: iwmChg    ? +iwmChg.toFixed(2)   : null,
      vixTermStructure: termStructure,
      // Which source supplied VIX, so a fall-through is visible in the
      // response rather than only in the logs. "yahoo" means both preferred
      // sources failed; absent term structure means none stated a previous
      // close, rather than that the curve is genuinely flat.
      vixSource: vixData?.source ?? null,
      putCallProxy:     pcProxy,
      topHeadlines: newsItems.slice(0, 10).map(n => ({
        title:     n.title,
        source:    n.source,
        sentiment: n.sentiment,
        score:     n.score,
      })),
      newsCount: newsItems.length,
      fetchedAt: Date.now(),

      // Component breakdown — used by the dashboard widget to show the math
      breakdown: {
        vixInput,
        momentumInput,
        newsInput,
        weights: { vix: 60, momentum: 30, news: 10 },
      },
    };

    cacheSet(CACHE_KEY, payload, CACHE_TTL);
    return Response.json(payload);
  } catch {
    return Response.json({ error: "Sentiment fetch failed" }, { status: 500 });
  }
}
