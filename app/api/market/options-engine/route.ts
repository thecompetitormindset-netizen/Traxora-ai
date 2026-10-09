export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 60;

// Options analysis (v4.1) — deterministic by default, zero model calls.
// Each UNIVERSE symbol gets its own v4.1 input built from public data, run
// through the deterministic analyst, and reviewed by the application
// validator. Results are persisted per (ET trading day, symbol) and shared by
// every viewer; at read time an approved candidate is re-checked for
// freshness before it may be shown (see optionsAnalysis/display.ts).

import { auth } from "@/auth";
import { supabaseAdmin } from "@/app/lib/supabase";
import { UNIVERSE } from "@/app/api/market/options-scan/route";
import { etTradingDate, nyseSessionStatus, type SessionStatus } from "@/app/lib/marketTime";
import { checkRateLimit } from "@/app/lib/rateLimit";
import { toDisplay, toResearch, type DisplayAnalysis, type ResearchDetail, type StoredAnalysis } from "@/app/lib/optionsAnalysis/display";
import { SYMBOL_PATTERN, analyzeLiveSymbol, loadEarnings } from "@/app/lib/optionsAnalysis/service";
import { POLICY_VERSION } from "@/app/lib/optionsAnalysis/policy";
import { RULES_VERSION } from "@/app/lib/optionsAnalysis/rules";

const REFRESH_WHILE_OPEN_MS   = 5 * 60 * 1000;
const REFRESH_WHILE_CLOSED_MS = 30 * 60 * 1000;
const RESCAN_COOLDOWN_MS      = 2 * 60 * 1000;
const CONCURRENCY             = 6;
const IV_HISTORY_DAYS         = 252;
const SYMBOL_REFRESH_MS       = 60 * 1000;

export type ResearchResponse = { detail: ResearchDetail; universe: boolean };

export type OptionsAnalysisResponse = {
  as_of: string | null;
  session: SessionStatus;
  engine: "deterministic";
  policy_version: string;
  persisted: boolean;
  analyses: DisplayAnalysis[];
};

type Row = StoredAnalysis & { run_date: string };

// Per-instance fallback when the table is missing or unreachable, so a GET
// storm doesn't refetch the whole universe on every request.
let memCache: { run_date: string; rows: Row[] } | null = null;
let inflight: Promise<{ rows: Row[]; persisted: boolean }> | null = null;

type Db = ReturnType<typeof supabaseAdmin>;

// Persistence is best-effort: without a database (local dev, outage) the
// analysis still runs and is served from the per-instance cache.
function tryDb(): Db | null {
  try { return supabaseAdmin(); }
  catch (err) {
    console.error("[options-analysis] database unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function loadIvHistory(db: Db | null, today: string): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  if (!db) return map;
  const { data, error } = await db
    .from("options_iv_history").select("symbol, atm_iv")
    .lt("as_of_date", today).order("as_of_date", { ascending: false })
    .limit(UNIVERSE.length * IV_HISTORY_DAYS);
  if (error) { console.error("[options-analysis] IV history read error:", error.message); return map; }
  for (const r of data ?? []) {
    const iv = Number(r.atm_iv);
    if (!Number.isFinite(iv)) continue;
    const list = map.get(r.symbol as string) ?? [];
    if (list.length < IV_HISTORY_DAYS) list.push(iv);
    map.set(r.symbol as string, list);
  }
  return map;
}

async function analyzeSymbol(
  symbol: string, runDate: string, earnings: Awaited<ReturnType<typeof loadEarnings>>, ivHistory: number[],
): Promise<{ row: Row; atmIv: number | null } | null> {
  const r = await analyzeLiveSymbol(symbol, earnings, ivHistory);
  return r ? { row: { ...r.row, run_date: runDate }, atmIv: r.atmIv } : null;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

async function generate(actor: string): Promise<{ rows: Row[]; persisted: boolean }> {
  const runDate = etTradingDate();
  const db = tryDb();
  const [earnings, ivHistory] = await Promise.all([loadEarnings(), loadIvHistory(db, runDate)]);
  const results = (await pool([...UNIVERSE], CONCURRENCY, sym => analyzeSymbol(sym, runDate, earnings, ivHistory.get(sym) ?? [])))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const rows = results.map(r => r.row);
  memCache = { run_date: runDate, rows };
  for (const r of rows) symbolCache.set(r.symbol, r);
  if (!db) return { rows, persisted: false };
  const persisted = await persistRows(db, rows, actor);

  const ivRows = results.filter(r => r.atmIv !== null).map(r => ({ symbol: r.row.symbol, as_of_date: runDate, atm_iv: r.atmIv }));
  if (ivRows.length) {
    const { error: ivErr } = await db.from("options_iv_history").upsert(ivRows, { onConflict: "symbol,as_of_date" });
    if (ivErr) console.error("[options-analysis] IV history upsert error:", ivErr.message);
  }
  return { rows, persisted };
}

function generateOnce(actor: string) {
  inflight ??= generate(actor).finally(() => { inflight = null; });
  return inflight;
}

async function readToday(): Promise<{ rows: Row[]; persisted: boolean }> {
  const runDate = etTradingDate();
  const cached = memCache?.run_date === runDate ? memCache.rows : [];
  const db = tryDb();
  if (!db) return { rows: cached, persisted: false };
  const { data, error } = await db
    .from("options_analyses")
    .select("run_date, symbol, as_of, input, output, review_status, review_errors, pricing")
    .eq("run_date", runDate);
  if (error) {
    console.error("[options-analysis] read error:", error.message);
    return { rows: cached, persisted: false };
  }
  return { rows: (data ?? []) as Row[], persisted: true };
}

async function persistRows(db: Db | null, rows: Row[], actor: string): Promise<boolean> {
  if (!db || rows.length === 0) return false;
  const { error } = await db.from("options_analyses").upsert(
    rows.map(r => ({
      run_date: r.run_date, symbol: r.symbol, as_of: r.as_of, engine: "deterministic",
      policy_version: POLICY_VERSION, rules_version: RULES_VERSION,
      input: r.input, output: r.output, review_status: r.review_status, review_errors: r.review_errors,
      pricing: r.pricing, generated_by: actor, updated_at: new Date().toISOString(),
    })),
    { onConflict: "run_date,symbol" },
  );
  if (error) console.error("[options-analysis] upsert error:", error.message);
  return !error;
}

// One symbol, live — for the research page. Universe symbols update the
// shared day row; any other valid symbol is analyzed on demand and only
// cached per instance (never written to the shared table).
const symbolCache = new Map<string, Row>();

async function analyzeOne(symbol: string, actor: string): Promise<Row | null> {
  const runDate = etTradingDate();
  const db = tryDb();
  const [earnings, ivHistory] = await Promise.all([loadEarnings(), loadIvHistory(db, runDate)]);
  const r = await analyzeSymbol(symbol, runDate, earnings, ivHistory.get(symbol) ?? []);
  if (!r) return null;
  symbolCache.set(symbol, r.row);
  if ((UNIVERSE as readonly string[]).includes(symbol)) {
    if (memCache?.run_date === runDate) {
      memCache = { run_date: runDate, rows: [...memCache.rows.filter(x => x.symbol !== symbol), r.row] };
    }
    await persistRows(db, [r.row], actor);
  }
  return r.row;
}

async function researchFor(symbol: string, opts: { force: boolean; actor: string }): Promise<Response> {
  const universe = (UNIVERSE as readonly string[]).includes(symbol);
  const runDate = etTradingDate();
  let row: Row | undefined = symbolCache.get(symbol);
  if (row && row.run_date !== runDate) row = undefined;
  if (!row && universe) row = (await readToday()).rows.find(r => r.symbol === symbol);
  const age = row ? Date.now() - Date.parse(row.as_of) : Infinity;
  const maxAge = nyseSessionStatus().status === "OPEN" ? REFRESH_WHILE_OPEN_MS : REFRESH_WHILE_CLOSED_MS;

  if (opts.force && age < SYMBOL_REFRESH_MS) {
    return Response.json({ error: "cooldown", retryAfterSeconds: Math.ceil((SYMBOL_REFRESH_MS - age) / 1000) }, { status: 429 });
  }
  if (!row || opts.force || age >= maxAge) {
    row = (await analyzeOne(symbol, opts.actor)) ?? undefined;
  }
  if (!row) return Response.json({ error: "unavailable", detail: "Required market data could not be retrieved for this symbol." }, { status: 404 });
  const body: ResearchResponse = { detail: toResearch(row, new Date()), universe };
  return Response.json(body, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

function symbolParam(req: Request): string | null | "invalid" {
  const raw = new URL(req.url).searchParams.get("symbol");
  if (raw === null) return null;
  const sym = raw.trim().toUpperCase();
  return SYMBOL_PATTERN.test(sym) ? sym : "invalid";
}

function newestAsOf(rows: Row[]): number | null {
  return rows.length ? Math.max(...rows.map(r => Date.parse(r.as_of))) : null;
}

const ORDER: Record<DisplayAnalysis["status"], number> = { PAPER_CANDIDATE: 0, STALE_CANDIDATE: 1, NO_TRADE: 2, UNAVAILABLE: 3 };

function respond(rows: Row[], persisted: boolean) {
  const now = new Date();
  const newest = newestAsOf(rows);
  const body: OptionsAnalysisResponse = {
    as_of: newest === null ? null : new Date(newest).toISOString(),
    session: nyseSessionStatus(now),
    engine: "deterministic",
    policy_version: POLICY_VERSION,
    persisted,
    analyses: rows.map(r => toDisplay(r, now)).sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.symbol.localeCompare(b.symbol)),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
}

// ── Handlers ──────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sym = symbolParam(req);
    if (sym === "invalid") return Response.json({ error: "invalid_symbol" }, { status: 400 });
    if (sym) {
      if (!checkRateLimit(`options-research:${session.user.email ?? "anon"}`, 30, 60_000)) {
        return Response.json({ error: "rate_limited", retryAfterSeconds: 60 }, { status: 429 });
      }
      return await researchFor(sym, { force: false, actor: "lazy" });
    }
    const current = await readToday();
    const newest = newestAsOf(current.rows);
    const maxAge = nyseSessionStatus().status === "OPEN" ? REFRESH_WHILE_OPEN_MS : REFRESH_WHILE_CLOSED_MS;
    if (newest !== null && Date.now() - newest < maxAge) return respond(current.rows, current.persisted);
    const fresh = await generateOnce("lazy");
    return respond(fresh.rows, fresh.persisted);
  } catch (err) {
    console.error("[options-analysis] GET failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sym = symbolParam(req);
    if (sym === "invalid") return Response.json({ error: "invalid_symbol" }, { status: 400 });
    if (sym) return await researchFor(sym, { force: true, actor: session.user.email ?? "unknown" });
    const current = await readToday();
    const newest = newestAsOf(current.rows);
    if (newest !== null && Date.now() - newest < RESCAN_COOLDOWN_MS) {
      return Response.json(
        { error: "cooldown", retryAfterSeconds: Math.ceil((RESCAN_COOLDOWN_MS - (Date.now() - newest)) / 1000) },
        { status: 429 },
      );
    }
    const fresh = await generateOnce(session.user.email ?? "unknown");
    return respond(fresh.rows, fresh.persisted);
  } catch (err) {
    console.error("[options-analysis] POST failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
