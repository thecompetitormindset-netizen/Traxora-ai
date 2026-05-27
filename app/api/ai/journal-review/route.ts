import Anthropic from "@anthropic-ai/sdk";
import type { JournalEntry } from "../../../components/AutoJournal";

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
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

  const prompt = `You are an elite ICT trading coach. Review this trader's closed trade history and give honest, specific feedback.

${sells.length} closed trade${sells.length !== 1 ? "s" : ""}:
${tradeSummaries}

Stats: Win rate ${winRate}% (${winCount}/${sells.length}), Total P&L $${totalPL.toFixed(2)}, Grades A:${gradeCount.A} B:${gradeCount.B} C:${gradeCount.C} D:${gradeCount.D} F:${gradeCount.F}

Respond in raw JSON only (no markdown):
{
  "overallGrade": "A|B|C|D|F",
  "coachSummary": "3-4 direct sentences on this trader's skill level, patterns, and trajectory",
  "recurringMistakes": ["mistake 1 with ICT terminology", "mistake 2", "mistake 3"],
  "strengths": ["strength 1", "strength 2"],
  "priorityFixes": [
    { "issue": "most important issue", "howToFix": "concrete 1-2 sentence ICT action plan" },
    { "issue": "second issue", "howToFix": "concrete 1-2 sentence ICT action plan" }
  ],
  "nextFocusArea": "one sentence on what to study this week"
}`;

  try {
    const response = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages:   [{ role: "user", content: prompt }],
    });

    const raw = response.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

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
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Journal review] Anthropic error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
