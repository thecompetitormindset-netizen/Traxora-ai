export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { viewer } from "@/app/lib/viewer";
import { supabaseAdmin } from "@/app/lib/supabase";
import { etTradingDate } from "@/app/lib/marketTime";
import { STATE_SYMBOL } from "@/app/lib/optionsAnalysis/scan";

// Past sessions, for the "since you last looked" card.
//
// Every run is already persisted in options_analyses keyed by (run_date,
// symbol); until now only the current run_date was ever read back, so a user
// returning after a weekend had no way to see what had appeared and expired
// while they were away. This reads the days either side of that gap.
//
// Counts only. The rows carry their full option chain, so selecting the
// payload for a fortnight of sessions would be enormous and is not needed to
// answer "did I miss anything".

const MAX_DAYS = 14;

export type RecentSession = {
  run_date: string;
  /** Candidates that passed every check on that day. */
  ideas: number;
  /** Symbols checked that day, approved or not. */
  checked: number;
};

export type RecentSessionsResponse = {
  sessions: RecentSession[];   // most recent first, today excluded
  available: boolean;          // false when the store is unreachable
};

export async function GET(req: Request) {
  const session = await viewer();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requested = Number(searchParams.get("days"));
  const days = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), MAX_DAYS) : 5;

  const today = etTradingDate();
  const since = new Date(Date.now() - (MAX_DAYS + 7) * 86_400_000).toISOString().slice(0, 10);

  const empty: RecentSessionsResponse = { sessions: [], available: false };

  let db: ReturnType<typeof supabaseAdmin>;
  try { db = supabaseAdmin(); } catch { return Response.json(empty); }

  // review_status only — the chain payload stays on the server.
  const { data, error } = await db
    .from("options_analyses")
    .select("run_date, review_status")
    .neq("symbol", STATE_SYMBOL)
    .neq("run_date", today)
    .gte("run_date", since);

  if (error) {
    console.error("[options-recent] read failed:", error.message);
    return Response.json(empty);
  }

  const byDate = new Map<string, { ideas: number; checked: number }>();
  for (const row of (data ?? []) as { run_date: string; review_status: string }[]) {
    const entry = byDate.get(row.run_date) ?? { ideas: 0, checked: 0 };
    entry.checked += 1;
    if (row.review_status === "APPROVED_CANDIDATE") entry.ideas += 1;
    byDate.set(row.run_date, entry);
  }

  const sessions = [...byDate.entries()]
    .map(([run_date, v]) => ({ run_date, ...v }))
    .sort((a, b) => b.run_date.localeCompare(a.run_date))
    .slice(0, days);

  return Response.json(
    { sessions, available: true } satisfies RecentSessionsResponse,
    { headers: { "Cache-Control": "no-store" } },
  );
}
