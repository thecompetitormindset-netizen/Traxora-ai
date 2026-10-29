import { describe, expect, it } from "vitest";
import { MAX_PAGED_ROWS, PAGE_SIZE, allRows } from "../pagedSelect";

// PostgREST caps a response at a fixed number of rows whatever limit is asked
// for, and says nothing about having done it. These check the one thing that
// makes paging correct rather than approximately correct: what counts as the
// end of a result set.

/**
 * A fake server holding `total` rows and refusing to return more than `cap` of
 * them at a time — which is the behaviour the real one has and does not report.
 */
function server(total: number, cap = PAGE_SIZE) {
  const requests: Array<[number, number]> = [];
  const page = (from: number, to: number) => {
    requests.push([from, to]);
    const rows: number[] = [];
    for (let i = from; i <= Math.min(to, total - 1) && rows.length < cap; i++) rows.push(i);
    return Promise.resolve({ data: rows, error: null });
  };
  return { page, requests };
}

describe("allRows", () => {
  it("returns every row when the result spans several pages", async () => {
    const { page } = server(7_200);
    const rows = await allRows(page);

    expect(rows).toHaveLength(7_200);
    // In order and without gaps — the whole point of paging by offset.
    expect(rows[0]).toBe(0);
    expect(rows[7_199]).toBe(7_199);
  });

  it("ends on an empty page, not a short one", async () => {
    // This is the distinction the whole file exists for. A short page is NOT
    // proof of the end: if the server's cap is below the page size, the first
    // response is already short, and treating short as final reproduces exactly
    // the silent truncation being fixed.
    const { page } = server(2_500, 300);
    expect(await allRows(page)).toHaveLength(2_500);
  });

  it("costs one extra request to prove the end", async () => {
    // A result that divides evenly into pages cannot be distinguished from one
    // that does not without asking once more. That request is the price of
    // being sure, and it is worth paying.
    const { page, requests } = server(2_000);
    await allRows(page);

    expect(requests).toEqual([[0, 999], [1_000, 1_999], [2_000, 2_999]]);
  });

  it("advances by the rows it actually received, not by the page size", async () => {
    // Advancing by PAGE_SIZE when the server returned fewer would skip
    // everything in between, which is a quieter bug than returning too little.
    const { page, requests } = server(500, 200);
    const rows = await allRows(page);

    expect(rows).toEqual(Array.from({ length: 500 }, (_, i) => i));
    expect(requests.map(r => r[0])).toEqual([0, 200, 400, 500]);
  });

  it("handles an empty result in one request", async () => {
    const { page, requests } = server(0);
    expect(await allRows(page)).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it("treats a null data field as the end rather than looping", async () => {
    let calls = 0;
    const rows = await allRows<number>(() => {
      calls++;
      return Promise.resolve({ data: null, error: null });
    });

    expect(rows).toEqual([]);
    expect(calls).toBe(1);
  });

  it("surfaces an error instead of returning a partial answer", async () => {
    // Returning what it had so far would be the original bug wearing a
    // different hat: a partial result that the caller cannot tell is partial.
    let call = 0;
    await expect(
      allRows<number>((from, to) => {
        call++;
        if (call === 1) return Promise.resolve({ data: [from, to], error: null });
        return Promise.resolve({ data: null, error: { message: "statement timeout" } });
      }),
    ).rejects.toThrow("statement timeout");
  });

  it("refuses to page without end", async () => {
    // A server that always answers with a full page — a filter matching the
    // whole table, say — would otherwise hold the invocation until it was
    // killed, with nothing reported. The message names the likely cause.
    const page = (from: number, to: number) =>
      Promise.resolve({ data: Array.from({ length: to - from + 1 }, (_, i) => from + i), error: null });

    await expect(allRows(page)).rejects.toThrow(/refusing to page past/);
  });

  it("allows a result right up to the ceiling", async () => {
    // The guard is for runaway loops, not for large-but-legitimate reads, so it
    // must not fire one row early.
    const { page } = server(MAX_PAGED_ROWS);
    expect(await allRows(page)).toHaveLength(MAX_PAGED_ROWS);
  });
});
