#!/usr/bin/env node
// Which free market-data sources actually work, from your machine.
//
//   node scripts/probe-free-sources.mjs
//
// Why this exists: the build sandbox's network policy blocks every candidate
// below, so their response shapes cannot be checked from there. Guessing at
// them is what produced a wrong recommendation about Alpha Vantage and EODHD
// earlier — both turned out to have PER-DAY limits (25 and 20), not per-minute.
//
// This asks each source for one real value and prints whether it arrived and
// what it looked like. No dependencies. Reads .env.local if present, and never
// prints a key's value — only whether it is set.
//
// Yahoo throttles by IP, so a 429 here reflects YOUR network, not production.
// For the deployment's answer, open /api/health/data-sources while signed in.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Environment ──────────────────────────────────────────────────────────────

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  } catch {
    // Not there is fine; keys may come from the real environment.
  }
}
loadEnvLocal();

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const GREEN = "\x1b[32m", RED = "\x1b[31m", YELLOW = "\x1b[33m", DIM = "\x1b[2m", OFF = "\x1b[0m";

/**
 * Fetch one URL and reduce it to a single value with `pick`.
 *
 * `pick` returns a short string on success or null when the body arrived but
 * did not carry the field — a distinction that matters, because several of
 * these answer 200 with an empty payload rather than an error status.
 */
async function probe({ name, url, pick, headers = {}, note = "", skip = null, asText = false }) {
  if (skip) return { name, status: "skipped", detail: skip, note };
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, ...headers },
      signal: AbortSignal.timeout(15_000),
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      const hint = res.status === 429 ? " (rate limited — your IP)"
        : res.status === 403 ? " (forbidden — key may lack this endpoint)"
        : res.status === 404 ? " (not found — path may have moved)"
        : "";
      return { name, status: "http_error", ms, detail: `HTTP ${res.status}${hint}`, note };
    }
    let body;
    if (asText) {
      body = await res.text();
    } else {
      try { body = await res.json(); }
      catch { return { name, status: "bad_shape", ms, detail: "200 but not JSON", note }; }
    }
    let got;
    try { got = pick(body); }
    catch (e) { return { name, status: "bad_shape", ms, detail: `200, but reading it threw: ${e.message}`.slice(0, 90), note }; }
    return got == null
      ? { name, status: "bad_shape", ms, detail: "200, but the expected field is missing", note }
      : { name, status: "ok", ms, detail: String(got).slice(0, 70), note };
  } catch (e) {
    return { name, status: "unreachable", ms: Date.now() - started, detail: String(e.message ?? e).slice(0, 80), note };
  }
}

const dig = (d, path) => path.split(".").reduce((v, k) => (v == null ? v : v[k]), d);

const polygonKey = process.env.POLYGON_API_KEY;
const fredKey    = process.env.FRED_API_KEY;
const twelveKey  = process.env.TWELVE_DATA_API_KEY;

const PROBES = [
  // ── VIX, which Finnhub's free tier cannot serve ───────────────────────────
  {
    name: "cboe:vix",
    url: "https://cdn.cboe.com/api/global/delayed_quotes/quotes/_VIX.json",
    headers: { Referer: "https://www.cboe.com/" },
    pick: d => dig(d, "data.last_trade_price") ?? dig(d, "data.close") ?? dig(d, "data.price"),
    note: "no key, ~15min delayed. UNDOCUMENTED, and Cboe's terms discourage auto-extraction.",
  },
  {
    name: "fred:VIXCLS",
    url: fredKey
      ? `https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&api_key=${fredKey}&file_type=json&sort_order=desc&limit=1`
      : "",
    pick: d => { const o = dig(d, "observations.0"); return o ? `${o.date} = ${o.value}` : null; },
    skip: fredKey ? null : "no FRED_API_KEY — free at fredaccount.stlouisfed.org/apikeys",
    note: "free key, official, daily close only. The clean option for VIX.",
  },
  {
    name: "stooq:vix",
    url: "https://stooq.com/q/l/?s=%5Evix&f=sd2t2ohlcv&h&e=csv",
    asText: true,
    pick: t => { const l = t.trim().split("\n"); return l.length > 1 ? l[1] : null; },
    note: "no key, CSV, unofficial.",
  },

  // ── Daily bars: volume history and 52-week range, scan's missing inputs ───
  {
    name: "polygon:prev-day",
    url: polygonKey ? `https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=${polygonKey}` : "",
    pick: d => { const r = dig(d, "results.0"); return r ? `c=${r.c} v=${r.v}` : null; },
    skip: polygonKey ? null : "no POLYGON_API_KEY set",
    note: "KEY ALREADY IN VERCEL. Free: ~5 calls/min, EOD, 2y history.",
  },
  {
    name: "polygon:60-day-bars",
    url: polygonKey
      ? `https://api.polygon.io/v2/aggs/ticker/AAPL/range/1/day/2026-07-01/2026-10-20?adjusted=true&sort=asc&limit=120&apiKey=${polygonKey}`
      : "",
    pick: d => { const n = dig(d, "results.length"); return n ? `${n} daily bars` : null; },
    skip: polygonKey ? null : "no POLYGON_API_KEY set",
    note: "THE IMPORTANT ONE: enough bars for a 20-day volume average and a 52w range.",
  },
  {
    name: "stooq:daily-history",
    url: "https://stooq.com/q/d/l/?s=aapl.us&i=d",
    asText: true,
    pick: t => { const l = t.trim().split("\n"); return l.length > 2 ? `${l.length - 1} rows` : null; },
    note: "no key, daily OHLCV CSV. Fallback for the same job.",
  },
  {
    name: "twelvedata:quote",
    url: twelveKey ? `https://api.twelvedata.com/quote?symbol=AAPL&apikey=${twelveKey}` : "",
    pick: d => (d?.close ? `close ${d.close}` : null),
    skip: twelveKey ? null : "no TWELVE_DATA_API_KEY — free tier is said to be far larger than Alpha Vantage's 25/day",
    note: "worth a free key if Polygon's 5/min proves awkward.",
  },

  // ── Already in use, for comparison ───────────────────────────────────────
  {
    name: "nasdaq:earnings-by-date",
    url: "https://api.nasdaq.com/api/calendar/earnings?date=2026-11-02",
    headers: { Accept: "application/json", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" },
    pick: d => { const n = dig(d, "data.rows.length"); return n ? `${n} companies` : null; },
    note: "already used; no key, reliable in every production sample.",
  },
  {
    name: "yahoo:chart (baseline)",
    url: "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=10d",
    pick: d => dig(d, "chart.result.0.meta.regularMarketPrice"),
    note: "the one at ~1-in-6 from Vercel. A 429 here is YOUR IP, not production.",
  },
];

// ── Run ──────────────────────────────────────────────────────────────────────

const label = {
  ok:          `${GREEN}  OK       ${OFF}`,
  http_error:  `${RED}  HTTP     ${OFF}`,
  bad_shape:   `${YELLOW}  SHAPE    ${OFF}`,
  unreachable: `${RED}  NO REPLY ${OFF}`,
  skipped:     `${DIM}  SKIPPED  ${OFF}`,
};

console.log("\nProbing free market-data sources from this machine.\n");

const results = [];
// Sequential on purpose: several of these rate-limit, and a burst would make a
// working source look broken.
for (const p of PROBES) {
  const r = await probe(p);
  results.push(r);
  const ms = r.ms == null ? "" : `${DIM}${String(r.ms).padStart(5)}ms${OFF}`;
  console.log(`${label[r.status]} ${r.name.padEnd(26)} ${ms}  ${r.detail}`);
  if (r.note) console.log(`${DIM}           ${r.note}${OFF}`);
}

const keys = {
  POLYGON_API_KEY: Boolean(polygonKey),
  FRED_API_KEY: Boolean(fredKey),
  TWELVE_DATA_API_KEY: Boolean(twelveKey),
  FINNHUB_API_KEY: Boolean(process.env.FINNHUB_API_KEY),
};
console.log(`\n${DIM}Keys visible here (names only, never values):${OFF}`);
for (const [k, present] of Object.entries(keys)) {
  console.log(`${DIM}  ${present ? "set    " : "not set"}  ${k}${OFF}`);
}

const working = results.filter(r => r.status === "ok").map(r => r.name);
console.log(`\n${working.length} of ${results.length} answered with the field we wanted.`);
if (working.length) console.log(`Working: ${working.join(", ")}`);
console.log(
  `\n${DIM}If a key is missing, 'vercel env pull --environment=production' brings the\n` +
  `production set down — the default pulls 'development', which is usually empty.${OFF}\n`,
);
