import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

type ReviewRequest = {
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  shares: number;
  stopLoss: number | null;
  takeProfit: number | null;
  entryDate: string;
  exitDate: string;
  exitReason: "manual" | "stop_hit" | "target_hit";
  notes: string;
  pl: number;
  plPct: number;
};

export type TradeReview = {
  summary: string;
  frameworks: {
    ict:      { verdict: string; points: string[] };
    wyckoff:  { verdict: string; points: string[] };
    rMultiple:{ achieved: string; verdict: string };
    douglas:  { verdict: string; point: string };
    risk:     { verdict: string; points: string[] };
  };
  strengths: string[];
  mistakes:  string[];
  lesson:    string;
};

function daysBetween(a: string, b: string) {
  return Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

function buildPrompt(t: ReviewRequest): string {
  const days = daysBetween(t.entryDate, t.exitDate);
  const won  = t.pl > 0;

  const plannedRR = t.stopLoss && t.takeProfit
    ? (Math.abs(t.entryPrice - t.takeProfit) / Math.abs(t.entryPrice - t.stopLoss)).toFixed(2)
    : null;

  const actualR = t.stopLoss
    ? (t.pl / (Math.abs(t.entryPrice - t.stopLoss) * t.shares)).toFixed(2)
    : null;

  const exitDesc =
    t.exitReason === "stop_hit"   ? "stop loss hit"    :
    t.exitReason === "target_hit" ? "take profit hit"  :
                                    "closed manually";

  return `You are a master trading coach with deep expertise in price action, Wyckoff analysis, Van Tharp's R-multiple system, Mark Douglas's probability framework, and classical technical analysis. Review this completed paper trade through ALL five frameworks. Be direct, specific, and honest.

TRADE DATA:
- Symbol: ${t.symbol}
- Direction: ${t.direction}
- Entry: $${t.entryPrice.toFixed(2)} → Exit: $${t.exitPrice.toFixed(2)}
- Shares: ${t.shares}
- P&L: ${t.pl >= 0 ? "+" : ""}$${t.pl.toFixed(2)} (${t.plPct >= 0 ? "+" : ""}${t.plPct.toFixed(2)}%)
- Outcome: ${won ? "WIN" : "LOSS"}
- Stop Loss: ${t.stopLoss ? "$" + t.stopLoss.toFixed(2) : "NOT SET — major risk error"}
- Take Profit: ${t.takeProfit ? "$" + t.takeProfit.toFixed(2) : "NOT SET"}
- Planned R:R: ${plannedRR ? plannedRR + ":1" : "N/A (no SL or TP)"}
- Actual R achieved: ${actualR ? actualR + "R" : "N/A (no SL set)"}
- Hold time: ${days} day${days !== 1 ? "s" : ""}
- Exit method: ${exitDesc}
- Trader notes: ${t.notes || "None"}

Evaluate through each framework:

1. MARKET STRUCTURE & PRICE ACTION: Order Blocks, Fair Value Gaps, liquidity sweeps, session timing, OTE zones, market structure shifts, premium/discount arrays. Was the entry at a premium or discount? Was there a confirmed market structure shift before entry?

2. WYCKOFF (Richard Wyckoff): What phase was price in — Accumulation, Markup, Distribution, Markdown? Was this a Spring (shakeout below support) or Upthrust (fake breakout above resistance)? Was there a Sign of Strength (SOS) or Sign of Weakness (SOW)?

3. VAN THARP R-MULTIPLES: The actual R achieved was ${actualR ?? "unknown"}. Is this trade positive expectancy? For reference: a system needs avg R > 1.0 to be profitable. Comment on whether this trade helped or hurt the system's expectancy.

4. MARK DOUGLAS (Trading in the Zone): Was this a rule-based, planned execution — or did emotion drive the entry/exit? Did the trader define risk before entry? Did they stick to the plan or override it?

5. RISK MANAGEMENT (classical): Was the 1–2% account risk rule followed? Was the SL at a logical structure level — not arbitrary? Was R:R acceptable (minimum 1.5:1)?

Respond ONLY with valid JSON — no markdown, no extra text:
{
  "summary": "2 precise sentences: what happened and why it matters",
  "frameworks": {
    "ict":       { "verdict": "one sentence market structure evaluation", "points": ["specific price action observation 1", "specific price action observation 2"] },
    "wyckoff":   { "verdict": "one sentence Wyckoff evaluation", "points": ["Wyckoff observation 1", "Wyckoff observation 2"] },
    "rMultiple": { "achieved": "${actualR ?? "N/A"}R", "verdict": "one sentence on expectancy impact" },
    "douglas":   { "verdict": "one sentence on psychology/plan adherence", "point": "specific behavioral observation" },
    "risk":      { "verdict": "one sentence risk evaluation", "points": ["risk point 1", "risk point 2"] }
  },
  "strengths": ["up to 2 genuine strengths — skip array if none"],
  "mistakes":  ["1–3 blunt mistakes — no softening"],
  "lesson":    "the single most actionable lesson for next time"
}

Hard rules:
- No stop loss = always a mistake
- Manual close at loss without hitting stop = emotional management, always a mistake
- Be blunt about weak setups even if it was a winning trade`;
}

export async function POST(req: NextRequest) {
  const body: ReviewRequest = await req.json();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let text: string | null = null;

  try {
    const res = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 900,
      messages: [{ role: "user", content: buildPrompt(body) }],
    });
    const block = res.content.find(b => b.type === "text");
    if (block?.type === "text") text = block.text.trim();
  } catch (err) {
    console.error("Anthropic trade-review error:", err);
  }

  if (!text && process.env.GROQ_API_KEY) {
    try {
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 900,
          messages: [{ role: "user", content: buildPrompt(body) }],
        }),
      });
      const d = await groqRes.json();
      text = d.choices?.[0]?.message?.content?.trim() ?? null;
    } catch (err) {
      console.error("Groq trade-review error:", err);
    }
  }

  if (!text) return Response.json({ error: "AI unavailable" }, { status: 503 });

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    return Response.json(JSON.parse(jsonMatch[0]));
  } catch {
    return Response.json({ error: "Parse error", raw: text }, { status: 500 });
  }
}
