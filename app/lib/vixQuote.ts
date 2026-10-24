// The VIX level, from sources that are free and actually answer.
//
// Finnhub's free tier carries no index quotes, and sentiment returns 503
// without VIX because it supplies 60% of the Fear & Greed base — so that route
// was effectively down whenever Yahoo throttled, which measured at roughly
// five times in six from the deployment. Yahoo now 429s a home connection too.
//
// Measured working, keyless, 448ms: Cboe's own delayed quote for _VIX, which
// returned 19.45. Cboe publishes VIX, so this is the source rather than a
// mirror of it.
//
// Two caveats are deliberate design constraints here.
//
// Cboe's endpoint is UNDOCUMENTED, so its field names cannot be looked up and
// may change without notice. Rather than pin one name, several candidates are
// accepted and the first positive number wins. That is also why FRED is
// preferred when a key is present: FRED publishes Cboe's own VIX close as
// series VIXCLS, is officially supported and free, so adding FRED_API_KEY
// silently upgrades off the undocumented path with no further change. Cboe's
// delayed-quote pages also discourage automated extraction, which is a reason
// to prefer FRED where available rather than to depend on Cboe indefinitely.
//
// The previous close is read ONLY from fields whose name says "previous". It is
// never filled from a `close` field, which on a live quote may hold the current
// level — that would make the VIX term structure read "flat" with false
// confidence. An absent previous close returns null, and the caller already
// degrades term structure to "flat" when it is missing. This whole file exists
// because absent data kept being rendered as fact; it is not going to do that.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type VixSource = "fred" | "cboe" | "yahoo";

export type VixQuote = {
  /** The current level. */
  level: number;
  /** The prior session's close, or null when no source stated one. */
  previousClose: number | null;
  source: VixSource;
};

const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * VIX's all-time high is around 89.5, its lows around 9. A value outside this
 * is a parse error wearing a number's clothing.
 *
 * The ceiling is deliberately tight rather than generous: Cboe's own payload
 * carries `iv30 = 132.15` right next to the price fields, so a loose bound
 * would let a mis-read field through as a plausible VIX.
 */
const VIX_MIN = 5;
const VIX_MAX = 100;

export function plausibleVix(v: unknown): v is number {
  return positive(v) && v >= VIX_MIN && v <= VIX_MAX;
}

/** Walk a dotted path without throwing on a missing branch. */
function dig(d: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (v, k) => (v == null || typeof v !== "object" ? undefined : (v as Record<string, unknown>)[k]),
    d,
  );
}

/**
 * Field names Cboe might use for the current level. Ordered most specific
 * first: an explicit "current" or "last trade" beats a bare `close`, which on
 * a live quote is ambiguous.
 */
const LEVEL_FIELDS = [
  "data.current_price",
  "data.last_trade_price",
  "data.last",
  "data.price",
  "data.close",
  "current_price",
  "last_trade_price",
  "close",
];

/**
 * Named previous-close fields, used only as a second choice — see below for
 * why. Never `close`, which on a live quote holds the current level.
 */
const PREV_FIELDS = [
  "data.prev_day_close",
  "data.previous_close",
  "data.prev_close",
  "data.previous_day_close",
  "prev_day_close",
  "previous_close",
];

const CHANGE_FIELDS = ["data.price_change", "price_change"];

/**
 * Pull a plausible VIX level and previous close out of whatever shape arrived.
 *
 * The previous close is DERIVED from the day's change rather than read from
 * `prev_day_close`, because that field cannot be trusted. Observed live, with
 * the market closed:
 *
 *   current_price  = 19.45
 *   prev_day_close = 19.45     ← echoes the current price
 *   price_change   = 0.42      ← but the day's move was +0.42
 *
 * Taking `prev_day_close` there yields a zero change and reports the VIX term
 * structure as "flat" — a direction stated with confidence from data that says
 * nothing. `price_change` is internally consistent with both the price and
 * `price_change_percent` (19.45 / 1.021594 = 19.04), so it is the sound basis.
 *
 * `prev_day_close` is still used when no change field is present, but only if
 * it differs from the level; equal to the level it carries no information.
 */
export function parseCboeVix(body: unknown): VixQuote | null {
  if (body == null || typeof body !== "object") return null;

  let level: number | null = null;
  for (const f of LEVEL_FIELDS) {
    const v = dig(body, f);
    if (plausibleVix(v)) { level = v; break; }
  }
  if (level === null) return null;

  let previousClose: number | null = null;

  for (const f of CHANGE_FIELDS) {
    const change = dig(body, f);
    if (typeof change === "number" && Number.isFinite(change)) {
      const derived = level - change;
      if (plausibleVix(derived)) previousClose = derived;
      break;
    }
  }

  if (previousClose === null) {
    for (const f of PREV_FIELDS) {
      const v = dig(body, f);
      if (plausibleVix(v) && v !== level) { previousClose = v; break; }
    }
  }

  return { level, previousClose, source: "cboe" };
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": UA, ...headers },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** FRED's VIXCLS: the official route, free with a key, daily close. */
async function fromFred(key: string): Promise<VixQuote | null> {
  // Two observations, newest first: the latest close is the level, the one
  // before it is the previous close.
  const body = await getJson(
    "https://api.stlouisfed.org/fred/series/observations" +
    `?series_id=VIXCLS&api_key=${encodeURIComponent(key)}&file_type=json` +
    "&sort_order=desc&limit=8",
  );
  const rows = dig(body, "observations");
  if (!Array.isArray(rows)) return null;

  // FRED writes "." for a day with no observation, so filter before pairing.
  const values = rows
    .map(r => Number((r as { value?: string })?.value))
    .filter((v): v is number => plausibleVix(v));

  if (values.length === 0) return null;
  return { level: values[0], previousClose: values[1] ?? null, source: "fred" };
}

/** Cboe's own delayed quote: keyless, undocumented, measured working. */
async function fromCboe(): Promise<VixQuote | null> {
  const body = await getJson(
    "https://cdn.cboe.com/api/global/delayed_quotes/quotes/_VIX.json",
    { Referer: "https://www.cboe.com/" },
  );
  return parseCboeVix(body);
}

/**
 * Yahoo, last. It answers about one request in six from the deployment, so it
 * is a backstop rather than a source — but a sixth of the time beats nothing,
 * and it is the only one of the three that needs no key and no undocumented
 * endpoint.
 */
async function fromYahoo(): Promise<VixQuote | null> {
  const { yahooJson } = await import("./yahooFetch");
  const { resolvePreviousClose } = await import("./quoteSanity");

  const body = await yahooJson<{
    chart?: { result?: Array<{
      meta?: { regularMarketPrice?: number; previousClose?: number };
      indicators?: { quote?: Array<{ close?: (number | null)[] }> };
    }> };
  }>(
    "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=6d",
    { timeoutMs: 7_000, budgetMs: 12_000, label: "^VIX" },
  );

  const result = body?.chart?.result?.[0];
  const level = result?.meta?.regularMarketPrice;
  if (!plausibleVix(level)) return null;

  const closes = (result?.indicators?.quote?.[0]?.close ?? [])
    .filter((v): v is number => plausibleVix(v));
  const prev = resolvePreviousClose(result?.meta, closes);

  return { level, previousClose: plausibleVix(prev) ? prev : null, source: "yahoo" };
}

/**
 * The VIX level, or null if no source answered.
 *
 * FRED first when a key is configured, then Cboe, then Yahoo. Each failure is
 * silent and falls through; the caller learns which source answered from
 * `source`, so a quiet degradation is still visible in the response.
 */
export async function vixQuote(): Promise<VixQuote | null> {
  const fredKey = process.env.FRED_API_KEY;
  if (fredKey) {
    const fred = await fromFred(fredKey).catch(() => null);
    if (fred) return fred;
  }

  const cboe = await fromCboe().catch(() => null);
  if (cboe) return cboe;

  return await fromYahoo().catch(() => null);
}
