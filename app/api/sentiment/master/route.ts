export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 60;

import { callClaude, cacheGet, cacheSet, PROMPTS } from "../../../lib/sentiment";
import { auth } from "../../../../auth";

// Derive a 6-char hash for per-user caching
function userHash(email: string): string {
  let h = 0;
  for (const c of email) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return Math.abs(h).toString(36).slice(0, 6);
}

export interface MasterInput {
  marketData: {
    vix?: number;
    fearGreed?: number;
    overallScore?: number;
    spyChange?: number;
    qqqChange?: number;
    regime?: string;
    topHeadlines?: Array<{ title: string; sentiment: string; score: number }>;
  };
  syntheses?: Array<{ ticker: string; score: number; summary: string; drivers: string[] }>;
  positions?: Array<{ symbol: string; quantity: number; avgPrice?: number }>;
  watchlist?: string[];
}

export interface MasterOutput {
  narrative:              string;
  contrarian:             string;
  smartMoneySignal:       string;
  retailVsInstitutional:  string;
  divergences:            string[];
  themes:                 string[];
  catalysts:              string[];
  positionGuidance:       string;
  overallBias:            string;
  confidence:             number;
  model:                  string;
  generatedAt:            number;
  stale?:                 boolean;
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as MasterInput;

    // Per-user cache key (Opus reports are expensive, cache 4h)
    let cacheKey = "master:anon";
    try {
      const session = await auth();
      if (session?.user?.email) {
        cacheKey = `master:${userHash(session.user.email)}`;
      }
    } catch { /* no session, anon key */ }

    const cached = cacheGet<MasterOutput>(cacheKey);
    if (cached) return Response.json({ ...cached, stale: false });

    // Build context payload
    const md = body.marketData ?? {};
    const headlines = (md.topHeadlines ?? []).slice(0, 8)
      .map(h => `- ${h.title} [${h.sentiment}]`).join("\n");
    const syntheses = (body.syntheses ?? []).slice(0, 10)
      .map(s => `${s.ticker}: score=${s.score}, drivers: ${s.drivers.join("; ")}`).join("\n");
    const positions = (body.positions ?? []).slice(0, 20)
      .map(p => `${p.symbol} (${p.quantity} shares${p.avgPrice ? ` @ $${p.avgPrice}` : ""})`).join(", ");
    const watchlist = (body.watchlist ?? []).slice(0, 10).join(", ");

    const userContent = `
MARKET DATA:
- VIX: ${md.vix ?? "N/A"}
- Fear & Greed Index: ${md.fearGreed ?? "N/A"}/100
- Overall Sentiment Score: ${md.overallScore ?? "N/A"}/100
- SPY change: ${md.spyChange != null ? `${md.spyChange > 0 ? "+" : ""}${md.spyChange.toFixed(2)}%` : "N/A"}
- QQQ change: ${md.qqqChange != null ? `${md.qqqChange > 0 ? "+" : ""}${md.qqqChange.toFixed(2)}%` : "N/A"}
- Current regime: ${md.regime ?? "Unknown"}

LATEST HEADLINES:
${headlines || "No headlines available"}

TICKER SENTIMENT SYNTHESES:
${syntheses || "None available"}

USER POSITIONS: ${positions || "None"}
USER WATCHLIST: ${watchlist || "None"}

Generate a comprehensive institutional sentiment report.`;

    const result = await callClaude("master", PROMPTS.master, userContent, 1_500);

    if (!result.ok) {
      return Response.json({ ok: false, reason: result.reason }, { status: 503 });
    }

    type RawMaster = {
      narrative?: string; contrarian?: string; smartMoneySignal?: string;
      retailVsInstitutional?: string; divergences?: string[]; themes?: string[];
      catalysts?: string[]; positionGuidance?: string; overallBias?: string;
      confidence?: number;
    };
    let parsed: RawMaster = {};
    try { parsed = JSON.parse(result.text) as RawMaster; } catch { /* ignore */ }

    const out: MasterOutput = {
      narrative:             parsed.narrative             ?? "Market analysis in progress.",
      contrarian:            parsed.contrarian            ?? "Contrarian signal analysis unavailable.",
      smartMoneySignal:      parsed.smartMoneySignal      ?? "Consolidation",
      retailVsInstitutional: parsed.retailVsInstitutional ?? "Insufficient data.",
      divergences:           Array.isArray(parsed.divergences) ? parsed.divergences.slice(0, 5) : [],
      themes:                Array.isArray(parsed.themes)      ? parsed.themes.slice(0, 5)      : [],
      catalysts:             Array.isArray(parsed.catalysts)   ? parsed.catalysts.slice(0, 4)   : [],
      positionGuidance:      parsed.positionGuidance      ?? "No specific guidance for current positions.",
      overallBias:           parsed.overallBias           ?? "Neutral",
      confidence:            typeof parsed.confidence === "number" ? parsed.confidence : 60,
      model:                 "claude-opus-4-7",
      generatedAt:           Date.now(),
    };

    cacheSet(cacheKey, out, 4 * 60 * 60 * 1_000); // cache 4h
    return Response.json(out);
  } catch {
    return Response.json({ error: "Master report generation failed" }, { status: 500 });
  }
}
