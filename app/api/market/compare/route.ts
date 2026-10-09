export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 20;

import { viewer } from "@/app/lib/viewer";

// One stock's facts for the Compare page, from public sources that answer
// without an API key:
//   - Nasdaq: company name, sector, size, 1-year range, dividend, average
//     volume, the last four quarters of earnings, analyst counts and targets.
//   - Yahoo chart (no login needed): latest price and one year of daily
//     closes, used to measure how much the stock moves vs the S&P 500 (beta).
// Profit per share = sum of the last four reported quarters; P/E = price ÷ that.
// Anything a source doesn't give is null and shown as "Not available" —
// never estimated.

export type CompareStats = {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  price: number | null;
  prevClose: number | null;
  priceTime: number | null;     // ms
  marketCap: number | null;
  avgVolume: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  dividendYield: number | null; // percent, e.g. 0.32
  epsTTM: number | null;
  pe: number | null;
  beta: number | null;
  analysts: { buy: number; hold: number; sell: number } | null;
  target: { mean: number; low: number | null; high: number | null } | null;
  sources: string[];
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const cache = new Map<string, { at: number; data: CompareStats }>();
const TTL = 20 * 60_000;

const money = (s: unknown): number | null => {
  if (typeof s !== "string") return typeof s === "number" && Number.isFinite(s) ? s : null;
  const n = parseFloat(s.replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

async function getJSON<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    return await r.json() as T;
  } catch { return null; }
}

type NasdaqWrap<T> = { data: T | null };
type SummaryData = { summaryData?: Record<string, { value?: string }> };
type InfoData = { companyName?: string };
type EpsData = { earningsPerShare?: Array<{ type: string; earnings: number }> };
type TargetData = { consensusOverview?: { priceTarget?: number; lowPriceTarget?: number; highPriceTarget?: number; buy?: number; hold?: number; sell?: number } };
type Chart = { chart?: { result?: Array<{ events?: { dividends?: Record<string, { amount?: number; date?: number }> }; meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number; regularMarketTime?: number; longName?: string; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number }; indicators?: { quote?: Array<{ close?: (number | null)[] }> }; timestamp?: number[] }> } };

const nasdaq = <T,>(path: string) => getJSON<NasdaqWrap<T>>(`https://api.nasdaq.com/api/${path}`, { Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" });
// Yahoo rejects full browser user agents on this endpoint (429) but serves a plain one.
const chart = (sym: string, range: string) => getJSON<Chart>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=${range}&events=div`, { "User-Agent": "Mozilla/5.0" });

function dailyReturns(c: Chart | null): Map<number, number> {
  const r = c?.chart?.result?.[0];
  const ts = r?.timestamp ?? [], cl = r?.indicators?.quote?.[0]?.close ?? [];
  const out = new Map<number, number>();
  for (let i = 1; i < ts.length; i++) {
    const a = cl[i - 1], b = cl[i];
    if (a && b) out.set(Math.floor(ts[i] / 86400), b / a - 1);
  }
  return out;
}

/** Beta = cov(stock, market) / var(market) over matching trading days. */
function beta(stock: Map<number, number>, market: Map<number, number>): number | null {
  const pairs: [number, number][] = [];
  for (const [d, r] of stock) { const m = market.get(d); if (m != null) pairs.push([r, m]); }
  if (pairs.length < 120) return null;
  const ms = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
  const mm = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
  let cov = 0, v = 0;
  for (const [s, m] of pairs) { cov += (s - ms) * (m - mm); v += (m - mm) ** 2; }
  return v > 0 ? Math.round((cov / v) * 100) / 100 : null;
}

async function load(symbol: string): Promise<CompareStats> {
  const s = symbol.toLowerCase();
  const [info, summary, eps, target, c1y, spy] = await Promise.all([
    nasdaq<InfoData>(`quote/${s}/info?assetclass=stocks`),
    nasdaq<SummaryData>(`quote/${s}/summary?assetclass=stocks`),
    nasdaq<EpsData>(`quote/${s}/eps`),
    nasdaq<TargetData>(`analyst/${s}/targetprice`),
    chart(symbol, "1y"),
    chart("SPY", "1y"),
  ]);

  const sd = summary?.data?.summaryData ?? {};
  const v = (k: string) => sd[k]?.value;
  const meta = c1y?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice ?? null;

  const [hiS, loS] = (v("FiftTwoWeekHighLow") ?? "").split("/");
  const yearHigh = money(hiS) ?? meta?.fiftyTwoWeekHigh ?? null;
  const yearLow = money(loS) ?? meta?.fiftyTwoWeekLow ?? null;

  const past = (eps?.data?.earningsPerShare ?? []).filter(e => e.type === "PreviousQuarter").slice(-4);
  const epsTTM = past.length === 4 ? Math.round(past.reduce((t, e) => t + e.earnings, 0) * 100) / 100 : null;
  const pe = price && epsTTM && epsTTM > 0 ? Math.round((price / epsTTM) * 10) / 10 : null;

  const co = target?.data?.consensusOverview;
  const counts = co && (co.buy ?? 0) + (co.hold ?? 0) + (co.sell ?? 0) > 0 ? { buy: co.buy ?? 0, hold: co.hold ?? 0, sell: co.sell ?? 0 } : null;

  const name = info?.data?.companyName?.replace(/\s+(Common Stock|Class [A-C] Common Stock|Ordinary Shares|American Depositary Shares).*$/i, "") ?? meta?.longName ?? null;
  // Dividend: Nasdaq's yield, else the past year's payments ÷ price.
  const paid = Object.values(c1y?.chart?.result?.[0]?.events?.dividends ?? {}).reduce((t, d) => t + (d.amount ?? 0), 0);
  const yieldPct = money(v("Yield")) ?? (price ? (paid > 0 ? Math.round((paid / price) * 10000) / 100 : 0) : null);

  const sources: string[] = [];
  if (summary?.data || eps?.data || target?.data) sources.push("Nasdaq");
  if (meta) sources.push("Yahoo Finance prices");

  return {
    symbol: symbol.toUpperCase(),
    name,
    sector: v("Sector") && v("Sector") !== "N/A" ? v("Sector")! : null,
    industry: v("Industry") && v("Industry") !== "N/A" ? v("Industry")! : null,
    price,
    // The session before the latest one, from the daily closes (Nasdaq's
    // "previous close" rolls over after hours and would show a 0% day).
    prevClose: (() => { const cl = (c1y?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter((x): x is number => typeof x === "number"); return cl.length >= 2 ? cl[cl.length - 2] : money(v("PreviousClose")); })(),
    priceTime: meta?.regularMarketTime ? meta.regularMarketTime * 1000 : null,
    marketCap: money(v("MarketCap")),
    avgVolume: money(v("AverageVolume")),
    yearHigh, yearLow,
    dividendYield: yieldPct != null && yieldPct > 0 ? yieldPct : yieldPct === 0 ? 0 : null,
    epsTTM, pe,
    beta: beta(dailyReturns(c1y), dailyReturns(spy)),
    analysts: counts,
    target: co?.priceTarget ? { mean: co.priceTarget, low: co.lowPriceTarget ?? null, high: co.highPriceTarget ?? null } : null,
    sources,
  };
}

export async function GET(req: Request) {
  await viewer();
  const raw = (new URL(req.url).searchParams.get("symbol") ?? "").trim().toUpperCase().replace(/\.US$/, "");
  if (!/^[A-Z][A-Z.\-]{0,9}$/.test(raw)) return Response.json({ error: "Enter a US stock ticker, like AAPL." }, { status: 400 });

  const hit = cache.get(raw);
  if (hit && Date.now() - hit.at < TTL) return Response.json(hit.data);

  const data = await load(raw);
  if (!data.price && !data.marketCap) return Response.json({ error: `We couldn't find ${raw}. Check the ticker.` }, { status: 404 });
  cache.set(raw, { at: Date.now(), data });
  return Response.json(data);
}
