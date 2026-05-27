import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/rateLimit";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

type RawMsg = { role: unknown; content: unknown };

function sanitizeMessages(raw: unknown): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(raw)) return [];
  const filtered = (raw as RawMsg[])
    .filter(m => m.role === "user" || m.role === "assistant")
    .slice(-MAX_MESSAGES)
    .map(m => ({
      role:    m.role as "user" | "assistant",
      content: String(m.content ?? "").slice(0, MAX_MSG_LENGTH),
    }));
  // Enforce alternating roles starting with user
  const cleaned: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of filtered) {
    if (cleaned.length === 0 && m.role !== "user") continue;
    if (cleaned.length > 0 && m.role === cleaned[cleaned.length - 1].role) continue;
    cleaned.push(m);
  }
  return cleaned;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ ok: false, reason: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!checkRateLimit(`chat:${session.user.email}`, 20, 60_000)) {
    return Response.json({ ok: false, reason: "RATE_LIMITED" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({})) as { messages?: unknown };
  const messages = sanitizeMessages(body.messages);
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return Response.json({ ok: false, reason: "INVALID_MESSAGES" }, { status: 400 });
  }

  let stream;
  try {
    stream = await client.messages.stream({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });
  } catch (err) {
    const status = (err as { status?: unknown }).status;
    if (status === 401 || status === 403) {
      return Response.json({ ok: false, reason: "AI_UNAVAILABLE" }, { status: 503 });
    }
    return Response.json({ ok: false, reason: "AI_UNAVAILABLE" }, { status: 503 });
  }

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
