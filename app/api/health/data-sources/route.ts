export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 60;

import { auth } from "@/auth";
import { newYahooStats, wasThrottled, yahooFetch, yahooTotals } from "@/app/lib/yahooFetch";

// Are the market-data sources reachable from where the app actually runs?
//
// The local script in scripts/ answers this for your own machine, which is a
// different network with a different rate-limit budget. Yahoo throttles by IP,
// so a source can look healthy from a laptop and still be failing in
// production. This answers for the deployment.
//
// Yahoo is checked through yahooFetch, so the result reflects the real path
// the app uses — queue, retries and all — rather than a bare fetch that would
// behave differently from the thing being diagnosed.

type Check = {
  source: string;
  status: "ok" | "bad_shape" | "http_error" | "unreachable";
  ms: number;
  detail: string;
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Non-Yahoo sources: a plain fetch, since nothing throttles them. */
async function plainCheck(source: string, url: string, pick: (d: unknown) => unknown, headers: Record<string, string> = {}): Promise<Check> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": UA, ...headers },
      signal: AbortSignal.timeout(12_000),
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      return { source, status: "http_error", ms, detail: `HTTP ${res.status}${res.status === 429 ? " (rate limited)" : ""}` };
    }
    let body: unknown;
    try { body = await res.json(); }
    catch { return { source, status: "bad_shape", ms, detail: "200 but the body is not JSON" }; }
    const got = pick(body);
    return got == null
      ? { source, status: "bad_shape", ms, detail: "200 and JSON, but the field the app reads is missing" }
      : { source, status: "ok", ms, detail: String(got).slice(0, 80) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { source, status: "unreachable", ms: Date.now() - started, detail: msg.slice(0, 90) };
  }
}

/** Yahoo sources, through the app's own throttled client. */
async function yahooCheck(source: string, url: string, pick: (d: unknown) => unknown, stats: ReturnType<typeof newYahooStats>): Promise<Check> {
  const started = Date.now();
  const res = await yahooFetch(url, { timeoutMs: 12_000, budgetMs: 20_000, stats, label: source });
  const ms = Date.now() - started;
  if (!res) {
    return { source, status: "unreachable", ms, detail: "no usable response — see the yahoo counters below" };
  }
  let body: unknown;
  try { body = await res.json(); }
  catch { return { source, status: "bad_shape", ms, detail: "200 but the body is not JSON" }; }
  const got = pick(body);
  return got == null
    ? { source, status: "bad_shape", ms, detail: "200 and JSON, but the field the app reads is missing" }
    : { source, status: "ok", ms, detail: String(got).slice(0, 80) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dig = (d: unknown, path: string): any => path.split(".").reduce<any>((v, k) => (v == null ? v : v[k]), d as any);

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "thecompetitormindset@gmail.com";

/**
 * Two ways in, because they serve different callers.
 *
 * A monitor has no session, so it presents CRON_SECRET. A person wants to read
 * this in a browser, and Vercel hides a secret's value once it is saved — so
 * requiring the secret would mean rotating it just to look at a health page.
 * Being signed in as the owner is enough.
 */
async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization");
    const query = new URL(req.url).searchParams.get("secret");
    if (header === `Bearer ${secret}` || query === secret) return true;
  }
  try {
    const session = await auth();
    return session?.user?.email === OWNER_EMAIL;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  if (!(await authorized(req))) {
    return Response.json(
      { error: "Unauthorized", hint: "Sign in as the owner, or pass CRON_SECRET as a Bearer token or ?secret=" },
      { status: 401 },
    );
  }

  const symbol = (new URL(req.url).searchParams.get("symbol") ?? "AAPL").toUpperCase().slice(0, 6);
  const stats = newYahooStats();

  const checks = await Promise.all([
    yahooCheck("yahoo:chart-1y", `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`,
      d => dig(d, "chart.result.0.meta.regularMarketPrice"), stats),
    yahooCheck("yahoo:chart-2d", `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`,
      d => dig(d, "chart.result.0.meta.regularMarketPrice"), stats),
    yahooCheck("yahoo:quoteSummary", `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=calendarEvents`,
      d => (dig(d, "quoteSummary.result.0") ? "calendarEvents present" : null), stats),

    plainCheck("cboe:delayed-chain", `https://cdn.cboe.com/api/global/delayed_quotes/options/${symbol}.json`,
      d => { const n = dig(d, "data.options.length"); return n ? `${n} contracts` : null; },
      { Referer: "https://www.cboe.com/" }),

    plainCheck("nasdaq:earnings", "https://api.nasdaq.com/api/calendar/earnings",
      d => (dig(d, "data") ? "data present" : null)),

    ...(process.env.FINNHUB_API_KEY
      ? [plainCheck("finnhub:quote",
          `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${process.env.FINNHUB_API_KEY}`,
          d => { const c = dig(d, "c"); return typeof c === "number" && c > 0 ? `last ${c}` : null; })]
      : []),
  ]);

  const failing = checks.filter(c => c.status !== "ok");

  return Response.json({
    symbol,
    checked_at: new Date().toISOString(),
    // Which keyed providers exist, without revealing any of them.
    keys: {
      finnhub: Boolean(process.env.FINNHUB_API_KEY),
      eodhd: Boolean(process.env.EODHD_API_KEY),
      alpha_vantage: Boolean(process.env.ALPHA_VANTAGE_API_KEY),
    },
    checks,
    // Counters from the throttled client: rate_limited above zero means Yahoo
    // pushed back even with the queue in front of it.
    yahoo: { this_request: stats, since_boot: yahooTotals(), throttled: wasThrottled(stats) },
    summary: failing.length === 0
      ? "All sources answered with the field the app reads."
      : `${failing.length} of ${checks.length} sources failing: ${failing.map(c => c.source).join(", ")}`,
  }, {
    status: failing.length ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
