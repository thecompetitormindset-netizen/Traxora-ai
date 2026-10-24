// How a scanned symbol is assembled and ranked.
//
// Pure on purpose, so the scoring can be tested without network access — the
// route around it is all I/O.
//
// The reason this is separated at all: every ranking input used to come from
// Yahoo, which answers about one request in nine from the deployment, and a
// missing volume ratio defaulted to 1. An unknown symbol therefore scored as
// though it had exactly average volume, which is three fabricated points in a
// ranking people act on. Price and change now come from Finnhub, which
// answers; volume and the 52-week range stay with Yahoo; and a row that only
// got the first half says so rather than borrowing a neutral value for the
// second.

import { computeChangePct } from "./quoteSanity";

/** Price and change — the half that has to work. */
export type ScanBase = {
  price: number;
  previousClose: number;
  changePercent: number;
  open: number | null;
  high: number | null;
  low: number | null;
};

/** The ranking inputs — the half that often will not. */
export type ScanEnrichment = {
  name: string | null;
  price: number | null;
  previousClose: number | null;
  volume: number | null;
  avgVolume: number | null;
  high52w: number | null;
  low52w: number | null;
  marketCap: number | null;
  history5d: number[];
  open: number | null;
  high: number | null;
  low: number | null;
};

export interface StockData {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  open: number | null;
  high: number | null;
  low: number | null;
  changePercent: number;
  volume: number | null;
  avgVolume: number | null;
  high52w: number | null;
  low52w: number | null;
  marketCap: number | null;
  history5d: number[];
  news: { title: string; publisher: string; age: string }[];
  /**
   * Null when the volume history could not be fetched. It used to default to
   * 1, which scored every unknown symbol as though it had average volume.
   */
  volumeRatio: number | null;
  yearRangePct: number | null;
  /** True when the ranking inputs are present, so this row is fully scored. */
  enriched: boolean;
  score: number;
}

/** Caps the volume term so a single misprinted volume cannot dominate. */
export const MAX_VOLUME_SURGE = 10;

/**
 * The ranking score.
 *
 * A row without volume history contributes no volume term rather than a
 * neutral one, so it can still rank on a large move but cannot borrow points
 * for data nobody has. A fully enriched row therefore has more ways to score
 * than a bare one — intended, since it has more evidence behind it, and the
 * reason the caller is told how many rows are bare.
 */
export function scoreOf(
  s: Pick<StockData, "volumeRatio" | "changePercent" | "yearRangePct">,
): number {
  const volSurge = s.volumeRatio === null ? 0 : Math.min(s.volumeRatio, MAX_VOLUME_SURGE);
  const momentum = Math.abs(s.changePercent);
  // Near a 52-week extreme is the setup this scanner is looking for.
  const extremeBonus =
    s.yearRangePct != null && (s.yearRangePct <= 15 || s.yearRangePct >= 85) ? 4 : 0;
  return volSurge * 3 + momentum * 2 + extremeBonus;
}

/**
 * Merge the two halves into a row, or null if neither source had a price.
 *
 * Finnhub's price wins where both arrive: it is the live leg, and Yahoo's copy
 * may be a cached or older print.
 */
export function buildRow(
  symbol: string,
  base: ScanBase | null,
  extra: ScanEnrichment | null,
): StockData | null {
  const price = base?.price ?? extra?.price ?? null;
  if (price === null) return null;

  const previousClose = base?.previousClose ?? extra?.previousClose ?? null;
  const changePercent = base?.changePercent ?? computeChangePct(price, previousClose) ?? 0;

  const volume = extra?.volume ?? null;
  const avgVolume = extra?.avgVolume ?? null;
  const volumeRatio =
    volume !== null && avgVolume !== null && avgVolume > 0 ? volume / avgVolume : null;

  const h52 = extra?.high52w ?? null;
  const l52 = extra?.low52w ?? null;
  const yearRangePct =
    h52 !== null && l52 !== null && h52 > l52 ? ((price - l52) / (h52 - l52)) * 100 : null;

  // "Enriched" means the ranking inputs are present, not merely that Yahoo
  // answered — a response missing the volume history ranks no better than no
  // response at all, so it must not be labelled as complete.
  const row: StockData = {
    symbol,
    name: extra?.name ?? symbol,
    price,
    previousClose: previousClose ?? price,
    open: base?.open ?? extra?.open ?? null,
    high: base?.high ?? extra?.high ?? null,
    low: base?.low ?? extra?.low ?? null,
    changePercent,
    volume,
    avgVolume,
    high52w: h52,
    low52w: l52,
    marketCap: extra?.marketCap ?? null,
    history5d: extra?.history5d ?? [],
    news: [],
    volumeRatio,
    yearRangePct,
    enriched: volumeRatio !== null,
    score: 0,
  };
  row.score = scoreOf(row);
  return row;
}
