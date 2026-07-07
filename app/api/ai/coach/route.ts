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
      return await callOpenAICompat("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", geminiKey, "gemini-2.0-flash", SYSTEM_FRAMEWORK, prompt, 600);
    } catch (err) { console.error("Gemini coach error:", err instanceof Error ? err.message : err); }
  }

  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const res = await client.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 600,
        system: SYSTEM_FRAMEWORK,
        messages: [{ role: "user", content: prompt }],
      });
      return res.content.filter(b => b.type === "text").map(b => (b as { type: "text"; text: string }).text).join("").trim();
    } catch (err) { console.error("Anthropic coach error:", err instanceof Error ? err.message : err); }
  }

  if (groqKey) {
    try {
      return await callOpenAICompat("https://api.groq.com/openai/v1/chat/completions", groqKey, "llama-3.3-70b-versatile", SYSTEM_FRAMEWORK, prompt, 600);
    } catch (err) { console.error("Groq coach error:", err instanceof Error ? err.message : err); }
  }

  if (deepseekKey) {
    try {
      return await callOpenAICompat("https://api.deepseek.com/v1/chat/completions", deepseekKey, "deepseek-chat", SYSTEM_FRAMEWORK, prompt, 600);
    } catch (err) { console.error("DeepSeek coach error:", err instanceof Error ? err.message : err); }
  }

  throw new Error("No AI provider available");
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ ok: false, reason: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!checkRateLimit(`coach:${session.user.email}`, 5, 60_000)) {
    return Response.json({ ok: false, reason: "RATE_LIMITED" }, { status: 429 });
  }

  // Two callers, two payloads: AutoCoach sends { trades, wins, losses, winRate },
  // the strategy page sends those plus a rich { summary } of closed-trade analytics.
  const body = await req.json().catch(() => ({}));
  const { trades = [], wins = 0, losses = 0, winRate = 0, summary } = body as {
    trades?: Array<{ side: string; quantity: number; symbol: string; price: number }>;
    wins?: number; losses?: number; winRate?: number | string;
    summary?: Record<string, unknown>;
  };

  const recent = (Array.isArray(trades) ? trades : [])
    .slice(0, 20)
    .map((t) => `${t.side} ${t.quantity}x ${t.symbol.replace(".US", "").replace(".COMM", "")} @$${Number(t.price).toFixed(2)}`)
    .join(" | ");

  const prompt = `You are an elite trading coach operating under this exact trading system:

SYSTEM RULES:
- Universe: 30-stock watchlist only. Max 1% account risk per trade. Max 3 concurrent positions. Max 3 trades/day. Daily loss limit 2.5%. Hard close all positions by 3:45 PM ET.

THREE VALID MODELS:
Model A — Judas Swing: Asian/London session sweeps a short-term low (bullish) or high (bearish) → displacement candle prints MSS/CHoCH → enter on retest of the Order Block or FVG left by displacement. Only valid London (2–5 AM ET) and NY AM (8:30–11 AM ET).
Model B — Silver Bullet: Three windows only — 10:00–11:00 AM ET, 2:00–3:00 PM ET, 11:00 PM–12:00 AM ET. Wait for price to sweep a liquidity pool within the window → FVG forms on the displacement → enter the FVG retest. Do not trade outside these windows.
Model C — Power of 3 / AMD: Accumulation (Asian range builds), Manipulation (fake move sweeps stops at open), Distribution (true directional move). Enter during the distribution leg after manipulation sweep is confirmed.

ENTRY CHECKLIST (all 7 required for A-grade):
1. Short-term high or low swept (liquidity taken)
2. MSS or CHoCH printed on the sweep candle or immediately after
3. Entry is inside a premium array (OB, FVG, BISI/SIBI) — premium for shorts, discount for longs
4. Active Kill Zone: London (2–5 AM ET), NY AM (8:30–11 AM ET), or Silver Bullet windows
5. Minimum R:R 2.5:1 confirmed before entry
6. Position size ≤ 1% account risk
7. Not entering at NDOG/NWOG unless level has been clearly rejected or broken with displacement

FORBIDDEN BEHAVIORS: revenge trading, trading outside kill zones, chasing price without OB/FVG retest, moving stop to break-even before 1R hit, more than 3 trades/day, holding past 3:45 PM ET.

GRADING: A = all 7 checklist items, correct model, R:R ≥ 2.5:1 | B = 5–6 items, minor deviation | C = 3–4 items | D = 1–2 items | F = checklist ignored or forbidden behavior.

---

Trader stats:
- Win Rate: ${winRate}% (${wins}W / ${losses}L, ${Number(wins) + Number(losses)} total closed trades)
- Recent trades: ${recent || (summary ? "see detailed summary below" : "no trades yet")}
${summary ? `
Detailed performance summary (win/loss patterns, per-symbol results, exit discipline, best/worst trades — analyse these for repeated mistakes and coach against them specifically):
${JSON.stringify(summary)}
` : ""}

Write exactly this format (no markdown, no asterisks):

ASSESSMENT: [1 direct sentence — which models they're executing well or poorly, overall discipline level]
WEAKNESS: [1 specific failure pattern mapped to checklist items or forbidden behaviors — name the item number if relevant]
STRENGTH: [1 genuine strength — be specific to their trade log]
TIPS:
1. [Concrete fix for their entry process — reference the exact model (A/B/C) and checklist item]
2. [Concrete fix for exits or risk management — reference specific rules from the system]
3. [Pre-session routine or mindset tip — reference bias setting, kill zone discipline, or journal habit]

Reference actual symbols from their log. No generic advice.`;

  try {
    const report = await callAI(prompt);
    return Response.json({ report });
  } catch (err) {
    const status = (err as { status?: unknown }).status;
    if (status === 401 || status === 403) {
      return Response.json({ ok: false, reason: "AI_UNAVAILABLE" }, { status: 503 });
    }
    return Response.json({ error: "Coaching unavailable" }, { status: 500 });
  }
}
