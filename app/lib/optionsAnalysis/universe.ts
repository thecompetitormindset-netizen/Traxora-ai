// The full options universe: every US-listed stock and fund that has listed
// options (CBOE's public symbol directory, ~5,300 names), with a cheap first
// check from Nasdaq's screener (one request for all stocks, one for ETFs):
// names whose shares barely trade can't pass the options liquidity rules, so
// they are answered without fetching their option chain.

import { UNIVERSE as POPULAR } from "@/app/api/market/options-scan/route";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const DAY = 24 * 3600_000;

// First check: a share price and daily trading volume below these means the
// options are too thinly traded for the rules (open interest, tight spreads).
export const MIN_PRICE = 5;
export const MIN_VOLUME = 250_000;

let symCache: { at: number; list: string[] } | null = null;
let volCache: { at: number; map: Map<string, { price: number | null; volume: number | null }> } | null = null;

/** Every symbol with listed options, per CBOE. Falls back to the popular list. */
export async function loadOptionableSymbols(): Promise<string[]> {
  if (symCache && Date.now() - symCache.at < DAY) return symCache.list;
  try {
    const r = await fetch("https://www.cboe.com/us/options/symboldir/equity_index_options/?download=csv", {
      cache: "no-store", redirect: "follow", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`CBOE ${r.status}`);
    const csv = await r.text();
    const set = new Set<string>();
    for (const line of csv.split("\n").slice(1)) {
      // "Company Name","SYMBOL",... — company names can contain commas, so read quoted fields.
      const cols = line.match(/"([^"]*)"/g)?.map(c => c.slice(1, -1).trim()) ?? [];
      const sym = (cols[1] ?? "").toUpperCase().replace("/", ".");
      if (/^[A-Z]{1,5}(\.[A-Z])?$/.test(sym)) set.add(sym);
    }
    if (set.size < 1000) throw new Error(`only ${set.size} symbols parsed`);
    symCache = { at: Date.now(), list: [...set] };
    return symCache.list;
  } catch (err) {
    console.error("[options-universe] CBOE directory unavailable:", err instanceof Error ? err.message : err);
    return [...POPULAR];
  }
}

type ScreenerRow = { symbol?: string; lastsale?: string; lastSalePrice?: string; volume?: string };
const num = (s?: string) => { const n = parseFloat((s ?? "").replace(/[$,]/g, "")); return Number.isFinite(n) ? n : null; };

/** Latest price and daily share volume for all US stocks and ETFs (Nasdaq). */
export async function loadLiquidity(): Promise<Map<string, { price: number | null; volume: number | null }>> {
  if (volCache && Date.now() - volCache.at < 6 * 3600_000) return volCache.map;
  const headers = { "User-Agent": UA, Accept: "application/json", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" };
  const get = async (url: string): Promise<ScreenerRow[]> => {
    try {
      const r = await fetch(url, { cache: "no-store", headers, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) return [];
      const d = await r.json() as { data?: { rows?: ScreenerRow[]; data?: { rows?: ScreenerRow[] } } };
      return d.data?.rows ?? d.data?.data?.rows ?? [];
    } catch { return []; }
  };
  const [stocks, etfs] = await Promise.all([
    get("https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&download=true"),
    get("https://api.nasdaq.com/api/screener/etf?tableonly=true&limit=10000&download=true"),
  ]);
  const map = new Map<string, { price: number | null; volume: number | null }>();
  for (const r of [...stocks, ...etfs]) {
    const s = (r.symbol ?? "").trim().toUpperCase().replace("/", ".");
    // ETF rows carry a price but no volume; those get the full check.
    if (s) map.set(s, { price: num(r.lastsale ?? r.lastSalePrice), volume: num(r.volume) });
  }
  if (map.size > 1000) volCache = { at: Date.now(), map };
  return map;
}

export type Universe = {
  /** Checked fully (option chain fetched), most-traded first; popular names lead. */
  deep: string[];
  /** Answered by the first check: shares trade too little or the price is too low. */
  thin: string[];
};

export async function buildUniverse(): Promise<Universe> {
  const [symbols, liq] = await Promise.all([loadOptionableSymbols(), loadLiquidity()]);
  const deep: { s: string; v: number }[] = [];
  const thin: string[] = [];
  for (const s of symbols) {
    const l = liq.get(s);
    // Not in Nasdaq's lists (indexes, some funds) → no basis to skip it; check fully.
    if (!l || l.price === null) { deep.push({ s, v: 0 }); continue; }
    if (l.price < MIN_PRICE || (l.volume !== null && l.volume < MIN_VOLUME)) { thin.push(s); continue; }
    if (l.volume === null) { deep.push({ s, v: 0 }); continue; }
    deep.push({ s, v: l.volume });
  }
  const popular = new Set<string>(POPULAR);
  deep.sort((a, b) => Number(popular.has(b.s)) - Number(popular.has(a.s)) || b.v - a.v);
  for (const p of POPULAR) if (!symbols.includes(p)) deep.unshift({ s: p, v: 0 });
  return { deep: [...new Set(deep.map(d => d.s))], thin };
}
