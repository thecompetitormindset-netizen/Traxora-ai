// Server-side pipeline shared by the options routes: fetch → build input →
// deterministic analysis → application review. No model calls.

import { fetchAVCalendar } from "@/app/api/market/earnings-calendar/route";
import { atmIvOf, buildAnalysisInput, fetchAnalysisSources, parseEarningsCsv, type EarningsCalendar } from "./payload";
import { analyzeDeterministic } from "./engine";
import { reviewAnalysis, type Review } from "./validate";
import type { AnalysisInput } from "./schema";
import type { StoredAnalysis } from "./display";

export async function loadEarnings(): Promise<EarningsCalendar> {
  try { return parseEarningsCsv(await fetchAVCalendar()); }
  catch (err) {
    console.error("[options-analysis] earnings calendar unavailable:", err instanceof Error ? err.message : err);
    return { fetchedOk: false };
  }
}

/** Engine + validator on an already-built input. Never throws. */
export function analyzeInput(input: AnalysisInput, symbol: string): StoredAnalysis {
  let output = null;
  let review: Review;
  try {
    output = analyzeDeterministic(input);
    review = reviewAnalysis(input, output);
  } catch (err) {
    review = { status: "REJECTED", errors: [`engine error: ${err instanceof Error ? err.message : String(err)}`] };
  }
  if (review.status === "REJECTED") console.error(`[options-analysis] ${symbol} rejected:`, review.errors.slice(0, 5));
  return {
    symbol, as_of: input.as_of ?? new Date().toISOString(), input, output,
    review_status: review.status,
    review_errors: review.status === "REJECTED" ? review.errors : [],
    pricing: review.status === "APPROVED_CANDIDATE" ? review.pricing : null,
  };
}

/** Fetch public data for one symbol and analyze it. Null if the input could not be built. */
export async function analyzeLiveSymbol(
  symbol: string, earnings: EarningsCalendar, ivHistory: number[],
): Promise<{ row: StoredAnalysis; atmIv: number | null } | null> {
  const { chainJson, barsJson } = await fetchAnalysisSources(symbol);
  // as_of is taken after the fetch so it is never earlier than the data.
  const asOf = new Date().toISOString();
  let input: AnalysisInput;
  try {
    input = buildAnalysisInput({ symbol, asOf, chainJson, barsJson, earnings, ivHistory });
  } catch (err) {
    console.error(`[options-analysis] ${symbol} input build failed:`, err instanceof Error ? err.message : err);
    return null;
  }
  return { row: analyzeInput(input, symbol), atmIv: atmIvOf(input.contracts, input.underlying.price) };
}

export const SYMBOL_PATTERN = /^[A-Z]{1,5}(\.[A-Z])?$/;
