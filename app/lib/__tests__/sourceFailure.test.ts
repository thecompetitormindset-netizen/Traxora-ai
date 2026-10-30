import { afterEach, describe, expect, it, vi } from "vitest";

// Two routes used to answer an upstream failure with an empty array and a 200.
// The page then had nothing to go on and reported "no companies found" or
// "no news found for this topic" — an absence stated as a fact, when what had
// actually happened is that we could not find out.
//
// These check the distinction that fix depends on: a failure is a failure, and
// a genuinely empty result is still served as empty where empty is a real
// answer.

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

const stub = (impl: (url: string) => Promise<Response> | Response) => {
  globalThis.fetch = ((input: RequestInfo | URL) =>
    Promise.resolve(impl(String(input)))) as typeof fetch;
};

const SP500_ROW = `
<table id="constituents"><tbody>
  <tr><th>Symbol</th><th>Security</th><th>Sector</th></tr>
  <tr><td>AAPL</td><td>Apple Inc.</td><td>Information Technology</td></tr>
  <tr><td>MSFT</td><td>Microsoft</td><td>Information Technology</td></tr>
</tbody></table>`;

describe("/api/top-companies", () => {
  it("reports a source failure rather than serving an empty list", async () => {
    stub(() => new Response("nope", { status: 500 }));
    const { GET } = await import("../../api/top-companies/route");

    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("source_unavailable");
  });

  it("reports a broken scrape rather than claiming the index is empty", async () => {
    // The page loaded, but the table it expects is gone — markup moved. Zero
    // constituents is a parser failure, never a fact about the S&P 500.
    stub(() => new Response("<html><body>redesigned</body></html>", { status: 200 }));
    const { GET } = await import("../../api/top-companies/route");

    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("parse_failed");
  });

  it("serves the companies when the source answers", async () => {
    stub(() => new Response(SP500_ROW, { status: 200 }));
    const { GET } = await import("../../api/top-companies/route");

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ symbol: "AAPL", name: "Apple Inc." });
  });

  it("reports a thrown request rather than swallowing it", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("getaddrinfo ENOTFOUND"))) as typeof fetch;
    const { GET } = await import("../../api/top-companies/route");

    const res = await GET();
    expect(res.status).toBe(503);
  });
});

const rss = (titles: string[]) =>
  `<?xml version="1.0"?><rss><channel>${titles
    .map(t => `<item><title>${t}</title><link>https://example.test</link><pubDate>Thu, 29 Oct 2026 00:00:00 GMT</pubDate></item>`)
    .join("")}</channel></rss>`;

const req = (url = "http://localhost/api/news?topic=market&limit=24") => new Request(url);

describe("/api/news", () => {
  it("reports a source failure rather than serving an empty list", async () => {
    stub(() => new Response("nope", { status: 503 }));
    const { GET } = await import("../../api/news/route");

    const res = await GET(req());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("source_unavailable");
  });

  it("still serves an empty list when the feed genuinely has nothing", async () => {
    // Unlike the company list, this one has a legitimate empty: a niche query
    // may really have no stories. That is an answer, not a failure.
    stub(() => new Response(rss([]), { status: 200 }));
    const { GET } = await import("../../api/news/route");

    const res = await GET(req("http://localhost/api/news?symbol=ZZZZ"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("serves the stories when the feed answers", async () => {
    stub(() => new Response(rss(["Markets rise", "Markets fall"]), { status: 200 }));
    const { GET } = await import("../../api/news/route");

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].title).toBe("Markets rise");
  });

  it("reports a thrown request rather than swallowing it", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;
    const { GET } = await import("../../api/news/route");

    const res = await GET(req());
    expect(res.status).toBe(503);
  });
});
