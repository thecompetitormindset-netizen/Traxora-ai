export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Analyze user-supplied data with the same deterministic engine and
// validator. Server-owned: analysis time, session, rules, freshness and the
// paper restriction. Results are returned to the requester only — never
// persisted or shown to anyone else.

import { auth } from "@/auth";
import { checkRateLimit } from "@/app/lib/rateLimit";
import { buildUserInput, futureTimeIssues, parseUserData } from "@/app/lib/optionsAnalysis/userData";
import { analyzeInput } from "@/app/lib/optionsAnalysis/service";
import { toResearch } from "@/app/lib/optionsAnalysis/display";

const MAX_BODY_BYTES = 512 * 1024;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRateLimit(`options-user-data:${session.user.email ?? "anon"}`, 20, 60_000)) {
    return Response.json({ error: "rate_limited", retryAfterSeconds: 60 }, { status: 429 });
  }

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    return Response.json({ error: "too_large", issues: [{ path: "(root)", message: "Data is larger than 512 KB" }] }, { status: 413 });
  }
  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch { return Response.json({ error: "invalid_json", issues: [{ path: "(root)", message: "This is not valid JSON" }] }, { status: 422 }); }

  const parsed = parseUserData(raw);
  if (!parsed.ok) return Response.json({ error: "invalid_fields", issues: parsed.issues }, { status: 422 });

  const asOf = new Date().toISOString();
  const future = futureTimeIssues(parsed.data, asOf);
  if (future.length) return Response.json({ error: "invalid_fields", issues: future }, { status: 422 });

  try {
    const input = buildUserInput(parsed.data, asOf);
    const row = analyzeInput(input, parsed.data.symbol);
    return Response.json({ detail: toResearch(row, new Date(), { userSupplied: true }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[options-user-data] failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
