export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 60;

import { auth } from "@/auth";
import { supabaseAdmin, supabaseConfigured } from "@/app/lib/supabase";
import { etTradingDate } from "@/app/lib/marketTime";
import { toSeries, type DailyBar } from "@/app/lib/polygonBars";
import { barsFor, barsForMany, latestStoredDate, liquidSymbols, storedDateCount, storedSymbolCount, MIN_HISTORY_SESSIONS } from "@/app/lib/barsStore";
import { PgUnavailable } from "@/app/lib/pgClient";
import { backtestDirection } from "@/app/api/market/options-scan/route";
import { smartMoneyScore } from "@/app/lib/smartMoney";
import {
  MAX_PICKS_PER_DAY, PICK_HORIZON_SESSIONS, gradePick, selectPicks,
  type Candidate,
} from "@/app/lib/dailyPicks";

// Computes the day's picks once, and grades the ones whose horizon has passed.
//
// Run it pre-market. That timing is what makes the result stable: nothing
// recomputes while people are looking at it, so the picks cannot change
// between two viewers or between morning and afternoon. The database's
// primary key on (run_date, symbol) plus ignoreDuplicates enforces the same
// thing against an accidental second run.
//
// Polygon's free tier allows about five calls a minute. A per-request fetch
// cannot live inside that, but a scheduled job can: it waits for the budget
// instead of refusing, which is the one place waiting is the right answer.
// Whatever the universe costs here, the reader pays nothing.

const DAY_MS = 86_400_000;

/** Leaves room to grade and write before the 60s ceiling. */
const WORK_BUDGET_MS = 42_000;

/**
 * How many names one run scores.
 *
 * Bars come from the database now, so this is no longer the five-a-minute API
 * ceiling it used to be — it is a time budget. Scoring is a backtest across a
 * year of bars per symbol, which is cheap but not free, and the run has under
 * a minute.
 */
const FIELD_SIZE = 60;

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "thecompetitormindset@gmail.com";

type Denial = "no_secret_configured" | "secret_mismatch" | "not_owner" | "no_session";

/**
 * Two ways in, for two different callers.
 *
 * The scheduler presents CRON_SECRET. A person wants to run it once by hand —
 * to see whether it works without waiting for tomorrow morning — and Vercel
 * hides a secret's value after it is saved, so requiring it would mean
 * rotating the secret just to press a button. Being signed in as the owner is
 * enough, exactly as on the health route.
 *
 * "Unauthorized" alone was useless here: a wrong secret, an unset secret and
 * the wrong account have different fixes and looked identical.
 */
async function authorize(req: Request): Promise<{ ok: true } | { ok: false; why: Denial }> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  const query = new URL(req.url).searchParams.get("secret");
  const presented = header?.startsWith("Bearer ") ? header.slice(7) : query;

  if (secret && presented) {
    if (presented === secret) return { ok: true };
    return { ok: false, why: "secret_mismatch" };
  }
  if (!secret && presented) return { ok: false, why: "no_secret_configured" };

  try {
    const session = await auth();
    if (!session?.user?.email) return { ok: false, why: "no_session" };
    if (session.user.email !== OWNER_EMAIL) return { ok: false, why: "not_owner" };
    return { ok: true };
  } catch {
    return { ok: false, why: "no_session" };
  }
}

const DENIAL_HINT: Record<Denial, string> = {
  secret_mismatch:
    "The secret presented does not match CRON_SECRET. If you pasted the placeholder, " +
    "use the real value — or just sign in to the app in this browser and reload, which also works.",
  no_secret_configured:
    "A secret was presented but CRON_SECRET is not set in this environment.",
  no_session:
    "No secret and no signed-in session. Sign in to the app in this browser, then reload.",
  not_owner:
    "Signed in, but not as the owner account. Use the address OWNER_EMAIL is set to.",
};

function unauthorized(why: Denial): Response {
  return Response.json(
    { error: "Unauthorized", reason: why, hint: DENIAL_HINT[why] },
    { status: 401 },
  );
}

/**
 * Build one candidate from stored bars, or null when it cannot be scored.
 *
 * Bars arrive from the database rather than from an API call per symbol. That
 * is the change that lifts the universe ceiling: scoring a name used to cost
 * one of about five calls a minute, so five names a day was the limit. Reading
 * costs nothing per symbol, so the field can be the market.
 *
 * No live price is fetched either. These are swing picks on a 14-session
 * horizon chosen before the open, so the previous close is the right entry
 * reference — and fetching thousands of live quotes would reintroduce exactly
 * the per-symbol cost this removes.
 */
function evaluate(symbol: string, bars: DailyBar[], trending: Set<string>): Candidate | null {
  // The backtest needs warmup plus the forward window; without both, any hit
  // rate it produced would be drawn from too few signals to mean anything.
  if (bars.length < MIN_HISTORY_SESSIONS) return null;

  const { closes, highs, lows, volumes } = toSeries(bars);
  const price = closes.at(-1) ?? null;
  if (!price) return null;

  const prev = closes.at(-2) ?? price;
  const changePercent = prev > 0 ? ((price - prev) / prev) * 100 : 0;
  const recentVol = volumes.slice(-20);
  const avgVolume = recentVol.length >= 15 ? recentVol.reduce((s, v) => s + v, 0) / recentVol.length : null;
  const todayVolume = volumes.at(-1) ?? null;
  const volumeRatio = todayVolume !== null && avgVolume !== null && avgVolume > 0 ? todayVolume / avgVolume : null;

  const yearHighs = highs.slice(-252);
  const yearLows = lows.slice(-252);

  const sm = smartMoneyScore(
    {
      price, previousClose: prev,
      open: bars.at(-1)?.open ?? null,
      high: bars.at(-1)?.high ?? null,
      low: bars.at(-1)?.low ?? null,
      volume: todayVolume,
      avgVolume,
      high52w: yearHighs.length > 0 ? Math.max(...yearHighs) : null,
      low52w: yearLows.length > 0 ? Math.min(...yearLows) : null,
      changePercent,
    },
    {
      trend5dPct: closes.length >= 6 && closes.at(-6)! > 0
        ? ((price - closes.at(-6)!) / closes.at(-6)!) * 100
        : null,
    },
  );

  // HOLD is not a pick. Only a directional call can be graded, and only a
  // directional call is worth showing as one of the day's few.
  if (sm.signal === "HOLD") return null;

  return {
    symbol,
    direction: sm.signal,
    price,
    backtest: backtestDirection(closes, highs, lows, volumes, sm.signal),
    volumeRatio,
    trending: trending.has(symbol),
    confidence: sm.confidence,
  };
}

export async function GET(req: Request) {
  const gate = await authorize(req);
  if (!gate.ok) return unauthorized(gate.why);
  if (!supabaseConfigured()) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const db = supabaseAdmin();
  const runDate = etTradingDate();
  const deadline = Date.now() + WORK_BUDGET_MS;

  // ── Grade picks whose horizon has passed ──────────────────────────────────
  let graded = 0;
  try {
    const { data: unresolved } = await db
      .from("daily_picks")
      .select("run_date, symbol, direction, entry_price, horizon_days")
      .is("resolved_at", null);

    for (const row of unresolved ?? []) {
      // Calendar days ~= sessions * 7/5, plus slack for holidays. Grading early
      // would measure a shorter horizon than the pick claimed.
      const matureAfterMs = (row.horizon_days as number) * 1.5 * DAY_MS;
      if (Date.now() - Date.parse(`${row.run_date}T20:00:00Z`) < matureAfterMs) continue;
      if (Date.now() >= deadline) break;

      // Graded from stored bars, like everything else — so grading costs no
      // API calls and cannot be delayed by a rate limit.
      const bars = await barsFor(row.symbol as string, 1);
      if (bars.length === 0) continue;

      // The bar `horizon_days` sessions after entry — not simply the latest,
      // which would grade over however long it happened to take to get round
      // to it.
      const entryIdx = bars.findIndex((b: DailyBar) => b.date >= (row.run_date as string));
      if (entryIdx < 0) continue;
      const exitIdx = entryIdx + (row.horizon_days as number);
      const exit = bars[exitIdx];
      if (!exit) continue;

      const outcome = gradePick(row.direction as "BUY" | "SELL", Number(row.entry_price), exit.close);
      if (!outcome) continue;

      await db.from("daily_picks")
        .update({
          outcome_date: exit.date,
          outcome_price: exit.close,
          return_pct: outcome.returnPct,
          correct: outcome.correct,
          resolved_at: new Date().toISOString(),
        })
        .eq("run_date", row.run_date)
        .eq("symbol", row.symbol);
      graded++;
    }
  } catch (err) {
    console.error("daily-picks grading error:", err instanceof Error ? err.message : err);
  }

  // ── Already have today's picks? Then leave them alone ─────────────────────
  const { data: existing } = await db
    .from("daily_picks")
    .select("symbol")
    .eq("run_date", runDate);

  if (existing && existing.length > 0) {
    return Response.json({
      runDate, graded, picked: existing.length,
      note: "picks for this date already exist and were not recomputed",
    });
  }

  // ── Select today's ────────────────────────────────────────────────────────
  // Trending names are penalised rather than excluded, so this list only has
  // to be best-effort; failing to get it costs a nuance, not the run.
  const trending = new Set<string>();

  // The field comes from the stored market, not a hand-written list.
  const latest = await latestStoredDate();
  if (!latest) {
    return Response.json({
      runDate, graded, picked: 0,
      error: "No stored bars yet",
      hint: "Run /api/cron/bars-sync until it reports the history is complete, then retry.",
    }, { status: 200 });
  }

  const universeSize = await storedSymbolCount(latest);

  // Scoring needs a long enough series per symbol before a hit rate means
  // anything. Until the backfill reaches that depth no symbol qualifies, and
  // the run finds nothing — which looks like a failure unless it says so.
  // Counted in the database; see storedDateCount. If that count cannot be had,
  // the run carries on rather than stopping: this check only exists to EXPLAIN
  // an empty result while the backfill is shallow. The real guard is per
  // symbol — barsForMany drops anything under MIN_HISTORY_SESSIONS — so a
  // missing count costs a clear message, not correctness.
  let storedDates: number | null = null;
  try {
    storedDates = await storedDateCount();
  } catch (err) {
    if (!(err instanceof PgUnavailable)) throw err;
    console.warn("daily-picks: could not count stored dates:", err.message);
  }

  if (storedDates !== null && storedDates < MIN_HISTORY_SESSIONS) {
    return Response.json({
      runDate, graded, picked: 0,
      storedDates,
      datesNeeded: MIN_HISTORY_SESSIONS,
      universeSize,
      note:
        `history is still filling: ${storedDates} of ${MIN_HISTORY_SESSIONS} trading dates stored. ` +
        `No symbol has enough series to score honestly yet. bars-sync adds a few dates a run — ` +
        `it runs once each weekday from daily-core, and can be called directly to fill faster.`,
    });
  }

  // Ordered by volume, so an offset walks PAST the names everyone watches into
  // the part of the market that is liquid enough to trade and quiet enough
  // that nobody is discussing it. The offset rotates by date so a different
  // band is examined each day and no region is permanently ignored — the
  // brief's "must not overlook the underrated" made concrete.
  const offset = universeSize > FIELD_SIZE
    ? (Math.floor(Date.parse(`${runDate}T00:00:00Z`) / 86_400_000) * FIELD_SIZE) % (universeSize - FIELD_SIZE)
    : 0;

  const symbols = await liquidSymbols(latest, FIELD_SIZE, offset);
  const barsBySymbol = await barsForMany(symbols, MIN_HISTORY_SESSIONS);

  const candidates: Candidate[] = [];
  const skipped: string[] = [];
  for (const symbol of symbols) {
    if (Date.now() >= deadline) { skipped.push(symbol); continue; }
    const bars = barsBySymbol.get(symbol);
    if (!bars) { skipped.push(symbol); continue; }
    try {
      const c = evaluate(symbol, bars, trending);
      if (c) candidates.push(c);
      else skipped.push(symbol);
    } catch {
      skipped.push(symbol);
    }
  }

  const picks = selectPicks(candidates, MAX_PICKS_PER_DAY);

  if (picks.length > 0) {
    const rows = picks.map((p, i) => ({
      run_date: runDate,
      symbol: p.symbol,
      rank: i + 1,
      direction: p.direction,
      conviction: p.conviction,
      entry_price: p.price,
      as_of: new Date().toISOString(),
      horizon_days: PICK_HORIZON_SESSIONS,
      why: p.why,
      backtest: p.backtest,
    }));
    // ignoreDuplicates: a pick that has been shown is never rewritten.
    const { error } = await db.from("daily_picks").upsert(rows, { onConflict: "run_date,symbol", ignoreDuplicates: true });
    if (error) {
      console.error("daily-picks write error:", error.message);
      return Response.json({ runDate, graded, picked: 0, error: error.message }, { status: 500 });
    }
  }

  return Response.json({
    runDate,
    graded,
    universeSize,
    fieldOffset: offset,
    considered: symbols.length,
    evaluated: candidates.length,
    skipped: skipped.length,
    picked: picks.length,
    // Fewer than the maximum is a real answer, not a failure: a day with one
    // trustworthy setup should show one.
    note: picks.length < MAX_PICKS_PER_DAY
      ? `${picks.length} candidate(s) cleared the certainty bar out of ${candidates.length} evaluated`
      : undefined,
  });
}
