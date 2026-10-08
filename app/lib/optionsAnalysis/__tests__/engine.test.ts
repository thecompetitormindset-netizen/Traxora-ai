import { describe, expect, it } from "vitest";
import { analyzeDeterministic } from "../engine";
import { reviewAnalysis } from "../validate";
import { AnalysisInput, AnalysisOutput, analysisOutputJsonSchema } from "../schema";
import { cleanBullishInput } from "./fixtures";

function run(input: AnalysisInput) {
  AnalysisInput.parse(input);
  const out = analyzeDeterministic(input);
  return { out, review: reviewAnalysis(input, out) };
}

describe("deterministic engine + validator", () => {
  it("approves a clean bullish debit spread and prices it server-side", () => {
    const { out, review } = run(cleanBullishInput());
    expect(out.trade_decision).toBe("TRADE");
    expect(out.proposed_structure?.strategy).toBe("BULL_CALL_SPREAD");
    expect(out.proposed_structure?.legs.map(l => [l.action, l.strike])).toEqual([["BUY", 100], ["SELL", 110]]);
    expect(out.proposed_structure?.time_rule).toEqual({ type: "REVIEW_AT_DTE", dte: 7, date: null });
    expect(out.key_levels.invalidation).toMatchObject({ lower_price: 95, upper_price: null });
    expect(out.confidence_band).toBe("HIGH"); // 6/7 — positioning not supplied
    expect(out.checklist.find(c => c.item === "POSITIONING")?.result).toBe("FAIL");
    expect(out.user_note).toContain("Paper trading only.");
    expect(review.status).toBe("APPROVED_CANDIDATE");
    if (review.status !== "APPROVED_CANDIDATE") return;
    // Natural fill: pay 3.10, receive 0.80 → 2.30 debit on a 10-wide spread.
    expect(review.pricing).toMatchObject({ net_type: "DEBIT", natural_net: 2.3, max_loss: 230, max_gain: 770, breakevens: [102.3] });
  });

  it("returns G2_FRESHNESS when legs have no bid/ask timestamp (CBOE snapshot case)", () => {
    const input = cleanBullishInput();
    for (const c of input.contracts!) c.quote_timestamp = null;
    const { out, review } = run(input);
    expect(out.trade_decision).toBe("NO_TRADE");
    expect(out.no_trade_reason?.code).toBe("G2_FRESHNESS");
    expect(out.checklist.find(c => c.item === "LEG_DATA")?.result).toBe("FAIL");
    expect(out.data_gaps.join(" ")).toContain("quote timestamps");
    expect(review.status).toBe("NO_TRADE");
  });

  it("rejects stale leg quotes", () => {
    const input = cleanBullishInput();
    for (const c of input.contracts!) c.quote_timestamp = "2026-10-08T14:00:00.000Z"; // 3600s > 1200s band
    expect(run(input).out.no_trade_reason?.code).toBe("G2_FRESHNESS");
  });

  it("returns G3_SESSION with observations only when the market is closed", () => {
    const input = cleanBullishInput();
    input.session = { status: "CLOSED", calendar: "NYSE", early_close: false, detail: "After regular session" };
    const { out, review } = run(input);
    expect(out.no_trade_reason?.code).toBe("G3_SESSION");
    expect(out.proposed_structure).toBeNull();
    expect(out.checklist.find(c => c.item === "LEG_DATA")?.reason).toBe("Not assessed: G3_SESSION");
    expect(review.status).toBe("NO_TRADE");
  });

  it("returns G4_EVENT when earnings fall before expiry", () => {
    const input = cleanBullishInput();
    input.expiries![0].event_coverage.events = [{ type: "EARNINGS", date: "2026-10-29", name: "XYZ earnings" }];
    expect(run(input).out.no_trade_reason?.code).toBe("G4_EVENT");
  });

  it("rejects an expiry whose event coverage is unknown (G1)", () => {
    const input = cleanBullishInput();
    input.expiries![0].event_coverage = { status: "UNKNOWN", covered_through: null, events: [] };
    expect(run(input).out.no_trade_reason?.code).toBe("G1_DATA");
  });

  it("returns CONFLICTING_SIGNALS when price structure disagrees", () => {
    const input = cleanBullishInput();
    input.signals[1].direction = "BEARISH";
    const { out } = run(input);
    expect(out.canonical_direction).toBe("NEUTRAL");
    expect(out.no_trade_reason?.code).toBe("CONFLICTING_SIGNALS");
  });

  it("returns WELLBEING for an all-in request", () => {
    const input = cleanBullishInput();
    input.user_context = { experience: "BEGINNER", request: "I want to go all in with my rent money" };
    const { out } = run(input);
    expect(out.no_trade_reason?.code).toBe("WELLBEING");
    expect(out.user_note).toMatch(/paper/i);
  });

  it("proposes an iron condor only on an evidenced range", () => {
    const input = cleanBullishInput();
    for (const s of input.signals) if (s.kind === "STRUCTURE") s.direction = "NEUTRAL";
    input.volatility.iv_rank = 70;
    const { out, review } = run(input);
    expect(out.trade_decision).toBe("TRADE");
    expect(out.proposed_structure?.strategy).toBe("IRON_CONDOR");
    expect(out.proposed_structure?.legs.map(l => l.strike)).toEqual([85, 90, 110, 115]);
    expect(review.status).toBe("APPROVED_CANDIDATE");
  });

  it("returns LOW_CHECKLIST when fewer than four items pass", () => {
    const input = cleanBullishInput();
    input.signals[2].direction = "NEUTRAL";        // STRUCTURE partial → FAIL
    input.volatility.iv_rank = null;               // VOLATILITY FAIL
    input.levels.resistance = null;                // TARGET FAIL (also G7)
    expect(run(input).out.trade_decision).toBe("NO_TRADE");
  });

  it("produces a JSON Schema for the output contract", () => {
    const schema = analysisOutputJsonSchema();
    expect(schema.additionalProperties).toBe(false);
  });
});

describe("validator fails closed on bad model output", () => {
  const approved = () => analyzeDeterministic(cleanBullishInput());

  it("rejects unknown keys (no repair)", () => {
    const bad = { ...approved(), probability: 62 };
    expect(reviewAnalysis(cleanBullishInput(), bad).status).toBe("REJECTED");
  });

  it("rejects a disabled paper restriction", () => {
    const bad: AnalysisOutput = { ...approved(), paper_trading_only: false };
    expect(reviewAnalysis(cleanBullishInput(), bad).status).toBe("REJECTED");
  });

  it("rejects an input that tries to disable paper trading", () => {
    const input = cleanBullishInput();
    input.paper_trading_only = false;
    const out = analyzeDeterministic(input);
    expect(reviewAnalysis(input, out).status).toBe("REJECTED");
  });

  it("rejects currency symbols and invented levels", () => {
    const o = approved();
    expect(reviewAnalysis(cleanBullishInput(), { ...o, thesis: "Target $110." }).status).toBe("REJECTED");
    const invented = structuredClone(o);
    invented.proposed_structure!.profit_plan.target_level = 111;
    expect(reviewAnalysis(cleanBullishInput(), invented).status).toBe("REJECTED");
  });

  it("rejects an inflated confidence band", () => {
    const input = cleanBullishInput();
    input.volatility.iv_rank = null; // 5 passes → MODERATE ceiling
    const out = analyzeDeterministic(input);
    expect(out.confidence_band).toBe("MODERATE");
    expect(reviewAnalysis(input, { ...out, confidence_band: "HIGH" }).status).toBe("REJECTED");
  });

  it("rejects a leg that is not in the supplied chain", () => {
    const o = structuredClone(approved());
    o.proposed_structure!.legs[1].contract_id = "XYZ261106C00111000";
    expect(reviewAnalysis(cleanBullishInput(), o).status).toBe("REJECTED");
  });

  it("rejects TRADE when legs are stale at review time even if the output looked fine", () => {
    const o = approved();
    const later = cleanBullishInput();
    for (const c of later.contracts!) c.quote_timestamp = null;
    expect(reviewAnalysis(later, o).status).toBe("REJECTED");
  });
});
