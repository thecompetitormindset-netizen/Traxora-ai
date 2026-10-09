import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/rateLimit";
import type { JournalEntry } from "../../../components/AutoJournal";

export const maxDuration = 60;

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
      return await callOpenAICompat("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", geminiKey, "gemini-2.0-flash", SYSTEM_FRAMEWORK, prompt, 1500);
    } catch (err) { console.error("Gemini journal-review error:", err instanceof Error ? err.message : err); }
  }

  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const res = await client.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 1500,
        system: SYSTEM_FRAMEWORK,
        messages: [{ role: "user", content: prompt }],
      });
      return res.content.filter(b => b.type === "text").map(b => (b as { type: "text"; text: string }).text).join("").trim();
    } catch (err) { console.error("Anthropic journal-review error:", err instanceof Error ? err.message : err); }
  }

  if (groqKey) {
    try {
      return await callOpenAICompat("https://api.groq.com/openai/v1/chat/completions", groqKey, "llama-3.3-70b-versatile", SYSTEM_FRAMEWORK, prompt, 1500);
    } catch (err) { console.error("Groq journal-review error:", err instanceof Error ? err.message : err); }
  }

  if (deepseekKey) {
    try {
      return await callOpenAICompat("https://api.deepseek.com/v1/chat/completions", deepseekKey, "deepseek-chat", SYSTEM_FRAMEWORK, prompt, 1500);
    } catch (err) { console.error("DeepSeek journal-review error:", err instanceof Error ? err.message : err); }
  }

  throw new Error("No AI provider available");
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Sign in to use AI features.", signIn: true }, { status: 401 });
  }
  if (!checkRateLimit(`journal-review:${session.user.email}`, 5, 60_000)) {
    return Response.json({ error: "Rate limit — max 5 reviews per minute" }, { status: 429 });
  }
  let sells: JournalEntry[] = [];

  try {
    const body = await req.json() as { entries?: JournalEntry[]; sells?: JournalEntry[] };
    // Accept either full entries array or pre-filtered sells
    const entries = body.sells ?? body.entries ?? [];
    sells = entries.filter((e: JournalEntry) => e.side === "SELL");
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (sells.length === 0) {
    return Response.json({ error: "No closed trades to analyze" }, { status: 400 });
  }

  // Build compact trade summaries
  const tradeSummaries = sells.map((e, i) => {
    const clean = String(e.symbol).replace(".US", "").replace(".COMM", "");
    const parts: string[] = [
      `#${i + 1} ${clean}`,
      e.analysis?.grade ? `Grade: ${e.analysis.grade}` : "",
      e.pl    != null ? `P&L: ${e.pl >= 0 ? "+" : ""}$${Number(e.pl).toFixed(2)}` : "",
      e.plPct != null ? `(${e.plPct >= 0 ? "+" : ""}${Number(e.plPct).toFixed(1)}%)` : "",
      e.closeReason ? `Exit: ${e.closeReason}` : "",
      e.analysis?.mistakes?.length ? `Mistakes: ${e.analysis.mistakes.join("; ")}` : "",
      e.analysis?.wins?.length     ? `Wins: ${e.analysis.wins.join("; ")}` : "",
      e.analysis?.lesson            ? `Lesson: ${e.analysis.lesson}` : "",
      !e.analysis && e.entry        ? `Notes: ${e.entry.slice(0, 120)}` : "",
    ].filter(Boolean);
    return parts.join(" | ");
  }).join("\n");

  const gradeCount = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  sells.forEach(e => {
    const g = (e.analysis?.grade ?? "C") as keyof typeof gradeCount;
    if (g in gradeCount) gradeCount[g]++;
  });

  const totalPL  = sells.reduce((s, e) => s + (e.pl ?? 0), 0);
  const winCount = sells.filter(e => (e.pl ?? 0) > 0).length;
  const winRate  = sells.length > 0 ? Math.round((winCount / sells.length) * 100) : 0;

  const prompt = `You are an elite trading coach. Evaluate this trader's closed trades against the exact system they are supposed to be following.

SYSTEM RULES:
- Universe: 30-stock watchlist. Max 1% risk/trade. Max 3 concurrent positions. Max 3 trades/day. Daily loss limit 2.5%. Hard close by 3:45 PM ET.

THREE VALID MODELS:
Model A — Judas Swing: Sweep Asian/London liquidity → MSS/CHoCH displacement → OB/FVG retest entry. Valid only in London (2–5 AM ET) and NY AM (8:30–11 AM ET) Kill Zones.
Model B — Silver Bullet: Three windows — 10:00–11:00 AM, 2:00–3:00 PM, 11:00 PM–12:00 AM ET. Liquidity sweep within window → FVG on displacement → retest entry. No trading outside windows.
Model C — Power of 3 / AMD: Asian accumulation → manipulation sweep of stops at open → distribution leg entry after sweep confirmed.

ENTRY CHECKLIST (7 items — all required for A grade):
1. Short-term high or low swept (liquidity taken before entry)
2. MSS or CHoCH printed confirming displacement
3. Entry inside a premium/discount array (OB, FVG, BISI/SIBI) — premium for shorts, discount for longs
4. Active Kill Zone at time of entry
5. R:R ≥ 2.5:1 confirmed before entry
6. Position size ≤ 1% account risk
7. Not entering at NDOG/NWOG without clear rejection or displacement break

TRADE MANAGEMENT RULES: Stop loss behind the OB/FVG that triggered entry. Take 50% off at 1R, move stop to break-even. Target 2R minimum. Trail remaining via structure.
FORBIDDEN BEHAVIORS: revenge trading, outside Kill Zone entries, chasing price without OB/FVG retest, moving stop to B/E before 1R, >3 trades/day, holding past 3:45 PM ET.

GRADING RUBRIC: A = 7/7 checklist + correct model + R:R ≥ 2.5:1 | B = 5–6/7 minor deviation | C = 3–4/7 significant deviation | D = 1–2/7 poor execution | F = checklist ignored or forbidden behavior committed.

---

${sells.length} closed trade${sells.length !== 1 ? "s" : ""}:
${tradeSummaries}

Stats: Win rate ${winRate}% (${winCount}/${sells.length}), Total P&L $${totalPL.toFixed(2)}, Grades A:${gradeCount.A} B:${gradeCount.B} C:${gradeCount.C} D:${gradeCount.D} F:${gradeCount.F}

Evaluate each trade against the 7-item checklist and 3 models above. Identify which specific checklist items and rules were violated. Be direct and reference market structure terminology precisely.

Respond in raw JSON only (no markdown):
{
  "overallGrade": "A|B|C|D|F",
  "coachSummary": "3-4 direct sentences — which models they execute correctly, which checklist items they consistently skip, overall discipline level and trajectory",
  "recurringMistakes": ["checklist item # violated and how", "forbidden behavior if present", "model deviation if any"],
  "strengths": ["specific strength tied to a checklist item or model they execute well"],
  "priorityFixes": [
    { "issue": "most violated checklist item or rule", "howToFix": "1-2 sentence action plan referencing the exact model step to fix it" },
    { "issue": "second most critical issue", "howToFix": "1-2 sentence action plan with specific trade mechanics" }
  ],
  "nextFocusArea": "one sentence — which model (A, B, or C) or which checklist item to drill this week and why"
}`;

  try {
    const raw = await callAI(prompt);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Journal review] No JSON in response:", raw.slice(0, 300));
      return Response.json({ error: "Model returned non-JSON response" }, { status: 500 });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("[Journal review] JSON parse failed:", jsonMatch[0].slice(0, 300), parseErr);
      return Response.json({ error: "Could not parse model response" }, { status: 500 });
    }

    return Response.json({
      overallGrade:      String(parsed.overallGrade ?? "C"),
      coachSummary:      String(parsed.coachSummary ?? ""),
      recurringMistakes: Array.isArray(parsed.recurringMistakes) ? parsed.recurringMistakes : [],
      strengths:         Array.isArray(parsed.strengths)         ? parsed.strengths         : [],
      priorityFixes:     Array.isArray(parsed.priorityFixes)     ? parsed.priorityFixes     : [],
      nextFocusArea:     String(parsed.nextFocusArea ?? ""),
      stats: { winRate, totalPL, gradeCount, tradeCount: sells.length },
    });

  } catch (err) {
    const status = (err as { status?: unknown }).status;
    if (status === 401 || status === 403) {
      return Response.json({ ok: false, reason: "AI_UNAVAILABLE" }, { status: 503 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Journal review] Anthropic error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
