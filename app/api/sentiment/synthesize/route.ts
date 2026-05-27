export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

import { callClaude, cacheGet, cacheSet, PROMPTS } from "../../../lib/sentiment";

export interface SynthesizeInput {
  ticker: string;
  items: Array<{
    text:       string;
    sentiment:  string;
    confidence: number;
    source?:    string;
  }>;
}

export interface SynthesizeOutput {
  ticker:  string;
  score:   number;
  summary: string;
  drivers: string[];
  regime:  string;
  shift:   string;
  bullish: number;
  bearish: number;
  neutral: number;
  model:   string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as SynthesizeInput;
    if (!body.ticker || !Array.isArray(body.items) || body.items.length === 0) {
      return Response.json({ error: "ticker and items required" }, { status: 400 });
    }

    const ticker = body.ticker.toUpperCase();
    const items  = body.items.slice(0, 50);
    const cacheKey = `synthesize:${ticker}:${items.length}`;
    const cached = cacheGet<SynthesizeOutput>(cacheKey);
    if (cached) return Response.json(cached);

    // Distribution count
    const bullish = items.filter(i => i.sentiment === "Bullish").length;
    const bearish = items.filter(i => i.sentiment === "Bearish").length;
    const neutral = items.length - bullish - bearish;

    const itemsText = items
      .slice(0, 30)
      .map((i, idx) => `${idx + 1}. [${i.sentiment}/${i.confidence}%] "${i.text}"${i.source ? ` (${i.source})` : ""}`)
      .join("\n");

    const result = await callClaude(
      "synthesize",
      PROMPTS.synthesize(ticker, items.length),
      `Ticker: ${ticker}\nTotal items: ${items.length} (Bullish: ${bullish}, Bearish: ${bearish}, Neutral: ${neutral})\n\nClassified news:\n${itemsText}`,
      512,
    );

    if (!result.ok) {
      return Response.json({ ok: false, reason: result.reason }, { status: 503 });
    }

    type RawOutput = { score?: number; summary?: string; drivers?: string[]; regime?: string; shift?: string };
    let parsed: RawOutput = {};
    try { parsed = JSON.parse(result.text) as RawOutput; } catch { /* ignore */ }

    const out: SynthesizeOutput = {
      ticker,
      score:   typeof parsed.score === "number" ? Math.max(-100, Math.min(100, parsed.score)) : 0,
      summary: typeof parsed.summary === "string" ? parsed.summary : "Insufficient data for synthesis.",
      drivers: Array.isArray(parsed.drivers) ? parsed.drivers.slice(0, 3) : [],
      regime:  typeof parsed.regime === "string" ? parsed.regime : "Transitional",
      shift:   typeof parsed.shift  === "string" ? parsed.shift  : "stable",
      bullish,
      bearish,
      neutral,
      model:   "claude-sonnet-4-6",
    };

    cacheSet(cacheKey, out, 60 * 60 * 1_000); // cache 1h
    return Response.json(out);
  } catch {
    return Response.json({ error: "Synthesis failed" }, { status: 500 });
  }
}
