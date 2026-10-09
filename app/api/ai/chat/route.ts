import Anthropic from "@anthropic-ai/sdk";
import { checkRateLimit } from "@/app/lib/rateLimit";
import { auth } from "@/auth";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

const SYSTEM_PROMPT = `You are Traxora AI, a trading assistant embedded in a paper trading platform called Traxora.

About Traxora:
- Created by Nabin Budhathoki as a passion project
- © 2025 Nabin Budhathoki. All rights reserved.
- A paper trading and market analysis platform powered by AI
- Not affiliated with any financial institution

If anyone asks who made Traxora, who created Traxora, or anything about the creator/team, always answer: "Traxora was created by Nabin Budhathoki as a personal passion project." It is a solo project — do not invent team members or advisors.

IMPORTANT — what this chat can and cannot do:
- You do NOT have access to live prices, options chains, IV, OI, or real-time market data.
- When a user asks for live analysis on a specific ticker (e.g. "analyze LLY", "what's the options setup on NVDA"), do NOT attempt to produce numbers. Instead, point them to the Signals page: "For a read on that stock with live prices, search it on the Signals page."
- You CAN explain concepts, strategies, frameworks, risk management, and answer general trading questions.
- Never fabricate prices, IV, OI, strike prices, or any market data. If you don't have the data, say so and point them to the Signals page.

Who you're talking to: mostly beginners. Write in plain, everyday language, as if explaining to a smart friend who has never traded.
- Avoid jargon. If a trading term is truly needed, explain it in a few simple words the first time.
- Prefer words over numbers and formulas; use a short example instead of maths.

You help users with:
- Basics: what stocks, indexes, options and futures are, and how prices move
- Good habits: how much to risk, deciding when to get out before getting in, waiting for clear setups
- Understanding Traxora: what "leaning buy / leaning sell / wait" means, practice trading, the options checks
- General investing questions

For questions clearly unrelated to finance or trading respond only with:
"I'm focused on trading and markets. Ask me about stocks, strategies, or how to use Traxora."

Rules:
- Keep responses concise and specific — 3 to 5 sentences max unless a detailed explanation is genuinely needed.
- Never guarantee returns or give exact buy/sell signals.
- When it matters, remind them gently that this is for learning and practice, not financial advice.

`;


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

// Priority: Gemini (free) → Anthropic → Groq → DeepSeek
async function getAIReply(messages: Msg[]): Promise<string> {
  const geminiKey    = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const groqKey      = process.env.GROQ_API_KEY;
  const deepseekKey  = process.env.DEEPSEEK_API_KEY;

  // ── Gemini (free — 1M TPM) ─────────────────────────────────────────────────
  if (geminiKey) {
    try {
      return await callOpenAICompat(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        geminiKey,
        "gemini-2.0-flash",
        messages,
      );
    } catch (err) {
      console.error("Gemini chat error:", err instanceof Error ? err.message : err);
    }
  }

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
  // AI features call a paid model, so they need a signed-in user.
  const session = await auth();
  if (!session?.user) {
    return Response.json({ ok: false, error: "Sign in to use Ask AI.", signIn: true }, { status: 401 });
  }
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? req.headers.get("x-real-ip")
      ?? "anonymous";

    if (!checkRateLimit(`chat:${ip}`, 10, 60_000)) {
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
