export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 55;

import Anthropic from "@anthropic-ai/sdk";
import { cacheGet, cacheSet } from "../../../lib/sentiment";

const HAIKU = "claude-haiku-4-5-20251001";

export interface ClassifyInput {
  text:    string;
  ticker?: string;
  source?: string;
}

export interface ClassifyOutput {
  sentiment:  "Bullish" | "Bearish" | "Neutral";
  confidence: number;
  reason:     string;
}

function headlineHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  return `classify:${Math.abs(h).toString(36)}`;
}

function safe(out: Partial<ClassifyOutput>): ClassifyOutput {
  return {
    sentiment:  (["Bullish", "Bearish", "Neutral"] as const).includes(out?.sentiment as "Bullish") ? out.sentiment as ClassifyOutput["sentiment"] : "Neutral",
    confidence: typeof out?.confidence === "number" ? Math.max(0, Math.min(100, out.confidence)) : 50,
    reason:     typeof out?.reason === "string" ? out.reason.slice(0, 120) : "",
  };
}

// Single Haiku call for all uncached headlines — fast, no per-item rate-limit risk
async function batchClassify(items: ClassifyInput[]): Promise<ClassifyOutput[]> {
  const results: (ClassifyOutput | null)[] = items.map(item =>
    cacheGet<ClassifyOutput>(headlineHash(item.text + (item.ticker ?? "")))
  );

  const uncached = results.reduce<number[]>((acc, r, i) => (r === null ? [...acc, i] : acc), []);
  if (uncached.length === 0) return results as ClassifyOutput[];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    uncached.forEach(i => { results[i] = { sentiment: "Neutral", confidence: 0, reason: "AI unavailable" }; });
    return results as ClassifyOutput[];
  }

  const client  = new Anthropic({ apiKey });
  const toClassify = uncached.map(i => items[i]);
  const lines   = toClassify
    .map((it, n) => `${n + 1}. "${it.text}"${it.source ? ` (${it.source})` : ""}`)
    .join("\n");

  try {
    // Race the API call against a 22-second hard timeout
    const resp = await Promise.race([
      client.messages.create({
        model:      HAIKU,
        max_tokens: Math.min(toClassify.length * 80 + 100, 2048),
        system: `You are a financial news classifier. Classify each headline's market sentiment.

Return ONLY a valid JSON array — one object per headline in the same order:
[{"sentiment":"Bullish"|"Bearish"|"Neutral","confidence":0-100,"reason":"<10 words"}]

Rules: Bullish = good for market/stock. Bearish = bad. Neutral = mixed/irrelevant. No extra text.`,
        messages: [{ role: "user", content: `Classify these ${toClassify.length} headlines:\n${lines}` }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("classify_timeout")), 22_000)
      ),
    ]);

    const text  = resp.content.find(b => b.type === "text")?.text ?? "[]";
    const match = text.match(/\[[\s\S]*\]/);
    const parsed: Partial<ClassifyOutput>[] = match ? (JSON.parse(match[0]) as Partial<ClassifyOutput>[]) : [];

    uncached.forEach((origIdx, n) => {
      const out = safe(parsed[n] ?? {});
      results[origIdx] = out;
      cacheSet(headlineHash(items[origIdx].text + (items[origIdx].ticker ?? "")), out, 60 * 60 * 1_000);
    });
  } catch {
    uncached.forEach(i => { results[i] = { sentiment: "Neutral", confidence: 30, reason: "Classification unavailable" }; });
  }

  return results as ClassifyOutput[];
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { headlines: ClassifyInput[] };
    if (!Array.isArray(body.headlines) || body.headlines.length === 0) {
      return Response.json({ error: "headlines array required" }, { status: 400 });
    }
    const items      = body.headlines.slice(0, 30);
    const classified = await batchClassify(items);
    return Response.json({ classified, model: HAIKU, count: classified.length });
  } catch {
    return Response.json({ error: "Classification failed" }, { status: 500 });
  }
}
