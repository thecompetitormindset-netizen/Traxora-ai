import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EARNINGS_HORIZON_DAYS,
  __clearEarningsDayCache,
  daysUntil,
  earningsLabel,
  nextTradingDays,
  pickNextEarningsDate,
  resolveEarningsDates,
} from "../earningsDate";

// An earnings date is a pre-trade safety check, and a missing one renders as no
// badge — which reads as all-clear. So the thing worth testing hardest is that
// a provider failing produces a fall-through to the next source rather than a
// confident blank.

const realFetch = globalThis.fetch;
const realKey = process.env.FINNHUB_API_KEY;

type Seen = { finnhub: number; nasdaq: number; yahoo: number };

function mockProviders(opts: {
  finnhub?: (url: string) => Response;
  nasdaq?: (url: string) => Response;
  yahoo?: (url: string) => Response;
}): Seen {
  const seen: Seen = { finnhub: 0, nasdaq: 0, yahoo: 0 };

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("finnhub.io")) {
      seen.finnhub++;
      if (!opts.finnhub) return new Response("no", { status: 500 });
      return opts.finnhub(url);
    }
    if (url.includes("api.nasdaq.com")) {
      seen.nasdaq++;
      if (!opts.nasdaq) return new Response("no", { status: 500 });
      return opts.nasdaq(url);
    }
    if (url.includes("finance.yahoo.com")) {
      seen.yahoo++;
      if (!opts.yahoo) return new Response("no", { status: 500 });
      return opts.yahoo(url);
    }
    throw new Error(`unrouted url: ${url}`);
  }) as typeof fetch;

  return seen;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  process.env.FINNHUB_API_KEY = "test-key";
  // The Nasdaq day cache lives for an hour in module state, so it has to be
  // cleared or one test's calendar answers the next test's sweep.
  __clearEarningsDayCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.FINNHUB_API_KEY;
  else process.env.FINNHUB_API_KEY = realKey;
});

describe("daysUntil", () => {
  it("counts whole days, including across a month boundary", () => {
    expect(daysUntil("2026-11-02", "2026-10-30")).toBe(3);
    expect(daysUntil("2026-10-30", "2026-10-30")).toBe(0);
    expect(daysUntil("2026-10-29", "2026-10-30")).toBe(-1);
  });

  it("is exact across a DST change rather than off by the shifted hour", () => {
    // US clocks go back on 2026-11-01. Counting in milliseconds from local
    // midnights would make this 25 days and a bit, and floor to the wrong day.
    expect(daysUntil("2026-11-20", "2026-10-26")).toBe(25);
  });

  it("rejects anything that is not an ISO date", () => {
    expect(daysUntil("tomorrow", "2026-10-30")).toBeNull();
    expect(daysUntil("2026-10-30", "")).toBeNull();
  });
});

describe("earningsLabel", () => {
  it("uses the relative wording inside a week", () => {
    expect(earningsLabel("2026-10-30", "2026-10-30")).toBe("Earns today");
    expect(earningsLabel("2026-10-31", "2026-10-30")).toBe("Earns tomorrow");
    expect(earningsLabel("2026-11-02", "2026-10-30")).toBe("Earns in 3d");
    expect(earningsLabel("2026-11-06", "2026-10-30")).toBe("Earns in 7d");
  });

  it("switches to a date beyond a week, printed as the ET day", () => {
    // Rendered in UTC on purpose: formatting the UTC-midnight instant in a
    // western local timezone would print the previous day.
    expect(earningsLabel("2026-11-12", "2026-10-30")).toBe("Earns Nov 12");
  });

  it("shows nothing for a past date or one past the horizon", () => {
    expect(earningsLabel("2026-10-29", "2026-10-30")).toBeNull();
    expect(earningsLabel("2027-06-01", "2026-10-30")).toBeNull();
  });

  it("includes the last day of the horizon and excludes the next", () => {
    const today = "2026-10-30";
    const atEdge = new Date(Date.UTC(2026, 9, 30) + EARNINGS_HORIZON_DAYS * 86_400_000)
      .toISOString().slice(0, 10);
    const pastEdge = new Date(Date.UTC(2026, 9, 30) + (EARNINGS_HORIZON_DAYS + 1) * 86_400_000)
      .toISOString().slice(0, 10);

    expect(earningsLabel(atEdge, today)).not.toBeNull();
    expect(earningsLabel(pastEdge, today)).toBeNull();
  });
});

describe("pickNextEarningsDate", () => {
  it("takes the soonest future date and ignores past ones", () => {
    expect(pickNextEarningsDate(["2026-12-01", "2026-10-20", "2026-11-05"], "2026-10-30"))
      .toBe("2026-11-05");
  });

  it("returns null when every date is behind us", () => {
    expect(pickNextEarningsDate(["2026-01-01", "2026-10-29"], "2026-10-30")).toBeNull();
  });

  it("ignores malformed entries rather than throwing", () => {
    expect(pickNextEarningsDate(["", "not-a-date", "2026-11-05"], "2026-10-30")).toBe("2026-11-05");
  });
});

describe("nextTradingDays", () => {
  it("skips the weekend", () => {
    // 2026-10-30 is a Friday, so the next two are the following Mon and Tue.
    expect(nextTradingDays(3, "2026-10-30")).toEqual(["2026-10-30", "2026-11-02", "2026-11-03"]);
  });

  it("skips a holiday", () => {
    // Thanksgiving 2026 falls on Thursday 2026-11-26.
    const days = nextTradingDays(4, "2026-11-25");
    expect(days).not.toContain("2026-11-26");
    expect(days).toContain("2026-11-27");
  });

  it("returns nothing for a malformed date", () => {
    expect(nextTradingDays(5, "whenever")).toEqual([]);
  });
});

describe("resolveEarningsDates source order", () => {
  const today = "2026-10-30";

  it("takes Finnhub's date and asks nobody else", async () => {
    const seen = mockProviders({
      finnhub: () => json({ earningsCalendar: [{ date: "2026-11-05", symbol: "AAPL" }] }),
    });
    const got = await resolveEarningsDates(["AAPL"], { today });

    expect(got.AAPL).toEqual({ date: "2026-11-05", source: "finnhub" });
    expect(seen).toEqual({ finnhub: 1, nasdaq: 0, yahoo: 0 });
  });

  it("falls through to Nasdaq when Finnhub is not on the plan (403)", async () => {
    // The one uncertainty in this design: if /calendar/earnings turns out to be
    // premium, a 403 must degrade rather than break the feature.
    const seen = mockProviders({
      finnhub: () => new Response("premium", { status: 403 }),
      nasdaq: (url) =>
        url.includes("2026-11-02")
          ? json({ data: { rows: [{ symbol: "AAPL" }] } })
          : json({ data: { rows: [{ symbol: "ZZZZ" }] } }),
    });
    const got = await resolveEarningsDates(["AAPL"], { today });

    expect(got.AAPL).toEqual({ date: "2026-11-02", source: "nasdaq" });
    expect(seen.finnhub).toBe(1);
    expect(seen.yahoo).toBe(0);
  });

  it("falls all the way to Yahoo when the first two have nothing", async () => {
    const seen = mockProviders({
      finnhub: () => json({ earningsCalendar: [] }),
      nasdaq:  () => json({ data: { rows: [] } }),
      yahoo:   () => json({
        quoteSummary: {
          result: [{ calendarEvents: { earnings: { earningsDate: [{ raw: 1795000000 }] } } }],
        },
      }),
    });
    const got = await resolveEarningsDates(["AAPL"], { today });

    expect(got.AAPL?.source).toBe("yahoo");
    expect(seen.yahoo).toBe(1);
  });

  it("returns null, not a throw, when every source fails", async () => {
    mockProviders({});  // all three answer 500
    const got = await resolveEarningsDates(["AAPL"], { today });

    expect(got.AAPL).toBeNull();
  });

  it("stops sweeping once every symbol is placed", async () => {
    // The sweep is the expensive stage; it must not walk all ten days when the
    // first one answers for everyone.
    const seen = mockProviders({
      finnhub: () => new Response("premium", { status: 403 }),
      nasdaq:  () => json({ data: { rows: [{ symbol: "AAPL" }, { symbol: "MSFT" }] } }),
    });
    const got = await resolveEarningsDates(["AAPL", "MSFT"], { today });

    expect(got.AAPL?.date).toBe("2026-10-30");
    expect(got.MSFT?.date).toBe("2026-10-30");
    expect(seen.nasdaq).toBe(1);
  });

  it("covers every requested symbol in one sweep pass, not one per symbol", async () => {
    const seen = mockProviders({
      finnhub: () => new Response("premium", { status: 403 }),
      nasdaq:  (url) =>
        url.includes("2026-11-03")
          ? json({ data: { rows: [{ symbol: "AAPL" }, { symbol: "MSFT" }, { symbol: "NVDA" }] } })
          : json({ data: { rows: [] } }),
    });
    const got = await resolveEarningsDates(["AAPL", "MSFT", "NVDA"], { today });

    expect(got.AAPL?.date).toBe("2026-11-03");
    expect(got.NVDA?.date).toBe("2026-11-03");
    // Three symbols, but the sweep is shared: Fri, Mon, Tue — not 3 × 10.
    expect(seen.nasdaq).toBe(3);
  });

  it("matches Nasdaq symbols case-insensitively", async () => {
    mockProviders({
      finnhub: () => new Response("premium", { status: 403 }),
      nasdaq:  () => json({ data: { rows: [{ symbol: "aapl " }] } }),
    });
    const got = await resolveEarningsDates(["AAPL"], { today });

    expect(got.AAPL?.source).toBe("nasdaq");
  });

  it("skips Finnhub for a symbol it cannot serve, without spending a call", async () => {
    const seen = mockProviders({ nasdaq: () => json({ data: { rows: [] } }) });
    const got = await resolveEarningsDates(["BTC-USD"], { today });

    expect(seen.finnhub).toBe(0);
    expect(got["BTC-USD"]).toBeNull();
  });

  it("keys the result by every requested symbol, even unknown ones", async () => {
    mockProviders({
      finnhub: () => json({ earningsCalendar: [{ date: "2026-11-05", symbol: "AAPL" }] }),
      nasdaq:  () => json({ data: { rows: [] } }),
      yahoo:   () => json({ quoteSummary: { result: [{}] } }),
    });
    const got = await resolveEarningsDates(["AAPL", "WHAT"], { today });

    expect(Object.keys(got).sort()).toEqual(["AAPL", "WHAT"]);
    expect(got.WHAT).toBeNull();
  });
});
