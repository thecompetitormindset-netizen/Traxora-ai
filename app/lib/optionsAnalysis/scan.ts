// Background scan of the whole options universe (~5,300 US names).
//
// A pass is too long for one serverless request, so it runs in chunks: each
// request analyzes symbols for ~45 seconds, saves them, and asks for the next
// chunk. Progress lives in the (otherwise retired) options_engine_runs row for
// the day, so no schema change is needed. Without a database (local dev) the
// same flow runs against an in-memory store.
//
// Storage stays small: each saved row keeps only what the overview and the
// freshness re-check need (the proposed legs' contracts and the last few
// daily bars). Research pages re-analyze a symbol live, with full data.

import { supabaseAdmin } from "@/app/lib/supabase";
import { etTradingDate } from "@/app/lib/marketTime";
import { analyzeLiveSymbol, loadEarnings } from "./service";
import { cboeBlocked, resetCboe } from "./payload";
import type { EarningsCalendar } from "./payload";
import type { StoredAnalysis } from "./display";
import { buildUniverse } from "./universe";
import { POLICY_VERSION } from "./policy";
import { RULES_VERSION } from "./rules";

export type Row = StoredAnalysis & { run_date: string };

export type ScanState = {
  run_id: string;
  run_date: string;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
  total: number;          // every optionable symbol
  thin: number;           // answered by the first check (shares barely trade)
  deep: string[];         // checked fully, in order
  offset: number;         // next index into deep
  checked: number;        // fully analyzed so far
  unavailable: number;    // data couldn't be fetched
  earnings: EarningsCalendar;
};

const CONCURRENCY = 2;       // CBOE requests are also spaced out in payload.ts
const SAVE_BATCH = 25;
const IV_HISTORY_DAYS = 252;
const KEEP_DAYS = 3;          // older scan rows are deleted at the start of a pass
const STALE_MS = 3 * 60_000;  // a pass with no progress for this long is considered stopped

type Db = ReturnType<typeof supabaseAdmin>;
function tryDb(): Db | null { try { return supabaseAdmin(); } catch { return null; } }

// In-memory fallback (local dev without a database).
let memState: ScanState | null = null;
const memRows = new Map<string, Row>();

// ── State ───────────────────────────────────────────────────────────────────

export async function getScanState(): Promise<ScanState | null> {
  const db = tryDb();
  const today = etTradingDate();
  if (!db) return memState?.run_date === today ? memState : null;
  const { data, error } = await db.from("options_engine_runs").select("run_id, payload, result").eq("run_date", today).maybeSingle();
  if (error || !data || data.run_id === null) return null;
  const p = data.payload as Partial<ScanState> & { kind?: string };
  if (p.kind !== "options-scan") return null;
  return { ...(p as ScanState), ...(data.result as Partial<ScanState>), run_id: data.run_id as string };
}

async function saveScanState(s: ScanState, actor: string) {
  const db = tryDb();
  if (!db) { memState = s; return; }
  const { deep, earnings, total, thin, started_at, run_date } = s;
  await db.from("options_engine_runs").upsert({
    run_date, run_id: s.run_id, as_of: s.updated_at,
    prompt_version: "options-scan-v1", model: "deterministic",
    payload: { kind: "options-scan", deep, earnings, total, thin, started_at, run_date },
    result: { offset: s.offset, checked: s.checked, unavailable: s.unavailable, updated_at: s.updated_at, finished_at: s.finished_at },
    candidate_count: s.deep.length, generated_by: actor, updated_at: s.updated_at,
  }, { onConflict: "run_date" });
}

export function isRunning(s: ScanState | null): boolean {
  return !!s && !s.finished_at && Date.now() - Date.parse(s.updated_at) < STALE_MS;
}

// ── Starting a pass ─────────────────────────────────────────────────────────

export async function startScan(actor: string): Promise<ScanState> {
  const [u, earnings] = await Promise.all([buildUniverse(), loadEarnings()]);
  const now = new Date().toISOString();
  const s: ScanState = {
    run_id: `scan-${Date.now().toString(36)}`, run_date: etTradingDate(), started_at: now, updated_at: now, finished_at: null,
    total: u.deep.length + u.thin.length, thin: u.thin.length, deep: u.deep, offset: 0, checked: 0, unavailable: 0, earnings,
  };
  await saveScanState(s, actor);
  const db = tryDb();
  if (db) {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400_000).toISOString().slice(0, 10);
    await db.from("options_analyses").delete().lt("run_date", cutoff);
  }
  return s;
}

// ── One chunk ───────────────────────────────────────────────────────────────

function slim(row: Row): Row {
  const keep = new Set((row.output?.proposed_structure?.legs ?? []).map(l => l.contract_id));
  return {
    ...row,
    input: { ...row.input, contracts: (row.input.contracts ?? []).filter(c => keep.has(c.contract_id)), bars: (row.input.bars ?? []).slice(-5) },
  };
}

async function ivHistoryFor(db: Db | null, symbols: string[], today: string): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  if (!db || !symbols.length) return map;
  const { data } = await db.from("options_iv_history").select("symbol, atm_iv")
    .in("symbol", symbols).lt("as_of_date", today).order("as_of_date", { ascending: false })
    .limit(symbols.length * IV_HISTORY_DAYS);
  for (const r of data ?? []) {
    const iv = Number(r.atm_iv);
    if (!Number.isFinite(iv)) continue;
    const list = map.get(r.symbol as string) ?? [];
    if (list.length < IV_HISTORY_DAYS) list.push(iv);
    map.set(r.symbol as string, list);
  }
  return map;
}

async function saveRows(db: Db | null, rows: Row[], ivRows: { symbol: string; as_of_date: string; atm_iv: number }[], actor: string) {
  if (!db) { for (const r of rows) memRows.set(r.symbol, r); return; }
  for (let i = 0; i < rows.length; i += SAVE_BATCH) {
    const { error } = await db.from("options_analyses").upsert(rows.slice(i, i + SAVE_BATCH).map(r => ({
      run_date: r.run_date, symbol: r.symbol, as_of: r.as_of, engine: "deterministic",
      policy_version: POLICY_VERSION, rules_version: RULES_VERSION,
      input: r.input, output: r.output, review_status: r.review_status, review_errors: r.review_errors,
      pricing: r.pricing, generated_by: actor, updated_at: new Date().toISOString(),
    })), { onConflict: "run_date,symbol" });
    if (error) console.error("[options-scan] save failed:", error.message);
  }
  if (ivRows.length) await db.from("options_iv_history").upsert(ivRows, { onConflict: "symbol,as_of_date" });
}

/** Analyze from the saved offset for up to budgetMs. Returns true if more remains. */
export async function runChunk(runId: string, budgetMs: number, actor: string): Promise<boolean> {
  const s = await getScanState();
  if (!s || s.run_id !== runId || s.finished_at) return false;
  const deadline = Date.now() + budgetMs;
  const db = tryDb();
  const today = s.run_date;

  while (s.offset < s.deep.length && Date.now() < deadline - 8_000) {
    // CBOE is refusing requests: pause, then carry on (never hammer it).
    if (cboeBlocked()) {
      if (Date.now() > deadline - 30_000) break;
      await new Promise(r => setTimeout(r, 20_000));
      resetCboe();
      continue;
    }
    const slice = s.deep.slice(s.offset, s.offset + CONCURRENCY * 4);
    const iv = await ivHistoryFor(db, slice, today);
    const rows: Row[] = [];
    const ivRows: { symbol: string; as_of_date: string; atm_iv: number }[] = [];
    const skipped: string[] = [];
    let next = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (next < slice.length) {
        const sym = slice[next++];
        try {
          if (cboeBlocked()) { skipped.push(sym); continue; }  // handled after the batch
          const r = await analyzeLiveSymbol(sym, s.earnings, iv.get(sym) ?? []);
          if (!r) { s.unavailable++; continue; }
          rows.push(slim({ ...r.row, run_date: today }));
          if (r.atmIv !== null) ivRows.push({ symbol: sym, as_of_date: today, atm_iv: r.atmIv });
          s.checked++;
        } catch { s.unavailable++; }
      }
    }));
    await saveRows(db, rows, ivRows, actor);
    // Names skipped because CBOE pushed back are retried from where we stopped.
    s.offset += slice.length;
    if (skipped.length) s.deep.splice(s.offset, 0, ...skipped);
    s.updated_at = new Date().toISOString();
    if (s.offset >= s.deep.length) s.finished_at = s.updated_at;
    await saveScanState(s, actor);
  }
  return !s.finished_at;
}

// ── Reading results ─────────────────────────────────────────────────────────

/** Small per-row summary for every symbol checked today (no inputs). */
export async function readSummaries(): Promise<{ symbol: string; review_status: string; code: string | null; detail: string | null }[]> {
  const db = tryDb();
  const today = etTradingDate();
  if (!db) return [...memRows.values()].filter(r => r.run_date === today).map(r => ({
    symbol: r.symbol, review_status: r.review_status, code: r.output?.no_trade_reason?.code ?? null, detail: r.output?.no_trade_reason?.detail ?? null,
  }));
  const out: { symbol: string; review_status: string; code: string | null; detail: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("options_analyses")
      .select("symbol, review_status, reason:output->no_trade_reason").eq("run_date", today).range(from, from + 999);
    if (error || !data?.length) break;
    for (const r of data as { symbol: string; review_status: string; reason: { code?: string; detail?: string } | null }[]) {
      out.push({ symbol: r.symbol, review_status: r.review_status, code: r.reason?.code ?? null, detail: r.reason?.detail ?? null });
    }
    if (data.length < 1000) break;
  }
  return out;
}

/** Full rows for today's candidates (approved by the checks). */
export async function readCandidates(): Promise<Row[]> {
  const db = tryDb();
  const today = etTradingDate();
  if (!db) return [...memRows.values()].filter(r => r.run_date === today && r.review_status === "APPROVED_CANDIDATE");
  const { data } = await db.from("options_analyses")
    .select("run_date, symbol, as_of, input, output, review_status, review_errors, pricing")
    .eq("run_date", today).eq("review_status", "APPROVED_CANDIDATE");
  return (data ?? []) as Row[];
}
