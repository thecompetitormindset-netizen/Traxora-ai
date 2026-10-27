// Reading stored bars, and deciding which symbols are worth scoring.
//
// The point of storing bars at all: scoring a universe used to cost one API
// call per symbol against a budget of about five a minute, which capped the
// field at five names a day. Reading from the database costs nothing per
// symbol, so the ceiling moves from the rate limit to the query — and the
// universe can be the market rather than a list of household names.

import { supabaseAdmin } from "./supabase";
import type { DailyBar } from "./polygonBars";

/** Sessions of history a symbol needs before its backtest means anything. */
export const MIN_HISTORY_SESSIONS = 120;

export type StoredBarRow = {
  date: string; symbol: string;
  open: number; high: number; low: number; close: number; volume: number;
};

const toBar = (r: StoredBarRow): DailyBar => ({
  date: r.date,
  open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
  volume: Number(r.volume),
});

/**
 * Candidate symbols for a run, most liquid first.
 *
 * Liquidity is measured on the latest stored session rather than averaged, so
 * this is cheap — one indexed read of one date. It decides which names are
 * worth SCORING, not which are good; the scoring does that.
 *
 * Ordering by dollar volume and then taking from deeper in the list is how the
 * brief's "names nobody sees" is reached: the most-watched names cluster at
 * the top, so an offset walks past them into the part of the market that is
 * liquid enough to trade and quiet enough that nobody is discussing it.
 */
export async function liquidSymbols(latestDate: string, limit: number, offset: number): Promise<string[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("daily_bars")
    .select("symbol, close, volume")
    .eq("date", latestDate)
    .order("volume", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return (data ?? []).map(r => String(r.symbol));
}

/** The most recent date present in the store, or null when it is empty. */
export async function latestStoredDate(): Promise<string | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("daily_bars")
    .select("date")
    .order("date", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.date ? String(data[0].date) : null;
}

/**
 * How many distinct trading dates the store holds.
 *
 * Until this reaches MIN_HISTORY_SESSIONS, no symbol has enough history to be
 * scored honestly and the picks job will find nothing — which is a state worth
 * reporting rather than leaving to look like a failure.
 */
export async function storedDateCount(): Promise<number> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("daily_bars")
    .select("date")
    .limit(100_000);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map(r => String(r.date))).size;
}

/** How many distinct symbols the store holds for a date. */
export async function storedSymbolCount(date: string): Promise<number> {
  const db = supabaseAdmin();
  const { count, error } = await db
    .from("daily_bars")
    .select("symbol", { count: "exact", head: true })
    .eq("date", date);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * One symbol's stored history, ascending — the order every technical assumes.
 *
 * Returns an empty array rather than a short one when there is not enough
 * history: a backtest run over sixty bars would produce a hit rate from a
 * handful of signals, and a number nobody can stand behind is worse than no
 * number, because it still gets ranked.
 */
export async function barsFor(symbol: string, minSessions = MIN_HISTORY_SESSIONS): Promise<DailyBar[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("daily_bars")
    .select("date, symbol, open, high, low, close, volume")
    .eq("symbol", symbol)
    .order("date", { ascending: true })
    .limit(500);

  if (error) throw new Error(error.message);
  const bars = (data ?? []).map(r => toBar(r as StoredBarRow));
  return bars.length >= minSessions ? bars : [];
}

/** Several symbols at once, which is far fewer round trips than one call each. */
export async function barsForMany(symbols: string[], minSessions = MIN_HISTORY_SESSIONS): Promise<Map<string, DailyBar[]>> {
  const out = new Map<string, DailyBar[]>();
  if (symbols.length === 0) return out;

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("daily_bars")
    .select("date, symbol, open, high, low, close, volume")
    .in("symbol", symbols)
    .order("date", { ascending: true });

  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as StoredBarRow[]) {
    const list = out.get(row.symbol) ?? [];
    list.push(toBar(row));
    out.set(row.symbol, list);
  }

  // Drop anything too short to score honestly.
  for (const [symbol, bars] of [...out]) {
    if (bars.length < minSessions) out.delete(symbol);
  }
  return out;
}
