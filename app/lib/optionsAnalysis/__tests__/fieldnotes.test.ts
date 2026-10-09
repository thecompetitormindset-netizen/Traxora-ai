import { describe, expect, it } from "vitest";
import { analyzeDeterministic } from "../engine";
import { reviewAnalysis } from "../validate";
import { toResearch, type StoredAnalysis } from "../display";
import { buildUserInput, futureTimeIssues, parseUserData } from "../userData";
import { explain, gapCopy, shortReason, stateOf } from "../../../components/fieldnotes/uiState";
import { domainFor, layoutMarks, textAlternative, type Mark } from "../../../components/fieldnotes/rangeLayout";
import { fmtEt, fmtLevel, fmtNum, fmtSignedPct } from "../../../components/fieldnotes/format";
import { fictionalExample } from "../../../components/fieldnotes/exampleData";
import { cleanBullishInput } from "./fixtures";

function stored(mutate?: (i: ReturnType<typeof cleanBullishInput>) => void): StoredAnalysis {
  const input = cleanBullishInput();
  mutate?.(input);
  const output = analyzeDeterministic(input);
  const r = reviewAnalysis(input, output);
  return {
    symbol: "XYZ", as_of: input.as_of!, input, output, review_status: r.status,
    review_errors: r.status === "REJECTED" ? r.errors : [], pricing: r.status === "APPROVED_CANDIDATE" ? r.pricing : null,
  };
}

describe("UI state model", () => {
  it("maps each server outcome to one UI state", () => {
    expect(stateOf({ status: "PAPER_CANDIDATE", output: null })).toBe("validated");
    expect(stateOf({ status: "STALE_CANDIDATE", output: null })).toBe("expired");
    expect(stateOf({ status: "UNAVAILABLE", output: null })).toBe("error");
    const noQuotes = stored(i => { for (const c of i.contracts!) c.quote_timestamp = null; });
    expect(stateOf({ status: "NO_TRADE", output: noQuotes.output })).toBe("no_trade");
    const noPrice = stored(i => { i.underlying.price = null; });
    expect(stateOf({ status: "NO_TRADE", output: noPrice.output })).toBe("unavailable");
  });

  it("never suggests refreshing when the source can't supply the missing evidence", () => {
    const o = stored(i => { for (const c of i.contracts!) c.quote_timestamp = null; }).output!;
    const e = explain(o, true);
    expect(e.title).toBe("Quote time unavailable");
    expect(e.next.kind).toBe("supply");
    expect(e.refreshBlockedReason).toMatch(/never provides quote times/);
  });

  it("distinguishes unknown event coverage from no events", () => {
    const o = stored(i => { i.expiries![0].event_coverage = { status: "UNKNOWN", covered_through: null, events: [] }; }).output!;
    expect(explain(o, true).title).toBe("Event coverage unavailable");
    expect(gapCopy("Event calendar coverage unknown through 2026-11-06")).toMatch(/not the same as having no events/);
  });

  it("gives short reasons for list rows", () => {
    expect(shortReason({ status: "PAPER_CANDIDATE", output: null, note: null })).toBe("All checks passed");
    const closed = stored(i => { i.session = { status: "CLOSED", calendar: "NYSE", early_close: false, detail: "Weekend" }; });
    expect(shortReason({ status: "NO_TRADE", output: closed.output, note: null })).toBe("Market closed");
  });
});

describe("format", () => {
  it("renders unknown values as Unavailable, never zero", () => {
    expect(fmtNum(null)).toBe("Unavailable");
    expect(fmtLevel(undefined)).toBe("Unavailable");
    expect(fmtSignedPct(null)).toBe("Unavailable");
    expect(fmtEt(null)).toBe("Unavailable");
    expect(fmtLevel(0)).toBe("0");
  });
  it("shows Eastern time", () => {
    expect(fmtEt("2026-10-08T19:59:00Z", new Date("2026-10-08T20:00:00Z"))).toBe("15:59 ET");
    expect(fmtEt("2026-10-07T19:59:00Z", new Date("2026-10-08T20:00:00Z"))).toBe("Oct 7, 15:59 ET");
  });
});

describe("range diagram layout", () => {
  const marks: Mark[] = [
    { kind: "price", value: 100, label: "Price 100" },
    { kind: "target", value: 108, label: "Target 108" },
    { kind: "invalidation", value: 95, label: "Invalid below 95" },
    { kind: "long_strike", value: 100, label: "Bought call 100" },
    { kind: "short_strike", value: 110, label: "Sold call 110" },
  ];

  it("places marks on a true linear scale", () => {
    const { placed, domain } = layoutMarks(marks, 600);
    expect(domain).toEqual(domainFor(marks.map(m => m.value)));
    const x = (k: string) => placed.find(p => p.label.startsWith(k))!.x;
    // 100→108 is 8 units, 100→110 is 10 units: distances keep that ratio.
    expect((x("Target") - x("Price")) / (x("Sold") - x("Bought"))).toBeCloseTo(0.8, 5);
    expect(x("Invalid")).toBeLessThan(x("Price"));
  });

  it("stacks labels instead of overlapping them", () => {
    const { placed } = layoutMarks(marks, 220);
    const above = placed.filter(p => p.side === "above");
    for (const a of above) for (const b of above) {
      if (a === b || a.row !== b.row) continue;
      const overlap = a.left < b.left + b.label.length * 7 + 10 && b.left < a.left + a.label.length * 7 + 10;
      expect(overlap).toBe(false);
    }
    expect(placed.every(p => p.left >= 0 && p.left + p.label.length * 7 + 10 <= 220 + 1e-9)).toBe(true);
  });

  it("has a low-to-high text alternative", () => {
    expect(textAlternative(marks)).toBe("Invalid below 95 · Price 100 · Bought call 100 · Target 108 · Sold call 110");
  });
});

describe("research detail", () => {
  it("includes legs and pricing only for a current validated candidate", () => {
    const r = toResearch(stored(), new Date("2026-10-08T15:01:00Z"));
    expect(r.display.status).toBe("PAPER_CANDIDATE");
    expect(r.legs?.map(l => [l.action, l.strike])).toEqual([["BUY", 100], ["SELL", 110]]);
    expect(r.display.pricing?.max_loss).toBe(230);
  });
  it("keeps an expired candidate as a historical observation without pricing", () => {
    const r = toResearch(stored(), new Date("2026-10-08T15:45:00Z"));
    expect(r.display.status).toBe("STALE_CANDIDATE");
    expect(r.historical?.proposed_structure).not.toBeNull();
    expect(r.display.pricing).toBeNull();
    expect(r.legs).toHaveLength(2);
  });
});

describe("user-supplied data", () => {
  const now = new Date("2026-10-08T15:00:00Z");

  it("accepts the fictional example and builds a server-owned input", () => {
    const parsed = parseUserData(JSON.parse(fictionalExample(now)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const input = buildUserInput(parsed.data, now.toISOString());
    expect(input.paper_trading_only).toBe(true);
    expect(input.session.status).toBe("OPEN");
    expect(input.sources[0].note).toMatch(/not independently verified/);
    const out = analyzeDeterministic(input);
    expect(reviewAnalysis(input, out).status).not.toBe("REJECTED");
  });

  it("returns field-level issues and rejects fields that would override server rules", () => {
    const bad = JSON.parse(fictionalExample(now));
    bad.contracts[0].ask = 0.1;               // below bid
    bad.underlying.price = -1;
    bad.paper_trading_only = false;           // not an accepted field
    const r = parseUserData(bad);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const paths = r.issues.map(i => i.path);
    expect(paths).toContain("underlying.price");
    expect(paths).toContain("contracts.0.ask");
    expect(r.issues.some(i => /paper_trading_only|Unrecognized/i.test(i.message + i.path))).toBe(true);
  });

  it("flags times in the future", () => {
    const d = JSON.parse(fictionalExample(now));
    d.underlying.price_time = "2026-10-08T16:00:00Z";
    const parsed = parseUserData(d);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(futureTimeIssues(parsed.data, now.toISOString()).map(i => i.path)).toContain("underlying.price_time");
  });
});
