import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function gradeFromPL(plPct?: number, closeReason?: string): string {
  if (closeReason === "tp") return "A";
  if (closeReason === "stop") return "D";
  if (plPct == null) return "C";
  if (plPct >= 8)  return "A";
  if (plPct >= 4)  return "B";
  if (plPct >= 0)  return "C";
  if (plPct >= -4) return "D";
  return "F";
}

export async function POST(req: Request) {
  const {
    symbol, side, quantity, price,
    entryPrice, pl, plPct, closeReason,
    stopLoss, takeProfit,
  } = await req.json();

  const clean  = String(symbol).replace(".US", "").replace(".COMM", "");
  const isSell = side === "SELL";
  const grade  = isSell ? gradeFromPL(plPct, closeReason) : null;

  // Build context string for the prompt
  const tradeContext = [
    `${side} ${quantity} share${quantity !== 1 ? "s" : ""} of ${clean} @ $${Number(price).toFixed(2)}`,
    isSell && entryPrice  ? `Entry was @ $${Number(entryPrice).toFixed(2)}` : null,
    isSell && pl != null  ? `P&L: ${pl >= 0 ? "+" : ""}$${Number(pl).toFixed(2)} (${Number(plPct).toFixed(2)}%)` : null,
    closeReason === "stop" ? "Position closed by stop loss — loss exceeded risk tolerance" : null,
    closeReason === "tp"   ? "Position closed at take profit target — full plan executed" : null,
    closeReason === "manual" && isSell ? "Position closed manually" : null,
    stopLoss   ? `Stop loss was set at $${Number(stopLoss).toFixed(2)}` : null,
    takeProfit ? `Take profit was set at $${Number(takeProfit).toFixed(2)}` : null,
  ].filter(Boolean).join(". ");

  // Valid ICT concept tags for the AI to choose from
  const ICT_TAGS = ["OB","FVG","LIQ","MSS","OTE","PD","BRK","PO3","KZ","NDOG","BPR","CE","JS","MB","SSL","BSL"];

  const prompt = isSell
    ? `You are a professional ICT trading coach reviewing a completed paper trade.

Trade: ${tradeContext}

Respond in this exact JSON format (no markdown, raw JSON only):
{
  "entry": "<2 sentences: sentence 1 states precisely what ICT setup triggered the entry and what price level was the catalyst. sentence 2 states the outcome and what it reveals about execution quality.>",
  "grade": "${grade}",
  "verdict": "<1 sentence summary of how this trade went>",
  "concepts": ["<pick 1–3 exact tags from: ${ICT_TAGS.join(", ")} that were most relevant to this trade>"],
  "mistakes": ${closeReason === "stop" || (plPct != null && plPct < 0)
    ? `["<specific mistake 1 using exact ICT terminology>", "<specific mistake 2>"]`
    : `[]`},
  "wins": ${closeReason === "tp" || (plPct != null && plPct > 0)
    ? `["<specific thing done right 1 — name the exact ICT concept executed correctly>", "<specific thing done right 2>"]`
    : `[]`},
  "lesson": "<1 concrete actionable lesson from this trade — name the exact ICT concept to apply next time>"
}

Rules:
- Be specific and technical. Only reference ICT concepts from this list: ${ICT_TAGS.join(", ")}.
- For "concepts": pick ONLY concepts you can genuinely identify from the trade context given. If unsure, pick PD (Premium/Discount) which is always determinable.
- Be direct about mistakes — do not soften errors. Grade is already determined, do not change it.`
    : `You are a professional ICT trading journal assistant.

Trade: ${tradeContext}

Respond in this exact JSON format (no markdown, raw JSON only):
{
  "entry": "<2 sentences: sentence 1 names the exact ICT setup present at entry (e.g. price tapping a bullish FVG at discount, or breaking above a bearish OB). sentence 2 states the specific price level to watch for confirmation or invalidation.>",
  "concepts": ["<pick 1–3 exact tags from: ${ICT_TAGS.join(", ")} most relevant to this entry>"]
}

Rules:
- Only reference ICT concepts from this list: ${ICT_TAGS.join(", ")}.
- For "concepts": pick ONLY what can reasonably be identified from the context (price, session time, P/D positioning). If uncertain, use PD.
- No fluff. Exactly 2 sentences in "entry".`;

  try {
    const response = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages:   [{ role: "user", content: prompt }],
    });

    const raw = response.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    // Parse JSON response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Journal route] No JSON in response:", raw.slice(0, 200));
      return Response.json({ error: "Parse error" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return Response.json({
      entry:    parsed.entry ?? raw,
      concepts: parsed.concepts ?? [],
      analysis: isSell ? {
        grade:    parsed.grade  ?? grade,
        verdict:  parsed.verdict ?? "",
        concepts: parsed.concepts ?? [],
        mistakes: parsed.mistakes ?? [],
        wins:     parsed.wins ?? [],
        lesson:   parsed.lesson ?? "",
      } : null,
    });
  } catch (err) {
    console.error("[Journal route] Anthropic error:", err);
    return Response.json({ error: "Journal generation failed" }, { status: 500 });
  }
}
