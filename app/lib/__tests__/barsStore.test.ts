import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase's REST interface will not return more than a fixed number of rows in
// one response, whatever limit the query asks for, and it does not say so: the
// request succeeds and the caller treats the first page as the whole answer.
//
// That cost this project twenty-nine backfill runs with no progress, and it was
// about to cost the scorer most of its field. These tests stand a fake
// PostgREST in front of the store that enforces such a cap, and check that what
// comes back is everything rather than a page of it.

type Row = Record<string, unknown>;

/** The rows the fake server holds, replaced per test. */
let table: Row[] = [];

/** How many rows the fake server will return at most, however many are asked for. */
let cap = 1_000;

/** Every range the store asked for, so paging behaviour is inspectable. */
let ranges: Array<[number, number]> = [];

/** The columns the last query ordered by, in order of precedence. */
let orderedBy: string[] = [];

/**
 * A stand-in for one query chain, enforcing a server-side row cap.
 *
 * A chain per `.from()`, as the real client does, so filters from one query
 * cannot leak into the next. The matched rows are sorted once and the pages are
 * sliced from that, which keeps a test that pages a hundred and fifty times
 * fast enough to be worth having.
 */
function makeChain() {
  const eqs: Array<[string, unknown]> = [];
  let inFilter: null | { col: string; values: unknown[] } = null;
  const orders: Array<{ col: string; ascending: boolean }> = [];
  let sorted: Row[] | null = null;

  const chain = {
    select: () => chain,
    eq(col: string, value: unknown) { eqs.push([col, value]); return chain; },
    in(col: string, values: unknown[]) { inFilter = { col, values }; return chain; },
    order(col: string, opts?: { ascending?: boolean }) {
      orders.push({ col, ascending: opts?.ascending !== false });
      return chain;
    },

    range(from: number, to: number) {
      ranges.push([from, to]);
      orderedBy = orders.map(o => o.col);

      if (sorted === null) {
        const matched = table.filter(r =>
          eqs.every(([col, value]) => r[col] === value) &&
          (inFilter === null || inFilter.values.includes(r[inFilter.col])),
        );
        sorted = [...matched].sort((a, b) => {
          for (const { col, ascending } of orders) {
            const x = a[col] as string | number;
            const y = b[col] as string | number;
            if (x !== y) return (x < y ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        });
      }

      // The cap is the point: fewer rows than asked for, with no error.
      const page = sorted.slice(from, to + 1).slice(0, cap);
      return Promise.resolve({ data: page, error: null });
    },
  };

  return chain;
}

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({ from: () => makeChain() }),
  supabaseConfigured: () => true,
}));

const { barsFor, barsForMany, liquidSymbols } = await import("../barsStore");

/** `count` sessions of plausible bars for a symbol, oldest first. */
function history(symbol: string, count: number): Row[] {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    return { date, symbol, open: 10, high: 11, low: 9, close: 10 + i * 0.01, volume: 1_000_000 + i };
  });
}

beforeEach(() => {
  table = [];
  cap = 1_000;
  ranges = [];
  orderedBy = [];
});

describe("barsForMany", () => {
  it("returns every bar for every symbol, past the server's row cap", async () => {
    // Sixty symbols with a hundred and fifty sessions each: nine thousand rows
    // against a cap of a thousand. Unpaged, this read back a ninth of the field
    // and the rest looked as though it had too little history to score.
    const symbols = Array.from({ length: 60 }, (_, i) => `SYM${String(i).padStart(2, "0")}`);
    for (const s of symbols) table.push(...history(s, 150));

    const out = await barsForMany(symbols, 120);

    expect(out.size).toBe(60);
    for (const s of symbols) expect(out.get(s)).toHaveLength(150);
  });

  it("stops on an empty page, not a short one", async () => {
    // The distinction matters. If the server's cap is lower than the page size
    // the FIRST response is already short, and treating short as final would be
    // the same silent truncation one level further in.
    cap = 400;
    for (const s of ["AAA", "BBB"]) table.push(...history(s, 150));

    const out = await barsForMany(["AAA", "BBB"], 120);

    expect(out.get("AAA")).toHaveLength(150);
    expect(out.get("BBB")).toHaveLength(150);
    // 300 rows, 400 at a time: the first page is short and is not the end.
    expect(ranges.length).toBeGreaterThanOrEqual(2);
  });

  it("orders by date and symbol together, so paging cannot skip a row", async () => {
    // Offset paging over a non-total order drops and duplicates rows. (date,
    // symbol) is the table's key, so ordering on the pair is total; ordering on
    // date alone leaves rows within a date free to come back in any order, and
    // "any order" includes a different one per page.
    table.push(...history("AAA", 130));
    await barsForMany(["AAA"], 120);

    expect(orderedBy).toEqual(["date", "symbol"]);
  });

  it("keeps each symbol's bars in date order", async () => {
    // Every technical in the scorer assumes ascending dates, and rows arrive
    // interleaved by date across symbols.
    table.push(...history("AAA", 130), ...history("BBB", 130));

    const dates = (await barsForMany(["AAA", "BBB"], 120)).get("AAA")!.map(b => b.date);

    expect(dates).toEqual([...dates].sort());
  });

  it("drops symbols with too little history rather than scoring them short", async () => {
    // A hit rate from a handful of signals is worse than no hit rate, because
    // it still gets ranked.
    table.push(...history("DEEP", 150), ...history("THIN", 40));

    const out = await barsForMany(["DEEP", "THIN"], 120);

    expect(out.has("DEEP")).toBe(true);
    expect(out.has("THIN")).toBe(false);
  });

  it("asks nothing of the database for an empty symbol list", async () => {
    expect((await barsForMany([], 120)).size).toBe(0);
    expect(ranges).toEqual([]);
  });

});

describe("barsFor", () => {
  it("returns a symbol's whole history, past the cap", async () => {
    cap = 100;
    table.push(...history("AAA", 280));

    const bars = await barsFor("AAA", 120);

    expect(bars).toHaveLength(280);
    expect(bars[0].date < bars[bars.length - 1].date).toBe(true);
  });

  it("returns nothing at all when the history is too short", async () => {
    table.push(...history("AAA", 60));
    expect(await barsFor("AAA", 120)).toEqual([]);
  });
});

describe("liquidSymbols", () => {
  it("breaks volume ties on symbol, so a band is the same band next time", async () => {
    // The offset rotation walks bands of the market by liquidity. Volume ties
    // are common at the quiet end, and an untied sort makes "the band at offset
    // N" mean something different on each call — which would make a day's picks
    // irreproducible for no reason anyone could see.
    table.push(
      { date: "2025-01-02", symbol: "ZZZ", close: 10, volume: 500 },
      { date: "2025-01-02", symbol: "AAA", close: 10, volume: 500 },
      { date: "2025-01-02", symbol: "MMM", close: 10, volume: 500 },
    );

    expect(await liquidSymbols("2025-01-02", 2, 0)).toEqual(["AAA", "MMM"]);
    expect(orderedBy).toEqual(["volume", "symbol"]);
  });
});
