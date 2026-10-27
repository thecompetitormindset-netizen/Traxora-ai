export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

import { auth } from "@/auth";
import { supabaseAdmin, supabaseConfigured } from "@/app/lib/supabase";
import { safeFilename } from "@/app/lib/exportName";

// The track record as a file you can keep somewhere that is not one free-tier
// database.
//
// daily_bars is a cache of public market data and can be rebuilt by re-running
// the sync. daily_picks cannot. It records what was predicted at a point in
// time, and a prediction cannot be reconstructed after the fact — that is
// precisely what makes it evidence rather than a story. The free Supabase tier
// has no automatic backups, so the only copy of the only irreplaceable table
// in this system lives in one place until someone exports it.
//
// The filename is set here rather than left to the browser, because a download
// named `route` or `export` is useless on a phone, and iOS offers no rename
// during the save.

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "thecompetitormindset@gmail.com";

async function isOwner(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  const query = new URL(req.url).searchParams.get("secret");
  const presented = header?.startsWith("Bearer ") ? header.slice(7) : query;
  if (secret && presented) return presented === secret;
  if (presented) return false;
  try {
    const session = await auth();
    return session?.user?.email === OWNER_EMAIL;
  } catch {
    return false;
  }
}

type Row = {
  run_date: string; symbol: string; rank: number; direction: string;
  conviction: number; entry_price: number; horizon_days: number;
  why: unknown; outcome_date: string | null; outcome_price: number | null;
  return_pct: number | null; correct: boolean | null; resolved_at: string | null;
};

/** One CSV field, quoted so a comma or quote inside it cannot break the column. */
function csvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join(" | ") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLUMNS = [
  "run_date", "symbol", "rank", "direction", "conviction", "entry_price",
  "horizon_days", "outcome_date", "outcome_price", "return_pct", "correct",
  "resolved_at", "why",
] as const;

function toCsv(rows: Row[]): string {
  const lines = [COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(COLUMNS.map(c => csvField((r as unknown as Record<string, unknown>)[c])).join(","));
  }
  // A trailing newline, so appending to the file later does not join two rows.
  return lines.join("\n") + "\n";
}

export async function GET(req: Request) {
  if (!(await isOwner(req))) {
    return Response.json(
      { error: "Unauthorized", hint: "Sign in as the owner in this browser, then reload." },
      { status: 401 },
    );
  }
  if (!supabaseConfigured()) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const today = new Date().toISOString().slice(0, 10);
  const name = safeFilename(url.searchParams.get("name"), `traxora-picks-${today}`);

  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from("daily_picks")
      .select("run_date, symbol, rank, direction, conviction, entry_price, horizon_days, why, outcome_date, outcome_price, return_pct, correct, resolved_at")
      .order("run_date", { ascending: false })
      .order("rank", { ascending: true })
      .limit(10_000);

    if (error) {
      return Response.json({
        error: "Could not read daily_picks",
        reason: /relation .* does not exist|schema cache/i.test(error.message) ? "table_missing" : "query_failed",
        detail: error.message.slice(0, 160),
      }, { status: 503 });
    }

    const rows = (data ?? []) as Row[];
    const body = format === "json" ? JSON.stringify({ exportedAt: new Date().toISOString(), count: rows.length, picks: rows }, null, 2) : toCsv(rows);

    return new Response(body, {
      headers: {
        "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
        // attachment, not inline: a phone browser otherwise renders CSV as a
        // wall of text with no way to save it under a chosen name.
        "Content-Disposition": `attachment; filename="${name}.${format}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("picks export error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Export failed" }, { status: 503 });
  }
}
