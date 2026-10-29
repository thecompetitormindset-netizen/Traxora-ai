// Reading stored bars, and deciding which symbols are worth scoring.
//
// The point of storing bars at all: scoring a universe used to cost one API
// call per symbol against a budget of about five a minute, which capped the
// field at five names a day. Reading from the database costs nothing per
// symbol, so the ceiling moves from the rate limit to the query — and the
// universe can be the market rather than a list of household names.

import { supabaseAdmin } from "./supabase";
import { allRows } from "./pagedSelect";
import { toIsoDate, withPg } from "./pgClient";
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
    // Volume ties are common at the quiet end of the market, and an untied
    // order makes the band an offset selects arbitrary from one call to the
    // next. Breaking ties on symbol makes "the band at offset N" mean the same
    // thing every time, which is what lets a day's picks be reproducible.
    .order("symbol", { ascending: true })
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
 * Which trading dates the store holds, as `YYYY-MM-DD`.
 *
 * Asked of Postgres directly rather than over REST, because REST cannot answer
 * it. There is no `distinct` there, so the only way across is to fetch every
 * row and reduce in JavaScript — and daily_bars holds roughly 4,100 rows PER
 * DATE, so a capped response covers part of a single day.
 *
 * That is precisely what the bars sync was doing. It read back part of one
 * date, concluded it held almost nothing, and re-fetched dates it already had
 * run after run — reporting the backfill going BACKWARDS while every
 * individual response said "ok". Twenty-nine manual runs made no progress.
 *
 * `select distinct` returns one row per date, a few hundred at most. It is
 * exact by construction and far cheaper than the query it replaces, so there
 * is no cap to fall foul of and nothing to keep in sync.
 *
 * Throws PgUnavailable when there is no connection string. Callers must decide
 * what to do with that; what none of them may do is substitute a number REST
 * could produce, because that number is the bug.
 */
export async function storedBarDates(sinceISO?: string): Promise<Set<string>> {
  return withPg(async (client) => {
    const { rows } = sinceISO
      ? await client.query("select distinct date from daily_bars where date >= $1 order by date", [sinceISO])
      : await client.query("select distinct date from daily_bars order by date");
    return new Set(rows.map(r => toIsoDate(r.date)));
  });
}

/**
 * How many distinct trading dates the store holds.
 *
 * Until this reaches MIN_HISTORY_SESSIONS, no symbol has enough history to be
 * scored honestly and the picks job will find nothing — which is a state worth
 * reporting rather than leaving to look like a failure.
 *
 * Counted in the database for the same reason as `storedBarDates`: the version
 * of this that selected rows and sized a Set reported 1 against a stored
 * market of 4,116 symbols.
 */
export async function storedDateCount(): Promise<number> {
  return withPg(async (client) => {
    const { rows } = await client.query("select count(distinct date)::int as n from daily_bars");
    return Number(rows[0]?.n ?? 0);
  });
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
  const rows = await allRows<StoredBarRow>((from, to) =>
    db
      .from("daily_bars")
      .select("date, symbol, open, high, low, close, volume")
      .eq("symbol", symbol)
      // date is unique within a symbol, so this is a total order and paging by
      // offset cannot skip or repeat a row.
      .order("date", { ascending: true })
      .range(from, to),
  );

  const bars = rows.map(toBar);
  return bars.length >= minSessions ? bars : [];
}

/**
 * Several symbols at once, which is far fewer round trips than one call each.
 *
 * Paged, because this is the read the row cap was quietly shortening: sixty
 * symbols with a hundred and twenty sessions each is over seven thousand rows,
 * and a capped response would have left most of the field looking as though it
 * had too little history to score. The field would have thinned to a handful
 * of names and nothing would have said why.
 */
export async function barsForMany(symbols: string[], minSessions = MIN_HISTORY_SESSIONS): Promise<Map<string, DailyBar[]>> {
  const out = new Map<string, DailyBar[]>();
  if (symbols.length === 0) return out;

  const db = supabaseAdmin();
  const rows = await allRows<StoredBarRow>((from, to) =>
    db
      .from("daily_bars")
      .select("date, symbol, open, high, low, close, volume")
      .in("symbol", symbols)
      // Both columns: (date, symbol) is the key, so ordering on the pair is a
      // total order. Ordering on date alone leaves rows within a date free to
      // come back in any order, and offset paging across an unstable order
      // drops and duplicates rows.
      .order("date", { ascending: true })
      .order("symbol", { ascending: true })
      .range(from, to),
  );

  for (const row of rows) {
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
