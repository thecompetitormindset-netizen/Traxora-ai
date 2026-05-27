import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Cache result for 5 minutes to avoid burning API credits on every ping
let cachedOk  = false;
let cacheTime = 0;
const TTL_MS  = 5 * 60 * 1000;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  if (cachedOk && now - cacheTime < TTL_MS) {
    return Response.json({ ok: true, cached: true });
  }

  try {
    await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages:   [{ role: "user", content: "ping" }],
    });
    cachedOk  = true;
    cacheTime = now;
    return Response.json({ ok: true });
  } catch (err) {
    cachedOk = false;
    const status = (err as { status?: unknown }).status;
    if (status === 401 || status === 403) {
      return Response.json({ ok: false, reason: "AI_UNAVAILABLE" }, { status: 503 });
    }
    return Response.json({ ok: false, reason: "AI_UNAVAILABLE" }, { status: 503 });
  }
}
