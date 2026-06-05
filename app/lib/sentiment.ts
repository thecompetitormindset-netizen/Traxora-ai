import Anthropic from "@anthropic-ai/sdk";

// ── Model routing table ────────────────────────────────────────────────────
// Haiku  → volume work  (classify, filter, tag)
// Sonnet → synthesis    (aggregate, summarize, compare)
// Opus   → deep report  (smart money analysis, trade-impacting conclusions)

export const MODEL_MAP = {
  classify:   "claude-haiku-4-5-20251001",
  synthesize: "claude-sonnet-4-6",
  master:     "claude-sonnet-4-6",
} as const;

type TaskKey = keyof typeof MODEL_MAP;

const COST_PER_M: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5-20251001": { in: 1.00,  out: 5.00  },
  "claude-sonnet-4-6":         { in: 3.00,  out: 15.00 },
};

// ── In-process usage log (resets on cold start) ───────────────────────────
export interface UsageEntry {
  model: string;
  task: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  ts: number;
}
export const usageLog: UsageEntry[] = [];

export function getUsageSummary() {
  const dayAgo = Date.now() - 86_400_000;
  const recent = usageLog.filter(l => l.ts > dayAgo);
  const totalCost = recent.reduce((s, l) => s + l.costUsd, 0);
  const callsByTask: Record<string, number> = {};
  const costByModel: Record<string, number> = {};
  for (const l of recent) {
    callsByTask[l.task] = (callsByTask[l.task] ?? 0) + 1;
    costByModel[l.model] = (costByModel[l.model] ?? 0) + l.costUsd;
  }
  return { totalCost, callsByTask, costByModel, entries: recent.length };
}

// ── TTL in-memory cache ────────────────────────────────────────────────────
interface CacheEntry { data: unknown; expires: number }
const _cache = new Map<string, CacheEntry>();

export function cacheGet<T>(key: string): T | null {
  const e = _cache.get(key);
  if (!e || Date.now() > e.expires) { _cache.delete(key); return null; }
  return e.data as T;
}

export function cacheSet(key: string, data: unknown, ttlMs: number): void {
  _cache.set(key, { data, expires: Date.now() + ttlMs });
}

// ── Retry with exponential backoff ────────────────────────────────────────
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 429 && i < retries) {
        await new Promise(r => setTimeout(r, (2 ** i) * 1_000));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable");
}

// ── Core callClaude helper ─────────────────────────────────────────────────
// Routes to the correct model, logs cost, handles failures gracefully.
// Hard timeout: 25s so callers never hang past Vercel's function limit.

const CALL_TIMEOUT_MS = 25_000;

export async function callClaude(
  task: TaskKey,
  system: string,
  userContent: string,
  maxTokens = 1_024,
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, reason: "AI_UNAVAILABLE" };

  const model = MODEL_MAP[task];
  const client = new Anthropic({ apiKey });

  try {
    const resp = await Promise.race([
      withRetry(() =>
        client.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: userContent }],
        }),
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("claude_timeout")), CALL_TIMEOUT_MS)
      ),
    ]);

    const text = resp.content.find(b => b.type === "text")?.text ?? "";

    const costs = COST_PER_M[model];
    if (costs) {
      const costUsd =
        (resp.usage.input_tokens  / 1_000_000) * costs.in +
        (resp.usage.output_tokens / 1_000_000) * costs.out;
      usageLog.push({
        model, task,
        inputTokens: resp.usage.input_tokens,
        outputTokens: resp.usage.output_tokens,
        costUsd,
        ts: Date.now(),
      });
      if (usageLog.length > 2_000) usageLog.splice(0, usageLog.length - 2_000);
    }

    return { ok: true, text };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) return { ok: false, reason: "AI_UNAVAILABLE" };
    return { ok: false, reason: "AI_ERROR" };
  }
}

// ── Prompts ────────────────────────────────────────────────────────────────
// Centralised so every caller uses the same wording.

export const PROMPTS = {
  classify: (ticker: string) =>
    `You are a financial news classifier. Classify the sentiment of the provided headline toward ${ticker || "the broader market"}.

Respond ONLY with valid JSON in this exact format:
{"sentiment":"Bullish"|"Bearish"|"Neutral","confidence":0-100,"reason":"one concise sentence explaining why"}

Rules:
- Bullish = positive for the stock/market (earnings beat, product launch, upgrade, buyback)
- Bearish = negative (miss, downgrade, regulatory action, macro headwind)
- Neutral = informational, mixed, or irrelevant
- confidence 90-100 = clear signal; 60-89 = moderate; 30-59 = weak; <30 = noise
- reason must be under 12 words`,

  synthesize: (ticker: string, count: number) =>
    `You are an institutional equity analyst synthesizing ${count} classified news items for ${ticker || "the market"}.

Respond ONLY with valid JSON:
{
  "score": integer from -100 (extreme bearish) to +100 (extreme bullish),
  "summary": "2-3 sentences describing the overall sentiment and why",
  "drivers": ["driver 1", "driver 2", "driver 3"],
  "regime": "Risk-On" | "Risk-Off" | "Transitional",
  "shift": "improving" | "deteriorating" | "stable"
}

Base the score on the distribution of Bullish/Bearish/Neutral signals, weighted by confidence.
Identify the 3 dominant narratives driving sentiment.`,

  master: `You are an institutional market analyst with expertise in smart money concepts, price action, liquidity, and order flow. Generate a comprehensive market sentiment report.

Respond ONLY with valid JSON:
{
  "narrative": "2-3 sentences on the dominant market narrative and institutional bias",
  "contrarian": "1-2 sentences identifying the most compelling contrarian opportunity where consensus may be wrong",
  "smartMoneySignal": "Accumulation" | "Distribution" | "Consolidation" | "Markup" | "Markdown",
  "retailVsInstitutional": "brief description of any divergence between retail sentiment and smart money positioning",
  "divergences": ["ticker/sector where sentiment and price disagree significantly"],
  "themes": ["top theme 1", "top theme 2", "top theme 3", "top theme 4", "top theme 5"],
  "catalysts": ["event likely to shift sentiment tomorrow/this week"],
  "positionGuidance": "brief actionable note for the user's specific positions",
  "overallBias": "Bullish" | "Bearish" | "Neutral" | "Mixed",
  "confidence": 0-100
}

Use smart money concepts: liquidity sweeps, fair value gaps, order blocks, institutional order flow.
Focus on where smart money is positioned vs. where retail is positioned.`,
};
