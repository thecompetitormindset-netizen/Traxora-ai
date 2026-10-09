import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/rateLimit";

import { SYSTEM_FRAMEWORK } from "@/app/lib/systemFramework";

async function callOpenAICompat(url: string, key: string, model: string, system: string, user: string, maxTokens: number): Promise<string> {
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [
      { role: "system", content: system },
      { role: "user",   content: user   },
    ]}),
  });
  if (!res.ok) throw new Error(`${url} ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("Empty response");
  return text;
}

async function callAI(prompt: string): Promise<string> {
  const geminiKey    = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const groqKey      = process.env.GROQ_API_KEY;
  const deepseekKey  = process.env.DEEPSEEK_API_KEY;

  if (geminiKey) {
    try {
      return await callOpenAICompat("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", geminiKey, "gemini-2.0-flash", SYSTEM_FRAMEWORK, prompt, 800);
    } catch (err) { console.error("Gemini journal error:", err instanceof Error ? err.message : err); }
  }

  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const res = await client.messages.create({
        model: "claude-haiku-4-5-20251001", max_tokens: 800,
        system: SYSTEM_FRAMEWORK,
        messages: [{ role: "user", content: prompt }],
      });
      return res.content.filter(b => b.type === "text").map(b => (b as { type: "text"; text: string }).text).join("").trim();
    } catch (err) { console.error("Anthropic journal error:", err instanceof Error ? err.message : err); }
  }

  if (groqKey) {
    try {
      return await callOpenAICompat("https://api.groq.com/openai/v1/chat/completions", groqKey, "llama-3.3-70b-versatile", SYSTEM_FRAMEWORK, prompt, 800);
    } catch (err) { console.error("Groq journal error:", err instanceof Error ? err.message : err); }
  }

  if (deepseekKey) {
    try {
      return await callOpenAICompat("https://api.deepseek.com/v1/chat/completions", deepseekKey, "deepseek-chat", SYSTEM_FRAMEWORK, prompt, 800);
    } catch (err) { console.error("DeepSeek journal error:", err instanceof Error ? err.message : err); }
  }

  throw new Error("No AI provider available");
}

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
  const session = await auth();
  if (!session?.user) {
    return Response.json({ ok: false, reason: "UNAUTHORIZED", error: "Sign in to use AI features.", signIn: true }, { status: 401 });
  }
  if (!checkRateLimit(`journal:${session.user.email}`, 10, 60_000)) {
    return Response.json({ ok: false, reason: "RATE_LIMITED" }, { status: 429 });
  }

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

  // Valid market structure concept tags for the AI to choose from
  const CONCEPT_TAGS = ["OB","FVG","LIQ","MSS","OTE","PD","BRK","PO3","KZ","NDOG","BPR","CE","JS","MB","SSL","BSL"];

  const prompt = isSell
    ? `You are a professional trading coach reviewing a completed paper trade.

Trade: ${tradeContext}

Respond in this exact JSON format (no markdown, raw JSON only):
{
  "entry": "<2 sentences: sentence 1 states precisely what setup triggered the entry and what price level was the catalyst. sentence 2 states the outcome and what it reveals about execution quality.>",
  "grade": "${grade}",
  "verdict": "<1 sentence summary of how this trade went>",
  "concepts": ["<pick 1–3 exact tags from: ${CONCEPT_TAGS.join(", ")} that were most relevant to this trade>"],
  "mistakes": ${closeReason === "stop" || (plPct != null && plPct < 0)
    ? `["<specific mistake 1 using precise market structure terminology>", "<specific mistake 2>"]`
    : `[]`},
  "wins": ${closeReason === "tp" || (plPct != null && plPct > 0)
    ? `["<specific thing done right 1 — name the exact concept executed correctly>", "<specific thing done right 2>"]`
    : `[]`},
  "lesson": "<1 concrete actionable lesson from this trade — name the exact concept to apply next time>"
}

Rules:
- Be specific and technical. Only reference concepts from this list: ${CONCEPT_TAGS.join(", ")}.
- For "concepts": pick ONLY concepts you can genuinely identify from the trade context given. If unsure, pick PD (Premium/Discount) which is always determinable.
- Be direct about mistakes — do not soften errors. Grade is already determined, do not change it.`
    : `You are a professional trading journal assistant.

Trade: ${tradeContext}

Respond in this exact JSON format (no markdown, raw JSON only):
{
  "entry": "<2 sentences: sentence 1 names the exact setup present at entry (e.g. price tapping a bullish FVG at discount, or breaking above a bearish OB). sentence 2 states the specific price level to watch for confirmation or invalidation.>",
  "concepts": ["<pick 1–3 exact tags from: ${CONCEPT_TAGS.join(", ")} most relevant to this entry>"]
}

Rules:
- Only reference concepts from this list: ${CONCEPT_TAGS.join(", ")}.
- For "concepts": pick ONLY what can reasonably be identified from the context (price, session time, P/D positioning). If uncertain, use PD.
- No fluff. Exactly 2 sentences in "entry".`;

  try {
    const raw = await callAI(prompt);

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
    const status = (err as { status?: unknown }).status;
    if (status === 401 || status === 403) {
      return Response.json({ ok: false, reason: "AI_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[Journal route] Anthropic error:", err);
    return Response.json({ error: "Journal generation failed" }, { status: 500 });
  }
}
