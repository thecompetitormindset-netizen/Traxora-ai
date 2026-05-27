export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

import { callClaude, cacheGet, cacheSet, PROMPTS } from "../../../lib/sentiment";

// Cache per headline to avoid re-classifying duplicates
function headlineHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return `classify:${Math.abs(h).toString(36)}`;
}

export interface ClassifyInput {
  text: string;
  ticker?: string;
  source?: string;
}

export interface ClassifyOutput {
  sentiment: "Bullish" | "Bearish" | "Neutral";
  confidence: number;
  reason: string;
}

async function classifyOne(item: ClassifyInput): Promise<ClassifyOutput> {
  const key    = headlineHash(item.text + (item.ticker ?? ""));
  const cached = cacheGet<ClassifyOutput>(key);
  if (cached) return cached;

  const result = await callClaude(
    "classify",
    PROMPTS.classify(item.ticker ?? ""),
    `Headline: "${item.text}"\nSource: ${item.source ?? "unknown"}`,
    150,
  );

  if (!result.ok) {
    return { sentiment: "Neutral", confidence: 0, reason: "Classification unavailable" };
  }

  try {
    const parsed = JSON.parse(result.text) as ClassifyOutput;
    const out: ClassifyOutput = {
      sentiment:  ["Bullish","Bearish","Neutral"].includes(parsed.sentiment) ? parsed.sentiment : "Neutral",
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(100, parsed.confidence)) : 50,
      reason:     typeof parsed.reason === "string" ? parsed.reason : "",
    };
    cacheSet(key, out, 60 * 60 * 1_000); // cache 1h
    return out;
  } catch {
    return { sentiment: "Neutral", confidence: 30, reason: "Parse error" };
  }
}

// Parallel batches of 20 (Haiku rate limit headroom)
async function batchClassify(items: ClassifyInput[]): Promise<ClassifyOutput[]> {
  const BATCH = 20;
  const results: ClassifyOutput[] = [];
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(classifyOne));
    results.push(...batchResults);
  }
  return results;
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { headlines: ClassifyInput[] };
    if (!Array.isArray(body.headlines) || body.headlines.length === 0) {
      return Response.json({ error: "headlines array required" }, { status: 400 });
    }
    const items = body.headlines.slice(0, 100); // cap at 100 per request
    const classified = await batchClassify(items);
    return Response.json({
      classified,
      model: "claude-haiku-4-5-20251001",
      count: classified.length,
    });
  } catch {
    return Response.json({ error: "Classification failed" }, { status: 500 });
  }
}
