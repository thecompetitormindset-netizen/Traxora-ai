// Two judgements the bars backfill makes, pulled out so they can be tested
// without a database, a provider and an auth session standing behind them.
//
// Both were wrong in production, in the same way: a narrow observation read as
// a broad conclusion. Keeping them here, named and pinned by tests, is cheaper
// than rediscovering either from a workflow log.

/** What a provider's refusal of one date actually tells us. */
export type RefusalMeaning = "this_date" | "possibly_the_plan";

/**
 * Polygon answers "your plan excludes this endpoint" and "your plan does not
 * include this date yet" with the same 403, so the response cannot distinguish
 * them. What can is whether this key has ever been served: every date already
 * in the table arrived through this endpoint.
 *
 * A run once wrote 49 dates, crossed midnight UTC — which puts the previous
 * session at the head of a newest-first queue before the free tier releases
 * it — took the 403 for that one date as proof the endpoint was unavailable,
 * and stopped with 80 dates still to fetch. With 49 successes on the same key
 * in the same run, "not on your plan" was the one explanation the evidence
 * ruled out.
 */
export function refusalMeans(evidence: {
  /** Dates already in the table, all of which came from this endpoint. */
  storedDates: number;
  /** Dates this run has fetched successfully before the refusal. */
  writtenThisRun: number;
}): RefusalMeaning {
  const everServed = evidence.storedDates > 0 || evidence.writtenThisRun > 0;
  return everServed ? "this_date" : "possibly_the_plan";
}

/**
 * How much work is actually left.
 *
 * A date the provider will not serve is not work remaining — no number of
 * further runs will get it — so counting it keeps a finished backfill
 * reporting itself unfinished forever, and the operator re-running for nothing.
 * It is reported separately instead of being dropped, because a missing date
 * nobody can see is how this job misled everyone for twenty-nine runs.
 */
export function datesRemaining(o: {
  /** Dates in the lookback window not present in the table. */
  missing: number;
  /** Dates fetched and written this run. */
  written: number;
  /** Dates the provider refused this run. */
  unavailable: number;
}): number {
  return Math.max(0, o.missing - o.written - o.unavailable);
}
