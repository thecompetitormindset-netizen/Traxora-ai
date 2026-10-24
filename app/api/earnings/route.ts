import { viewer } from "@/app/lib/viewer";
import { yahooFetch } from "@/app/lib/yahooFetch";
export const dynamic = "force-dynamic";


export async function GET(req: Request) {
  const session = await viewer();
  if (!session?.user?.email) return Response.json({}, { status: 401 });
  const { searchParams } = new URL(req.url);
  const symbols = (searchParams.get("symbols") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 15);

  if (symbols.length === 0) return Response.json({});

  const result: Record<string, string | null> = {};

  await Promise.allSettled(symbols.map(async (sym) => {
    const clean = sym.replace(/\.(US|COMM)$/, "");
    try {
      const res = await yahooFetch(
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(clean)}?modules=calendarEvents`,
        { timeoutMs: 5000, budgetMs: 7_000, label: clean },
      );
      if (!res) { result[sym] = null; return; }
      const data = await res.json();
      const dates = data?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate;
      if (!Array.isArray(dates) || dates.length === 0) { result[sym] = null; return; }
      const ts = dates[0]?.raw as number | undefined;
      if (!ts) { result[sym] = null; return; }
      const daysUntil = Math.ceil((ts * 1000 - Date.now()) / 86_400_000);
      if (daysUntil < 0 || daysUntil > 90) { result[sym] = null; return; }
      const d = new Date(ts * 1000);
      const label = daysUntil === 0 ? "Earns today"
        : daysUntil === 1 ? "Earns tomorrow"
        : daysUntil <= 7  ? `Earns in ${daysUntil}d`
        : `Earns ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      result[sym] = label;
    } catch {
      result[sym] = null;
    }
  }));

  return Response.json(result);
}
