import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/rateLimit";

export type TradeScore = {
  overall: number;
  trend:   { score: number; note: string };
  entry:   { score: number; note: string };
  risk:    { score: number; note: string };
  setup:   { score: number; note: string };
  verdict: "Take it" | "Wait for better entry" | "Skip it";
  warning: string | null;
};

function buildPrompt(body: {
  symbol: string; direction: string; entryPrice: number;
  stopLoss: number | null; takeProfit: number | null;
  currentPrice: number | null; notes: string;
}): string {
  const rrRatio = body.stopLoss && body.takeProfit
    ? (Math.abs(body.entryPrice - body.takeProfit) / Math.abs(body.entryPrice - body.stopLoss)).toFixed(2)
    : null;

  const slPct = body.stopLoss
    ? (Math.abs(body.entryPrice - body.stopLoss) / body.entryPrice * 100).toFixed(2)
    : null;

  const lines = [
    `Symbol: ${body.symbol}`,
    `Direction: ${body.direction}`,
    `Entry Price: $${body.entryPrice.toFixed(2)}`,
    body.currentPrice ? `Current Market Price: $${body.currentPrice.toFixed(2)}` : null,
    body.stopLoss ? `Stop Loss: $${body.stopLoss.toFixed(2)} (${slPct}% risk)` : "Stop Loss: NOT SET",
    body.takeProfit ? `Take Profit: $${body.takeProfit.toFixed(2)}` : "Take Profit: NOT SET",
    rrRatio ? `R:R Ratio: ${rrRatio}:1` : "R:R Ratio: Cannot calculate (missing SL or TP)",
    `Trader Notes: ${body.notes || "None"}`,
  ].filter(Boolean).join("\n");

  return `You are a master trading coach scoring a setup BEFORE entry. Draw from price action analysis, Wyckoff analysis, Van Tharp's R-multiple system, Mark Douglas's probability framework, and classical technical analysis. Be strict and honest — a mediocre setup should score 4–6, not 7–8.

PROPOSED TRADE:
${lines}

Score 1–10 on four criteria:

1. TREND ALIGNMENT — Does direction align with higher timeframe structure? (Use market structure analysis, Wyckoff phase, and classical trend analysis)
2. ENTRY QUALITY — Is the entry at a logical institutional level (Order Block/FVG/OTE zone)? Is it precise or chasing?
3. RISK MANAGEMENT — Is SL at a logical structure level? Is R:R ≥ 1.5:1? Is risk % acceptable?
4. SETUP CLARITY — How clearly defined is the setup? (Wyckoff spring/upthrust, Fair Value Gap, Order Block, liquidity sweep, etc.)

Hard rules:
- No stop loss → Risk score ≤ 3
- R:R below 1.5:1 → Entry score ≤ 5
- No take profit → Setup score reduced by 2 minimum
- Entry far from current price without notes → Entry score ≤ 4

Respond ONLY with valid JSON, no markdown:
{
  "overall": <1-10>,
  "trend":  { "score": <1-10>, "note": "<one specific sentence>" },
  "entry":  { "score": <1-10>, "note": "<one specific sentence>" },
  "risk":   { "score": <1-10>, "note": "<one specific sentence>" },
  "setup":  { "score": <1-10>, "note": "<one specific sentence>" },
  "verdict": "<exactly one of: Take it | Wait for better entry | Skip it>",
  "warning": "<single most important concern, or null>"
}`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit(`trade-score:${session.user.email}`, 20, 60 * 60 * 1000)) {
    return Response.json({ error: "Too many requests. Try again in an hour." }, { status: 429 });
  }

  const body = await req.json();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let text: string | null = null;

  try {
    const res = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 500,
      messages: [{ role: "user", content: buildPrompt(body) }],
    });
    const block = res.content.find(b => b.type === "text");
    if (block?.type === "text") text = block.text.trim();
  } catch (err) {
    console.error("Anthropic trade-score error:", err);
  }

  if (!text && process.env.GROQ_API_KEY) {
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 500,
          messages: [{ role: "user", content: buildPrompt(body) }],
        }),
      });
      const d = await groqRes.json();
      text = d.choices?.[0]?.message?.content?.trim() ?? null;
    } catch (err) {
      console.error("Groq trade-score error:", err);
    }
  }

  if (!text) return Response.json({ error: "AI unavailable" }, { status: 503 });

  try {
    const json = text.match(/\{[\s\S]*\}/);
    if (!json) throw new Error("No JSON");
    return Response.json(JSON.parse(json[0]));
  } catch {
    return Response.json({ error: "Parse error", raw: text }, { status: 500 });
  }
}
