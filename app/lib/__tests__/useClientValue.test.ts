import { describe, expect, it } from "vitest";
import { everyMs, sameSnapshot, windowEvent } from "../useClientValue";

// The hook itself needs a renderer to exercise, and this project has no DOM
// test setup. What IS testable without one is the part that would break the
// app if it were wrong: the snapshot comparison.
//
// useSyncExternalStore calls getSnapshot repeatedly and compares by identity.
// A reader that parses JSON out of storage returns a fresh object every call,
// so without this comparison the component would re-render forever.

describe("sameSnapshot", () => {
  it("treats identical primitives as unchanged", () => {
    expect(sameSnapshot("clean", "clean")).toBe(true);
    expect(sameSnapshot(5, 5)).toBe(true);
    expect(sameSnapshot(null, null)).toBe(true);
    expect(sameSnapshot(undefined, undefined)).toBe(true);
  });

  it("treats different primitives as changed", () => {
    expect(sameSnapshot("clean", "dark")).toBe(false);
    expect(sameSnapshot(0, 1)).toBe(false);
    expect(sameSnapshot(null, undefined)).toBe(false);
  });

  it("treats a freshly parsed object as unchanged when it says the same thing", () => {
    // The case the whole cache exists for: loadRiskSettings() and friends hand
    // back a new object on every call, and identity alone would spin.
    const a = JSON.parse('{"accountSize":1000,"riskPct":1}');
    const b = JSON.parse('{"accountSize":1000,"riskPct":1}');
    expect(a).not.toBe(b);
    expect(sameSnapshot(a, b)).toBe(true);
  });

  it("notices a real change inside an object", () => {
    expect(sameSnapshot({ riskPct: 1 }, { riskPct: 2 })).toBe(false);
    expect(sameSnapshot({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("compares arrays by contents and by order", () => {
    expect(sameSnapshot([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(sameSnapshot([1, 2, 3], [3, 2, 1])).toBe(false);
    expect(sameSnapshot([], [])).toBe(true);
  });

  it("does not confuse an object with a primitive", () => {
    expect(sameSnapshot({}, "")).toBe(false);
    expect(sameSnapshot(null, {})).toBe(false);
    expect(sameSnapshot([], {})).toBe(false);
  });

  it("reports a circular value as changed rather than throwing", () => {
    // Saying "changed" costs a re-render. Throwing from getSnapshot would take
    // the component down, and claiming "same" could freeze it on stale data.
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => sameSnapshot(circular, { a: 1 })).not.toThrow();
    expect(sameSnapshot(circular, { a: 1 })).toBe(false);
  });
});

describe("subscriptions", () => {
  // These run in a node environment with no window, which is also the server
  // case the helpers guard against — so the stub stands in for a browser and
  // the guard is checked on its own.
  function withStubWindow<T>(fn: (calls: { on: string[]; off: string[]; intervals: number }) => T): T {
    const calls = { on: [] as string[], off: [] as string[], intervals: 0 };
    const original = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
      addEventListener: (n: string) => calls.on.push(n),
      removeEventListener: (n: string) => calls.off.push(n),
      setInterval: () => { calls.intervals++; return 1 as unknown as number; },
      clearInterval: () => { calls.intervals--; },
    };
    try { return fn(calls); } finally { (globalThis as { window?: unknown }).window = original; }
  }

  it("windowEvent attaches and detaches every name it is given", () => {
    withStubWindow(calls => {
      const unsubscribe = windowEvent("storage", "traxora:theme")(() => {});
      expect(calls.on).toEqual(["storage", "traxora:theme"]);

      unsubscribe();
      expect(calls.off).toEqual(["storage", "traxora:theme"]);
    });
  });

  it("everyMs clears its timer when unsubscribed", () => {
    withStubWindow(calls => {
      const unsubscribe = everyMs(1_000)(() => {});
      expect(calls.intervals).toBe(1);

      unsubscribe();
      expect(calls.intervals).toBe(0);   // a leaked interval would stay at 1
    });
  });

  it("does nothing at all on the server, where there is no window", () => {
    const original = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = undefined;
    try {
      expect(() => windowEvent("storage")(() => {})()).not.toThrow();
      expect(() => everyMs(1_000)(() => {})()).not.toThrow();
    } finally {
      (globalThis as { window?: unknown }).window = original;
    }
  });
});
