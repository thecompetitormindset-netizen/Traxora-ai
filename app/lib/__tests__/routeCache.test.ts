import { describe, expect, it, vi, afterEach } from "vitest";

// The three heaviest Yahoo callers refetched everything on every request. These
// check the cache semantics that were added, in particular the two that are
// easy to get wrong: a failed pass must not be cached, and the keyed cache must
// not grow without bound when the key comes from the query string.

type Row = { symbol: string; price: number | null };

/** Mirrors the single-slot pattern used by scan and indices. */
function singleSlot<T>(ttl: number, keep: (v: T) => boolean) {
  let cache: { at: number; data: T } | null = null;
  return {
    get: () => (cache && Date.now() - cache.at < ttl ? cache.data : null),
    set: (data: T) => { if (keep(data)) cache = { at: Date.now(), data }; },
  };
}

/** Mirrors the keyed pattern used by heatmap, including eviction. */
function keyed<T>(ttl: number, maxKeys: number, keep: (v: T) => boolean) {
  const cache = new Map<string, { at: number; data: T }>();
  return {
    size: () => cache.size,
    get: (k: string) => {
      const hit = cache.get(k);
      return hit && Date.now() - hit.at < ttl ? hit.data : null;
    },
    set: (k: string, data: T) => {
      if (!keep(data)) return;
      if (cache.size >= maxKeys) cache.delete(cache.keys().next().value as string);
      cache.set(k, { at: Date.now(), data });
    },
  };
}

const hasPrice = (rows: Row[]) => rows.some(r => r.price !== null);

afterEach(() => vi.useRealTimers());

describe("single-slot cache (scan, indices)", () => {
  it("serves the stored result inside the window and refetches after it", () => {
    vi.useFakeTimers();
    const c = singleSlot<Row[]>(60_000, hasPrice);
    c.set([{ symbol: "SPY", price: 500 }]);

    expect(c.get()).toEqual([{ symbol: "SPY", price: 500 }]);
    vi.advanceTimersByTime(59_000);
    expect(c.get()).not.toBeNull();
    vi.advanceTimersByTime(2_000);
    expect(c.get()).toBeNull();
  });

  it("refuses to store a pass where every symbol failed", () => {
    // Otherwise one throttled run pins an empty board for the whole window.
    const c = singleSlot<Row[]>(60_000, hasPrice);
    c.set([{ symbol: "SPY", price: null }, { symbol: "QQQ", price: null }]);
    expect(c.get()).toBeNull();
  });

  it("stores a partial pass, since some data beats none", () => {
    const c = singleSlot<Row[]>(60_000, hasPrice);
    c.set([{ symbol: "SPY", price: 500 }, { symbol: "QQQ", price: null }]);
    expect(c.get()).toHaveLength(2);
  });
});

describe("keyed cache (heatmap)", () => {
  it("separates different symbol sets", () => {
    const c = keyed<Row[]>(60_000, 50, hasPrice);
    c.set("AAPL,MSFT", [{ symbol: "AAPL", price: 1 }]);
    c.set("TSLA", [{ symbol: "TSLA", price: 2 }]);

    expect(c.get("AAPL,MSFT")).toEqual([{ symbol: "AAPL", price: 1 }]);
    expect(c.get("TSLA")).toEqual([{ symbol: "TSLA", price: 2 }]);
    expect(c.get("NVDA")).toBeNull();
  });

  it("stays bounded when the key comes from the query string", () => {
    // The caller picks the symbols, so an unbounded map would grow with
    // whatever anyone asks for.
    const c = keyed<Row[]>(60_000, 50, hasPrice);
    for (let i = 0; i < 500; i++) c.set(`SYM${i}`, [{ symbol: `SYM${i}`, price: i + 1 }]);

    expect(c.size()).toBeLessThanOrEqual(50);
    expect(c.get("SYM499")).not.toBeNull();  // newest kept
    expect(c.get("SYM0")).toBeNull();        // oldest evicted
  });

  it("expires per key", () => {
    vi.useFakeTimers();
    const c = keyed<Row[]>(60_000, 50, hasPrice);
    c.set("AAPL", [{ symbol: "AAPL", price: 1 }]);
    vi.advanceTimersByTime(61_000);
    expect(c.get("AAPL")).toBeNull();
  });
});
