#!/usr/bin/env node
// Checks every market-data source the app depends on, from wherever you run it.
//
//   node scripts/check-data-sources.mjs
//   node scripts/check-data-sources.mjs TSLA
//
// Reads .env.local if present, so keyed providers get checked too. Reports the
// status, the latency and whether the field the app actually reads came back —
// a 200 with the wrong shape is the failure that hurts, not a clean error.

import { readFileSync } from "node:fs";

const SYMBOL = (process.argv[2] || "AAPL").toUpperCase();
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Load .env.local without a dependency.
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env.local — keyed providers are reported as "no key" */ }

const results = [];

async function check(name, url, { pick, headers = {}, needsKey = null } = {}) {
  if (needsKey && !process.env[needsKey]) {
    results.push({ name, status: "no key", detail: `${needsKey} not set`, ms: 0 });
    return;
  }
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(15_000),
    });
    const ms = Date.now() - started;
    const text = await res.text();

    if (!res.ok) {
      const hint = res.status === 429 ? "rate limited"
        : res.status === 401 || res.status === 403 ? "rejected — key or blocked"
        : res.status >= 500 ? "upstream error" : "";
      results.push({ name, status: `HTTP ${res.status}`, detail: hint || text.slice(0, 90), ms });
      return;
    }

    let data;
    try { data = JSON.parse(text); }
    catch {
      results.push({ name, status: "BAD SHAPE", detail: `200 but not JSON (${text.slice(0, 50).replace(/\s+/g, " ")}…)`, ms });
      return;
    }

    const got = pick ? pick(data) : "ok";
    if (got === undefined || got === null) {
      results.push({ name, status: "BAD SHAPE", detail: "200, JSON, but the field the app reads is missing", ms });
      return;
    }
    results.push({ name, status: "OK", detail: String(got).slice(0, 60), ms });
  } catch (e) {
    const msg = String(e?.message || e);
    results.push({
      name,
      status: /abort|timeout/i.test(msg) ? "TIMEOUT" : "UNREACHABLE",
      detail: msg.slice(0, 80),
      ms: Date.now() - started,
    });
  }
}

const F = process.env.FINNHUB_API_KEY;
const E = process.env.EODHD_API_KEY;
const A = process.env.ALPHA_VANTAGE_API_KEY;

await Promise.all([
  // ── Yahoo: no key, undocumented, the app's main price source ──────────────
  check("Yahoo chart 1y (prices, the options scan)",
    `https://query1.finance.yahoo.com/v8/finance/chart/${SYMBOL}?interval=1d&range=1y`,
    { pick: d => d?.chart?.result?.[0]?.meta?.regularMarketPrice }),

  check("Yahoo chart 2d (previous close)",
    `https://query1.finance.yahoo.com/v8/finance/chart/${SYMBOL}?interval=1d&range=2d`,
    { pick: d => d?.chart?.result?.[0]?.meta?.previousClose ?? "present but null" }),

  check("Yahoo quoteSummary (earnings / ex-div)",
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${SYMBOL}?modules=calendarEvents`,
    { pick: d => d?.quoteSummary?.result?.[0] ? "calendarEvents present" : null }),

  check("Yahoo crumb (needed by some endpoints)",
    "https://query1.finance.yahoo.com/v1/test/getcrumb",
    { pick: () => "reachable" }),

  // ── CBOE: no key, 15-minute delayed option chains ─────────────────────────
  check("CBOE delayed chain (cdn)",
    `https://cdn.cboe.com/api/global/delayed_quotes/options/${SYMBOL}.json`,
    { headers: { Referer: "https://www.cboe.com/" },
      pick: d => d?.data?.options?.length ? `${d.data.options.length} contracts` : null }),

  check("CBOE delayed chain (cdn-api)",
    `https://cdn-api.cboe.com/api/global/delayed_quotes/options/${SYMBOL}.json`,
    { headers: { Referer: "https://www.cboe.com/" },
      pick: d => d?.data?.options?.length ? `${d.data.options.length} contracts` : null }),

  // ── Nasdaq: no key, used for screener / earnings / IPO ────────────────────
  check("Nasdaq earnings calendar",
    "https://api.nasdaq.com/api/calendar/earnings",
    { pick: d => (d?.data ? "data present" : null) }),

  // ── Keyed providers the app already supports ──────────────────────────────
  check("Finnhub quote", `https://finnhub.io/api/v1/quote?symbol=${SYMBOL}&token=${F}`,
    { needsKey: "FINNHUB_API_KEY", pick: d => (typeof d?.c === "number" ? `last ${d.c}` : null) }),

  check("EODHD real-time", `https://eodhd.com/api/real-time/${SYMBOL}.US?api_token=${E}&fmt=json`,
    { needsKey: "EODHD_API_KEY", pick: d => d?.close ?? null }),

  check("Alpha Vantage quote",
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${SYMBOL}&apikey=${A}`,
    { needsKey: "ALPHA_VANTAGE_API_KEY",
      pick: d => d?.["Global Quote"]?.["05. price"] ?? (d?.Note ? "rate limited (Note)" : null) }),
]);

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nData sources for ${SYMBOL} — ${new Date().toISOString()}\n`);
for (const r of results) {
  const mark = r.status === "OK" ? "✓" : r.status === "no key" ? "–" : "✗";
  console.log(`${mark} ${pad(r.name, 44)} ${pad(r.status, 12)} ${pad(r.ms + "ms", 8)} ${r.detail}`);
}

const broken = results.filter(r => r.status !== "OK" && r.status !== "no key");
console.log(`\n${results.length - broken.length - results.filter(r => r.status === "no key").length} ok, ` +
            `${broken.length} failing, ${results.filter(r => r.status === "no key").length} unconfigured`);
if (broken.length) {
  console.log("\nFailing:");
  for (const r of broken) console.log(`  ${r.name}: ${r.status} — ${r.detail}`);
}
process.exit(broken.length ? 1 : 0);
