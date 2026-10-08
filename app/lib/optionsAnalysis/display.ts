// Read-time gate between a stored analysis and the screen. An approved
// candidate is only shown as actionable if, at display time, the session is
// still open and the underlying and every selected leg are still within their
// freshness limits — v4.1 forbids presenting a cached candidate as current
// without refreshed checks. A rejected output is never shown at all.

import type { AnalysisInput, AnalysisOutput } from "./schema";
import type { CandidatePricing } from "./pricing";
import type { Review } from "./validate";
import { findContract, legFreshness } from "./strategies";
import { nyseSessionStatus } from "../marketTime";

export type StoredAnalysis = {
  symbol: string;
  as_of: string;
  input: AnalysisInput;
  output: AnalysisOutput | null;
  review_status: Review["status"];
  review_errors: string[];
  pricing: CandidatePricing | null;
};

export type DisplayAnalysis = {
  symbol: string;
  as_of: string;
  price: number | null;
  // PAPER_CANDIDATE: approved and still current — paper trading only.
  // STALE_CANDIDATE: was approved, no longer current; legs/pricing withheld.
  // UNAVAILABLE: output failed review; nothing from it is shown.
  status: "PAPER_CANDIDATE" | "STALE_CANDIDATE" | "NO_TRADE" | "UNAVAILABLE";
  output: AnalysisOutput | null;
  pricing: CandidatePricing | null;
  note: string | null;
};

export function currentProblem(row: StoredAnalysis, now: Date): string | null {
  const { input, output } = row;
  const rules = input.rules;
  if (!output?.proposed_structure || !rules) return "Candidate is incomplete";
  if (nyseSessionStatus(now).status !== "OPEN") return "Market session is no longer open";
  const nowIso = now.toISOString();
  const ts = input.underlying.price_timestamp;
  if (!ts || (now.getTime() - Date.parse(ts)) / 1000 > rules.freshness.max_underlying_age_seconds) {
    return "Underlying price is no longer fresh";
  }
  for (const leg of output.proposed_structure.legs) {
    const c = findContract(input, leg);
    if (!c || legFreshness(c, nowIso, rules).status !== "FRESH") return `Quote for ${leg.contract_id} is no longer fresh`;
  }
  return null;
}

export function toDisplay(row: StoredAnalysis, now: Date = new Date()): DisplayAnalysis {
  const base = { symbol: row.symbol, as_of: row.as_of, price: row.input.underlying.price };
  switch (row.review_status) {
    case "REJECTED":
      return { ...base, status: "UNAVAILABLE", output: null, pricing: null, note: "Analysis failed application checks and is not shown." };
    case "NO_TRADE":
      return { ...base, status: "NO_TRADE", output: row.output, pricing: null, note: null };
    case "APPROVED_CANDIDATE": {
      const problem = currentProblem(row, now);
      return problem
        ? { ...base, status: "STALE_CANDIDATE", output: null, pricing: null, note: `${problem} — needs a fresh run before it can be shown.` }
        : { ...base, status: "PAPER_CANDIDATE", output: row.output, pricing: row.pricing, note: null };
    }
  }
}
