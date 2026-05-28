import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are Traxora AI, a knowledgeable financial assistant embedded in a paper trading platform. You help users understand stocks, markets, and trading strategies.

You can:
- Analyze stocks and explain price movements
- Explain financial concepts (P/E ratio, market cap, volatility, etc.)
- Suggest trading strategies and risk management tips
- Interpret market news and its potential impact on stocks
- Help users understand their portfolio performance

Keep responses concise and focused. Always remind users this is a paper trading platform — not real financial advice. Never guarantee returns or tell users exactly when to buy/sell.`;

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

// Try Anthropic first, fall back to DeepSeek
async function getAIReply(messages: Msg[]): Promise<string> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
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
      const status = (err as { status?: number }).status;
      // Only fall through on auth errors; re-throw everything else
      if (status !== 401 && status !== 403) throw err;
    }
  }

  // ── DeepSeek fallback ──────────────────────────────────────────────────────
  if (deepseekKey) {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${deepseekKey}`,
      },
      body: JSON.stringify({
        model:      "deepseek-chat",
        max_tokens: 1024,
        messages:   [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => res.statusText);
      throw new Error(`DeepSeek ${res.status}: ${txt}`);
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? "";
  }

  throw new Error("No AI provider configured. Add ANTHROPIC_API_KEY or DEEPSEEK_API_KEY.");
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
