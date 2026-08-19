export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 60;

import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { supabaseAdmin } from "@/app/lib/supabase";
import {
  UNIVERSE, fetchQuote, backtestDirection, BACKTEST_WARMUP, BACKTEST_FORWARD,
  type BacktestStats,
} from "@/app/api/market/options-scan/route";
import { fetchAVCalendar, parseCSV } from "@/app/api/market/earnings-calendar/route";
import { smartMoneyScore, detectOrderBlocks, detectFVG } from "@/app/lib/smartMoney";
import { etTradingDate, marketSession } from "@/app/lib/marketTime";
import {
  calcATR14, calcRealizedVol20, deriveEventFlags, deriveSignalComponents,
  CONFIDENCE_MAP, fetchOptionsChainSlice, NO_EARNINGS_SENTINEL,
  type ChainContract, type SignalComponent,
} from "@/app/lib/optionsPayloadData";
import { SYSTEM_PROMPT_V1, PROMPT_VERSION } from "@/app/lib/optionsEnginePrompt";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const RESCAN_COOLDOWN_MS = 15 * 60 * 1000;

// ── Types (mirror the system prompt's input/output JSON contracts) ──────────────

type Candidate = {
  symbol: string;
  spot: number;
  canonical_direction: "long" | "short";
  canonical_confidence: number;
  signal_components: SignalComponent[];
  atr14: number | null;
  realized_vol_20d: number | null;
  iv_rank: number | null;
  iv_percentile: number | null;
  earnings_in_days: number;
  event_flags: string[];
  levels: { bsl: string[]; ssl: string[]; fvg: string[]; order_blocks: string[] };
  chain: ChainContract[];
};

type EnginePayload = {
  run_id: string;
  as_of: string;
  session: string;
  candidates: Candidate[];
};

export type EnginePlay = {
  rank: number;
  symbol: string;
  direction: "long" | "short";
  structure: "long_call" | "long_put" | "debit_spread" | "credit_spread";
  contract: { type: "call" | "put"; strike: number; expiry: string; dte: number; mid: number; delta: number };
  probability: number;
  probability_math: string;
  breakeven: number;
  move_required_atr: number;
  entry_zone: [number, number];
  target: { price: number; level_name: string };
  invalidation: { price: number; level_name: string };
  max_risk_per_contract: number;
  thesis: string;
  dissent: string[];
  confidence_source: string;
};

export type EngineResult = {
  run_id: string;
  as_of: string;
  plays: EnginePlay[];
  rejected: { symbol: string; reason: string }[];
  disclaimer: string;
};

export type OptionsEngineMeta = Record<string, {
  name: string; price: number; changePct: number; backtest: BacktestStats | null;
}>;

export type OptionsEngineRun = {
  run_date: string;
  run_id: string;
  as_of: string;
  prompt_version: string;
  model: string;
  payload: EnginePayload;
  result: EngineResult;
  meta: OptionsEngineMeta;
  candidate_count: number;
  play_count: number;
  generated_by: string;
  regenerate_count: number;
  last_regenerated_at: string | null;
};

// ── JSON repair (handles truncated model output) ────────────────────────────────
function repairJSON(raw: string): EngineResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in response");
  try { return JSON.parse(match[0]) as EngineResult; } catch { /* try repair */ }
  const frag = match[0];
  const closers: string[] = [];
  let inStr = false, esc = false;
  for (const c of frag) {
    if (esc)                  { esc = false; continue; }
    if (c === "\\" && inStr)  { esc = true; continue; }
    if (c === '"')            { inStr = !inStr; continue; }
    if (inStr)                continue;
    if (c === "{" || c === "[") closers.push(c === "{" ? "}" : "]");
    if (c === "}" || c === "]") closers.pop();
  }
  return JSON.parse(frag + closers.reverse().join("")) as EngineResult;
}

// ── OpenAI-compatible fallback (Gemini / Groq / DeepSeek) ───────────────────────
async function callOpenAICompat(
  url: string, key: string, model: string, system: string, user: string, maxTokens: number,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model, max_tokens: maxTokens,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(50_000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const d = await res.json() as { choices?: { message?: { content?: string } }[] };
    return d.choices?.[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error(`[options-engine] ${url} error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Earnings map — symbol → days until next known report ────────────────────────
async function buildEarningsMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const csv = await fetchAVCalendar();
    const events = parseCSV(csv);
    const today = new Date();
    for (const ev of events) {
      const reportDate = new Date(ev.reportDate + "T12:00:00Z");
      const days = Math.round((reportDate.getTime() - today.getTime()) / 86_400_000);
      if (days < 0) continue;
      const existing = map.get(ev.symbol);
      if (existing === undefined || days < existing) map.set(ev.symbol, days);
    }
  } catch (err) {
    console.error("[options-engine] earnings calendar unavailable:", err instanceof Error ? err.message : err);
  }
  return map;
}

// ── Candidate construction ───────────────────────────────────────────────────────
async function buildCandidate(symbol: string, earningsMap: Map<string, number>): Promise<{
  candidate: Candidate;
  meta: { name: string; price: number; changePct: number; backtest: BacktestStats | null };
  atmIv: number | null;
} | null> {
  const q = await fetchQuote(symbol);
  if (!q) return null;

  const changePct = ((q.price - q.prev) / q.prev) * 100;
  const baseInput = {
    price: q.price, previousClose: q.prev, open: q.open, high: q.high, low: q.low,
    volume: q.volume, avgVolume: q.avgVol, high52w: q.high52, low52w: q.low52,
    changePercent: changePct,
  };
  const baseExtras = { trend5dPct: q.trend5d ?? undefined, emaAlignment: q.emaAlignment };

  // First pass just to learn direction — orderBlockLabel/fvgLabel never affect
  // score/signal/confidence, they're echoed straight through for display, so
  // this cheap pure-function call is the only way to know which OB/FVG side
  // (bullish vs bearish) to hand to the second pass below.
  const smDirection = smartMoneyScore(baseInput, baseExtras);
  if (smDirection.signal === "HOLD" || smDirection.confidence === "Low") return null;

  // Bars for OB/FVG detection — same opens/highs/lows/closes arrays fetchQuote
  // already pulls from Yahoo, assumed index-aligned by day (same assumption
  // options-scan/route.ts already makes for closes/highs/lows/volumes).
  const bars = q.opens.map((open, i) => ({ open, high: q.highs[i], low: q.lows[i], close: q.closes[i] }))
    .filter(b => Number.isFinite(b.open) && Number.isFinite(b.high) && Number.isFinite(b.low) && Number.isFinite(b.close));
  const ob = bars.length >= 4 ? detectOrderBlocks(bars) : { bullish: null, bearish: null };
  const fvgBars = q.highs.map((high, i) => ({ high, low: q.lows[i] }));
  const fvg = fvgBars.length >= 3 ? detectFVG(fvgBars, q.price) : null;

  const sm = smartMoneyScore(baseInput, {
    ...baseExtras,
    orderBlockLabel: smDirection.signal === "BUY" ? ob.bullish : ob.bearish,
    fvgLabel: fvg,
  });

  const chainSlice = await fetchOptionsChainSlice(symbol);
  if (!chainSlice || chainSlice.chain.length === 0) return null;

  const atr14 = calcATR14(q.highs, q.lows, q.closes);
  const realizedVol20 = calcRealizedVol20(q.closes);
  const earningsInDays = earningsMap.get(symbol) ?? NO_EARNINGS_SENTINEL;
  const signalComponents = deriveSignalComponents({
    trend5dPct: q.trend5d, changePercent: changePct, volRatio: sm.volRatio, yearPct: sm.yearPct, emaAlignment: q.emaAlignment,
  });
  const backtest = q.closes.length >= BACKTEST_WARMUP + BACKTEST_FORWARD + 10
    ? backtestDirection(q.closes, q.highs, q.lows, q.volumes, sm.signal as "BUY" | "SELL")
    : null;

  const atmIv = (() => {
    const near = chainSlice.chain.filter(c => Math.abs(c.strike - chainSlice.spot) / chainSlice.spot < 0.03);
    return near.length > 0 ? near.reduce((s, c) => s + c.iv, 0) / near.length : null;
  })();

  const candidate: Candidate = {
    symbol,
    spot: chainSlice.spot,
    canonical_direction: sm.signal === "BUY" ? "long" : "short",
    canonical_confidence: CONFIDENCE_MAP[sm.confidence as "High" | "Medium"],
    signal_components: signalComponents,
    atr14,
    realized_vol_20d: realizedVol20,
    // No accumulated IV history yet — engine's IV-sanity gate treats a null
    // rank as skip-if-unavailable rather than blocking every candidate.
    iv_rank: null,
    iv_percentile: null,
    earnings_in_days: earningsInDays,
    event_flags: deriveEventFlags(earningsInDays),
    levels: {
      bsl: [`BSL: $${sm.bslPrice.toFixed(2)}`],
      ssl: [`SSL: $${sm.sslPrice.toFixed(2)}`],
      fvg: sm.fairValueGap ? [sm.fairValueGap] : [],
      order_blocks: sm.orderBlock ? [sm.orderBlock] : [],
    },
    chain: chainSlice.chain,
  };

  return { candidate, meta: { name: q.name, price: q.price, changePct, backtest }, atmIv };
}

// ── LLM call — Sonnet first (not a cheap-fallback-chain's last resort) ──────────
async function callEngine(payload: EnginePayload): Promise<{ result: EngineResult; model: string } | null> {
  const userMessage = JSON.stringify(payload);
  let rawText: string | null = null;
  let modelUsed = "";

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const msg = await Promise.race([
        client.messages.create({
          model:      "claude-sonnet-4-6",
          max_tokens: 4000,
          system:     SYSTEM_PROMPT_V1,
          messages:   [{ role: "user", content: userMessage }],
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 45_000)),
      ]);
      rawText = (msg.content[0] as { type: string; text: string }).text?.trim() ?? null;
      if (rawText) modelUsed = "claude-sonnet-4-6";
    } catch (err) {
      console.error("[options-engine] Anthropic (primary) error:", err instanceof Error ? err.message : err);
    }
  }

  // Degraded fallback — only fires if Sonnet failed outright (availability,
  // not a quality/cost preference — that's why it's tried first above).
  if (!rawText && process.env.GEMINI_API_KEY) {
    rawText = await callOpenAICompat(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      process.env.GEMINI_API_KEY, "gemini-2.0-flash", SYSTEM_PROMPT_V1, userMessage, 4000,
    );
    if (rawText) modelUsed = "gemini-2.0-flash (fallback)";
  }
  if (!rawText && process.env.GROQ_API_KEY) {
    rawText = await callOpenAICompat(
      "https://api.groq.com/openai/v1/chat/completions",
      process.env.GROQ_API_KEY, "llama-3.3-70b-versatile", SYSTEM_PROMPT_V1, userMessage, 4000,
    );
    if (rawText) modelUsed = "llama-3.3-70b-versatile (fallback)";
  }
  if (!rawText && process.env.DEEPSEEK_API_KEY) {
    rawText = await callOpenAICompat(
      "https://api.deepseek.com/v1/chat/completions",
      process.env.DEEPSEEK_API_KEY, "deepseek-chat", SYSTEM_PROMPT_V1, userMessage, 4000,
    );
    if (rawText) modelUsed = "deepseek-chat (fallback)";
  }

  if (!rawText) return null;
  try {
    return { result: repairJSON(rawText), model: modelUsed };
  } catch (err) {
    console.error("[options-engine] JSON parse failed. Snippet:", rawText.slice(0, 300), err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Server-side invariant — bad data must never reach the shared row ────────────
function sanitizePlays(plays: EnginePlay[], directionBySymbol: Map<string, "long" | "short">): EnginePlay[] {
  return (plays ?? []).filter(p => {
    const expected = directionBySymbol.get(p.symbol);
    if (!expected || p.direction !== expected) {
      console.error(`[options-engine] Invariant: ${p.symbol} play.direction=${p.direction} but candidate.canonical_direction=${expected}. Dropped.`);
      return false;
    }
    if (p.probability < 20 || p.probability > 75) {
      console.error(`[options-engine] Invariant: ${p.symbol} probability=${p.probability} outside [20,75]. Dropped.`);
      return false;
    }
    return true;
  });
}

// ── Main orchestration — one run per ET trading day, shared by every consumer ──
export async function getOrGenerateOptionsEngineRun(
  opts: { forceRegenerate?: boolean; actor?: string } = {},
): Promise<OptionsEngineRun | { error: string; retryAfterSeconds?: number }> {
  const runDate = etTradingDate();
  const db = supabaseAdmin();

  const { data: existing, error: lookupErr } = await db
    .from("options_engine_runs").select("*").eq("run_date", runDate).maybeSingle();
  if (lookupErr) console.error("[options-engine] lookup error:", lookupErr.message);

  if (existing && !opts.forceRegenerate) {
    return existing as OptionsEngineRun;
  }

  if (existing && opts.forceRegenerate) {
    const last = existing.last_regenerated_at ?? existing.created_at;
    const elapsed = Date.now() - new Date(last as string).getTime();
    if (elapsed < RESCAN_COOLDOWN_MS) {
      return { error: "cooldown", retryAfterSeconds: Math.ceil((RESCAN_COOLDOWN_MS - elapsed) / 1000) };
    }
  }

  const earningsMap = await buildEarningsMap();
  const built = await Promise.all(UNIVERSE.map(sym => buildCandidate(sym, earningsMap)));
  const usable = built.filter((b): b is NonNullable<typeof b> => b !== null);

  const runId = `${runDate}-${Date.now()}`;
  const asOf  = new Date().toISOString();

  const payload: EnginePayload = {
    run_id: runId,
    as_of:  asOf,
    session: marketSession(),
    candidates: usable.map(u => u.candidate),
  };

  const meta: OptionsEngineMeta = {};
  for (const u of usable) {
    meta[u.candidate.symbol] = { name: u.meta.name, price: u.meta.price, changePct: u.meta.changePct, backtest: u.meta.backtest };
  }

  const called = await callEngine(payload);
  if (!called) return { error: "AI unavailable — all providers failed." };

  const directionBySymbol = new Map(usable.map(u => [u.candidate.symbol, u.candidate.canonical_direction]));
  const safePlays = sanitizePlays(called.result.plays, directionBySymbol);
  const result: EngineResult = { ...called.result, plays: safePlays };

  const row: OptionsEngineRun = {
    run_date: runDate,
    run_id: runId,
    as_of: asOf,
    prompt_version: PROMPT_VERSION,
    model: called.model,
    payload,
    result,
    meta,
    candidate_count: usable.length,
    play_count: safePlays.length,
    generated_by: opts.actor ?? "lazy",
    regenerate_count: existing ? ((existing.regenerate_count as number) ?? 0) + 1 : 0,
    last_regenerated_at: asOf,
  };

  const { error: upsertErr } = await db.from("options_engine_runs").upsert(row, { onConflict: "run_date" });
  if (upsertErr) console.error("[options-engine] upsert error:", upsertErr.message);

  // Free accumulation toward a real iv_rank once enough days build up.
  const ivRows = usable.filter(u => u.atmIv !== null).map(u => ({ symbol: u.candidate.symbol, as_of_date: runDate, atm_iv: u.atmIv }));
  if (ivRows.length > 0) {
    const { error: ivErr } = await db.from("options_iv_history").upsert(ivRows, { onConflict: "symbol,as_of_date" });
    if (ivErr) console.error("[options-engine] IV history upsert error:", ivErr.message);
  }

  return row;
}

// ── Handlers ──────────────────────────────────────────────────────────────────
export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await getOrGenerateOptionsEngineRun({ forceRegenerate: false });
    if ("error" in result) return Response.json(result, { status: 500 });
    return Response.json(result, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
  } catch (err) {
    console.error("[options-engine] GET failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await getOrGenerateOptionsEngineRun({ forceRegenerate: true, actor: session.user.email ?? "unknown" });
    if ("error" in result) {
      const status = result.retryAfterSeconds ? 429 : 500;
      return Response.json(result, { status });
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
  } catch (err) {
    console.error("[options-engine] POST failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
