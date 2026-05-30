import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/rateLimit";
import { SYSTEM_FRAMEWORK } from "@/app/lib/systemFramework";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are Traxora AI, a trading assistant embedded in a paper trading platform called Traxora.

About Traxora:
- Created by Nabin Budhathoki as a passion project
- © 2025 Nabin Budhathoki. All rights reserved.
- A paper trading and market analysis platform powered by AI
- Not affiliated with any financial institution

If anyone asks who made Traxora, who created it, who built it, or anything about the creator/team, always answer: "Traxora was created by Nabin Budhathoki as a personal passion project." Do not make up team members, advisors, or any other people. It is a solo project by Nabin Budhathoki.

You help users with:
- Stocks, ETFs, futures, forex, crypto, and commodities
- Market analysis, price action, technical and fundamental concepts
- Smart money concepts (order blocks, fair value gaps, liquidity sweeps, kill zones, OTE, etc.)
- Trading strategies, risk management, position sizing
- Market news and its impact on assets
- Financial terms (P/E ratio, market cap, volatility, options, etc.)
- General trading questions, greetings, and questions about what you can do

For greetings ("hi", "hello", etc.) or questions about your capabilities, respond naturally and invite the user to ask about markets or trading.

For questions clearly unrelated to finance or trading (recipes, weather, politics, entertainment, coding unrelated to trading, etc.) respond only with:
"I'm focused on trading and markets. Ask me about stocks, setups, or market analysis."

Rules:
- Keep responses concise and specific.
- Never guarantee returns or give exact buy/sell signals.
- Always note this is a paper trading platform — not real financial advice.

${SYSTEM_FRAMEWORK}`;


const MAX_MESSAGES   = 20;
const MAX_MSG_LENGTH = 2000;

type Msg = { role: "user" | "assistant"; content: string };
type RawMsg = { role: unknown; content: unknown };

function sanitizeMessages(raw: unknown): Msg[] {
  if (!Array.isArray(raw)) return [];
  const filtered = (raw as RawMsg[])
    .filter(m => m.role === "user" || m.role === "assistant")
    .slice(-MAX_MESSAGES)
    .map(m => ({
      role:    m.role as "user" | "assistant",
      content: String(m.content ?? "").slice(0, MAX_MSG_LENGTH),
    }));
  const cleaned: Msg[] = [];
  for (const m of filtered) {
    if (cleaned.length === 0 && m.role !== "user") continue;
    if (cleaned.length > 0 && m.role === cleaned[cleaned.length - 1].role) continue;
    cleaned.push(m);
  }
  return cleaned;
}

async function callOpenAICompat(url: string, key: string, model: string, messages: Msg[]): Promise<string> {
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`${url} ${res.status}: ${txt}`);
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

// Priority: Anthropic → Groq (free) → DeepSeek
async function getAIReply(messages: Msg[]): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const groqKey      = process.env.GROQ_API_KEY;
  const deepseekKey  = process.env.DEEPSEEK_API_KEY;

  // ── Anthropic ──────────────────────────────────────────────────────────────
  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const res = await client.messages.create({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system:     SYSTEM_PROMPT,
        messages,
      });
      return res.content
        .filter(b => b.type === "text")
        .map(b => (b as { type: "text"; text: string }).text)
        .join("");
    } catch (err) {
      console.error("Anthropic chat error:", err instanceof Error ? err.message : err);
      // fall through to next provider
    }
  }

  // ── Groq (free tier) ───────────────────────────────────────────────────────
  if (groqKey) {
    return callOpenAICompat(
      "https://api.groq.com/openai/v1/chat/completions",
      groqKey,
      "llama-3.3-70b-versatile",
      messages,
    );
  }

  // ── DeepSeek fallback ──────────────────────────────────────────────────────
  if (deepseekKey) {
    return callOpenAICompat(
      "https://api.deepseek.com/v1/chat/completions",
      deepseekKey,
      "deepseek-chat",
      messages,
    );
  }

  throw new Error("No AI provider configured. Add GROQ_API_KEY, ANTHROPIC_API_KEY, or DEEPSEEK_API_KEY.");
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    let rateLimitKey: string;
    let rateLimitMax: number;

    if (session?.user?.email) {
      rateLimitKey = `chat:${session.user.email}`;
      rateLimitMax = 20;
    } else {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        req.headers.get("x-real-ip") ??
        "anonymous";
      rateLimitKey = `chat-guest:${ip}`;
      rateLimitMax = 5;
    }

    if (!checkRateLimit(rateLimitKey, rateLimitMax, 60_000)) {
      return Response.json({ ok: false, error: "Rate limited. Please wait a moment." }, { status: 429 });
    }

    const body = await req.json().catch(() => ({})) as { messages?: unknown };
    const messages = sanitizeMessages(body.messages);
    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }

    const text = await getAIReply(messages);
    return Response.json({ ok: true, text });
  } catch (err) {
    console.error("Chat API error:", err instanceof Error ? err.message : err);
    return Response.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
