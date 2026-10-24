import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newYahooStats, wasThrottled, yahooFetch, yahooJson } from "../yahooFetch";

// The limiter exists because four simultaneous Yahoo requests came back 429
// from a normal connection while a single one succeeded, and the app was
// firing up to 126 at once with no retry and no visibility.

const realFetch = globalThis.fetch;

type Call = { url: string; at: number };

/** Records concurrency and lets each call's response be scripted. */
function mockFetch(handler: (url: string, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  let inFlight = 0;
  let peak = 0;
  let n = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push({ url, at: Date.now() });
    inFlight++;
    peak = Math.max(peak, inFlight);
    try {
      // A tick of real work, so overlap is observable.
      await new Promise(r => setTimeout(r, 10));
      return await handler(url, n++);
    } finally {
      inFlight--;
    }
  }) as typeof fetch;

  return { calls, peak: () => peak };
}

const ok = (body: unknown = { ok: true }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const tooMany = (retryAfter?: string) =>
  new Response("rate limited", { status: 429, headers: retryAfter ? { "retry-after": retryAfter } : {} });

beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

describe("concurrency", () => {
  it("never runs more than two requests at once, however many are queued", async () => {
    const m = mockFetch(() => ok());
    const stats = newYahooStats();

    await Promise.all(
      Array.from({ length: 12 }, (_, i) => yahooFetch(`https://query1.finance.yahoo.com/${i}`, { stats, budgetMs: 20_000 })),
    );

    expect(m.peak()).toBeLessThanOrEqual(2);
    expect(stats.ok).toBe(12);
    expect(wasThrottled(stats)).toBe(false);
  });

  it("spaces request starts rather than stacking them", async () => {
    const m = mockFetch(() => ok());
    await Promise.all(
      Array.from({ length: 4 }, (_, i) => yahooFetch(`https://query1.finance.yahoo.com/s${i}`, { budgetMs: 20_000 })),
    );
    const starts = m.calls.map(c => c.at).sort((a, b) => a - b);
    // Four requests cannot all have started in the same instant.
    expect(starts[starts.length - 1] - starts[0]).toBeGreaterThanOrEqual(120);
  });
});

describe("429 handling", () => {
  it("retries a rate-limited request and succeeds", async () => {
    let seen = 0;
    mockFetch(() => (++seen <= 2 ? tooMany() : ok({ recovered: true })));
    const stats = newYahooStats();

    const body = await yahooJson<{ recovered: boolean }>("https://query1.finance.yahoo.com/x", { stats, budgetMs: 20_000 });

    expect(body).toEqual({ recovered: true });
    expect(seen).toBe(3);
    expect(stats.ok).toBe(1);
    expect(stats.rateLimited).toBe(0);
  });

  it("gives up after the retries are exhausted, and says so", async () => {
    mockFetch(() => tooMany());
    const stats = newYahooStats();

    const res = await yahooFetch("https://query1.finance.yahoo.com/y", { stats, budgetMs: 20_000 });

    expect(res).toBeNull();
    expect(stats.rateLimited).toBe(1);
    expect(wasThrottled(stats)).toBe(true);
  });

  it("does not start a retry it cannot finish inside the budget", async () => {
    let seen = 0;
    mockFetch(() => { seen++; return tooMany(); });
    const stats = newYahooStats();

    const started = Date.now();
    const res = await yahooFetch("https://query1.finance.yahoo.com/z", { stats, budgetMs: 300 });

    expect(res).toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
    expect(seen).toBeLessThanOrEqual(2);
    expect(stats.rateLimited).toBe(1);
  });

  it("honours a Retry-After that fits the budget", async () => {
    let seen = 0;
    mockFetch(() => (++seen === 1 ? tooMany("1") : ok()));
    const started = Date.now();

    const res = await yahooFetch("https://query1.finance.yahoo.com/w", { budgetMs: 20_000 });

    expect(res).not.toBeNull();
    expect(Date.now() - started).toBeGreaterThanOrEqual(900); // waited ~1s, not the 400ms default
  });
});

describe("budget and failure", () => {
  it("skips rather than queueing forever when the budget is already spent", async () => {
    mockFetch(async () => { await new Promise(r => setTimeout(r, 400)); return ok(); });
    const stats = newYahooStats();

    // Two long calls hold both slots; the rest have no budget to wait for one.
    const results = await Promise.all([
      yahooFetch("https://query1.finance.yahoo.com/a", { stats, budgetMs: 5_000 }),
      yahooFetch("https://query1.finance.yahoo.com/b", { stats, budgetMs: 5_000 }),
      yahooFetch("https://query1.finance.yahoo.com/c", { stats, budgetMs: 60 }),
      yahooFetch("https://query1.finance.yahoo.com/d", { stats, budgetMs: 60 }),
    ]);

    expect(results.filter(r => r === null).length).toBeGreaterThanOrEqual(2);
    expect(stats.skipped).toBeGreaterThanOrEqual(2);
    expect(wasThrottled(stats)).toBe(true);
  });

  it("returns null on a network error without throwing", async () => {
    globalThis.fetch = (async () => { throw new Error("ECONNRESET"); }) as typeof fetch;
    const stats = newYahooStats();

    await expect(yahooFetch("https://query1.finance.yahoo.com/err", { stats, budgetMs: 5_000 })).resolves.toBeNull();
    expect(stats.failed).toBe(1);
  });

  it("treats a non-429 error status as a failure, not a retry", async () => {
    let seen = 0;
    mockFetch(() => { seen++; return new Response("nope", { status: 404 }); });
    const stats = newYahooStats();

    expect(await yahooFetch("https://query1.finance.yahoo.com/404", { stats, budgetMs: 5_000 })).toBeNull();
    expect(seen).toBe(1);
    expect(stats.failed).toBe(1);
  });

  it("returns null when a 200 body will not parse", async () => {
    mockFetch(() => new Response("<html>not json</html>", { status: 200 }));
    const stats = newYahooStats();

    expect(await yahooJson("https://query1.finance.yahoo.com/html", { stats, budgetMs: 5_000 })).toBeNull();
    expect(stats.failed).toBe(1);
  });
});
