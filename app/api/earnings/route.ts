import { viewer } from "@/app/lib/viewer";
import { earningsLabel, resolveEarningsDates } from "@/app/lib/earningsDate";
import { etTradingDate } from "@/app/lib/marketTime";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 30;

// The dashboard's "Earns in 3d" badges.
//
// This was one Yahoo quoteSummary call per symbol. Yahoo answered 1 of 9
// requests from this deployment across three cold instances, and every failure
// path returned null — which renders as no badge, indistinguishable from "no
// earnings coming up". For a pre-trade safety check that is the wrong way to
// fail, so the lookup now goes through three free sources before giving up.
//
// The response shape is unchanged: symbol → label or null.

export async function GET(req: Request) {
  const session = await viewer();
  if (!session?.user?.email) return Response.json({}, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requested = (searchParams.get("symbols") ?? "")
    .split(",").map(s => s.trim()).filter(Boolean).slice(0, 15);

  if (requested.length === 0) return Response.json({});

  // Strip the app's own suffixes before asking any provider, but key the
  // response by exactly what the caller sent.
  const cleanOf = new Map(requested.map(s => [s, s.replace(/\.(US|COMM)$/, "")]));
  const clean = [...new Set(cleanOf.values())];

  const today = etTradingDate();
  const hits = await resolveEarningsDates(clean, { today, budgetMs: 25_000 });

  const result: Record<string, string | null> = {};
  for (const original of requested) {
    const hit = hits[cleanOf.get(original)!];
    result[original] = hit ? earningsLabel(hit.date, today) : null;
  }

  return Response.json(result);
}
