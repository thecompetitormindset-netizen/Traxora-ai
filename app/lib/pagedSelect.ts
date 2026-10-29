// Reading a whole result set over Supabase's REST interface.
//
// PostgREST will not return more than a fixed number of rows in one response,
// whatever `limit` the query asks for, and it does not report that it stopped.
// The request succeeds, fewer rows come back, and the caller treats the first
// page as the whole answer.
//
// That is not a theoretical hazard here. The bars sync worked out which trading
// dates it already held by selecting every row and collecting the distinct
// dates — and daily_bars holds roughly 4,100 rows per date, so it saw part of a
// single day, concluded it held almost nothing, and re-fetched dates it already
// had. It reported the backfill getting FURTHER from done on every run.
// Twenty-nine manual runs produced no progress and no error.
//
// So any read that can match more rows than a page goes through here.

/**
 * Rows asked for per request.
 *
 * Asked for, not assumed: the server's own cap may be lower, and the loop below
 * is written so that it does not matter what it is.
 */
export const PAGE_SIZE = 1_000;

/**
 * A ceiling on paging, so a loop cannot run away.
 *
 * Roughly 4,100 symbols a day over a 400-day window is about 1.6 million rows
 * in daily_bars. Nothing should ever legitimately page through a tenth of that,
 * so crossing this means the caller's filter is wrong rather than the result
 * being genuinely large — and a request that pages without end would hold a
 * serverless invocation until it was killed, reporting nothing.
 */
export const MAX_PAGED_ROWS = 150_000;

export type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Every row a query matches, not just the first page.
 *
 * The offset advances by the number of rows ACTUALLY returned, and only an
 * empty page ends the loop. Stopping on a short page would look equivalent and
 * is not: if the server's cap is below PAGE_SIZE then the very first response
 * is short, and a short-page check reads that as "that is all of them" — the
 * same silent truncation, one level further in. An empty page is the only
 * answer that means the end whatever the cap turns out to be, at the cost of
 * one extra request per query.
 *
 * The caller must give the query a TOTAL order. Offset paging over a partial
 * order drops and duplicates rows, because the server is free to return a
 * different arrangement of the tied rows for each page.
 */
export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const out: T[] = [];

  for (;;) {
    const { data, error } = await page(out.length, out.length + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    if (rows.length === 0) return out;

    for (const row of rows) out.push(row);

    if (out.length > MAX_PAGED_ROWS) {
      throw new Error(
        `refusing to page past ${MAX_PAGED_ROWS} rows — a result this large means the query is too broad to be intentional`,
      );
    }
  }
}
