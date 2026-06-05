export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

import Anthropic from "@anthropic-ai/sdk";
import { cacheGet, cacheSet } from "@/app/lib/sentiment";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/rateLimit";
import { postToDiscord, buildIPOEmbed } from "@/app/lib/discord";

export interface IPOAnalysis {
  sector:        string;
  companyBrief:  string;
  verdict:       "Strong Buy" | "Buy" | "Watch" | "Avoid";
  verdictReason: string;
  priceTargets: {
    bear: number;
    base: number;
    bull: number;
  };
  fiveYear: string;
  thesis:   string;
  catalysts: string[];
  risks:     string[];
  similarTo: string;
}

function buildPrompt(body: {
  name: string; symbol?: string; exchange?: string | null;
  price?: string | null; totalValue?: number | null;
  shares?: number | null; status?: string; isSpac?: boolean;
}): string {
  const size = body.totalValue ? `$${(body.totalValue / 1e6).toFixed(0)}M raise` : "size unknown";
  const ex   = body.exchange ?? "exchange TBD";
  const pr   = body.price    ? `$${body.price} IPO price` : "price TBD";
  const sh   = body.shares   ? `${(body.shares / 1e6).toFixed(1)}M shares` : "";

  return `You are a senior IPO analyst at a top-tier investment bank. Analyze this IPO and provide a detailed outlook.

Company: ${body.name}
Ticker: ${body.symbol || "TBD"}
Exchange: ${ex}
Offering: ${pr}, ${size}${sh ? `, ${sh}` : ""}
Status: ${body.status ?? "filed"}
${body.isSpac ? "⚠ This appears to be a SPAC (Special Purpose Acquisition Company)." : ""}

Respond ONLY with valid JSON — no markdown, no explanation, no code fences:
{
  "sector": "one word or short phrase (e.g. Fintech, Biotech, SaaS, Energy, Consumer)",
  "companyBrief": "1 sentence on what this company likely does based on its name and size",
  "verdict": "Strong Buy" or "Buy" or "Watch" or "Avoid",
  "verdictReason": "1-2 sentences explaining the verdict concisely",
  "priceTargets": {
    "bear": <number — bear-case price 12 months post-IPO>,
    "base": <number — base-case price 12 months post-IPO>,
    "bull": <number — bull-case price 12 months post-IPO>
  },
  "fiveYear": "2-3 sentences on the realistic 5-year trajectory — where could this company be?",
  "thesis": "2-3 sentences core investment thesis for a long-term holder",
  "catalysts": ["catalyst 1", "catalyst 2", "catalyst 3"],
  "risks": ["risk 1", "risk 2", "risk 3"],
  "similarTo": "name one comparable public company"
}

For priceTargets: base on the IPO price. Bear = 20-40% below IPO, Base = 10-30% above, Bull = 50-150% above for quality names. Adjust for sector, size, and SPAC status. SPACs should have lower targets.`;
}

async function callOpenAI(url: string, key: string, model: string, prompt: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const d = await res.json() as { choices?: { message?: { content?: string } }[] };
    return d.choices?.[0]?.message?.content ?? null;
  } catch { return null; }
}

function parseAnalysis(text: string): IPOAnalysis | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const raw = JSON.parse(match[0]) as Partial<IPOAnalysis & { priceTargets: { bear?: unknown; base?: unknown; bull?: unknown } }>;
    if (!raw.verdict || !raw.sector) return null;
    const ipoPrice = 10; // fallback for parsing
    return {
      sector:        String(raw.sector ?? "Unknown"),
      companyBrief:  String(raw.companyBrief ?? ""),
      verdict:       (["Strong Buy","Buy","Watch","Avoid"].includes(raw.verdict as string) ? raw.verdict : "Watch") as IPOAnalysis["verdict"],
      verdictReason: String(raw.verdictReason ?? ""),
      priceTargets: {
        bear: Number(raw.priceTargets?.bear) || ipoPrice * 0.7,
        base: Number(raw.priceTargets?.base) || ipoPrice * 1.2,
        bull: Number(raw.priceTargets?.bull) || ipoPrice * 1.8,
      },
      fiveYear:  String(raw.fiveYear  ?? ""),
      thesis:    String(raw.thesis    ?? ""),
      catalysts: Array.isArray(raw.catalysts) ? raw.catalysts.slice(0, 4).map(String) : [],
      risks:     Array.isArray(raw.risks)     ? raw.risks.slice(0, 4).map(String)     : [],
      similarTo: String(raw.similarTo ?? ""),
    };
  } catch { return null; }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit(`ipo-analyze:${session.user.email}`, 10, 60_000)) {
    return Response.json({ error: "Rate limited. Try again shortly." }, { status: 429 });
  }

  try {
    const body = await req.json() as {
      name: string; symbol?: string; exchange?: string | null;
      price?: string | null; totalValue?: number | null;
      shares?: number | null; status?: string; isSpac?: boolean;
    };
    if (!body.name) return Response.json({ error: "name required" }, { status: 400 });

    const cacheKey = `ipo-analysis:${body.name.toLowerCase().replace(/\s+/g, "-")}`;
    const cached = cacheGet<IPOAnalysis>(cacheKey);
    if (cached) return Response.json({ ...cached, _cached: true });

    const prompt = buildPrompt(body);
    let text: string | null = null;

    // Anthropic
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      try {
        const client = new Anthropic({ apiKey: anthropicKey });
        const res = await Promise.race([
          client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 800,
            messages: [{ role: "user", content: prompt }],
          }),
          new Promise<never>((_, r) => setTimeout(() => r(new Error("timeout")), 20_000)),
        ]);
        text = res.content.find(b => b.type === "text")?.text ?? null;
      } catch { /* fall through */ }
    }

    // Groq
    if (!text) {
      const groqKey = process.env.GROQ_API_KEY;
      if (groqKey) text = await callOpenAI("https://api.groq.com/openai/v1/chat/completions", groqKey, "llama-3.3-70b-versatile", prompt);
    }

    // DeepSeek
    if (!text) {
      const dsKey = process.env.DEEPSEEK_API_KEY;
      if (dsKey) text = await callOpenAI("https://api.deepseek.com/v1/chat/completions", dsKey, "deepseek-chat", prompt);
    }

    if (!text) return Response.json({ error: "AI unavailable" }, { status: 503 });

    const analysis = parseAnalysis(text);
    if (!analysis) return Response.json({ error: "Failed to parse analysis" }, { status: 500 });

    // Cache 4 hours — IPO fundamentals don't change fast
    cacheSet(cacheKey, analysis, 4 * 60 * 60 * 1_000);

    // Auto-post to Discord if webhook is configured (skip for cached results)
    const discordUrl = process.env.DISCORD_WEBHOOK_URL;
    if (discordUrl && (analysis.verdict === "Strong Buy" || analysis.verdict === "Buy")) {
      const embeds = buildIPOEmbed(body.name, body.symbol, body.price ?? null, analysis);
      postToDiscord(discordUrl, embeds).catch(() => {}); // fire-and-forget
    }

    return Response.json(analysis);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
