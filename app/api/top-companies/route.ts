import { load } from "cheerio";

export async function GET() {
  try {
    const res = await fetch(
      "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
      { cache: "no-store" },
    );

    // An empty array with a 200 tells the caller there are no companies. What
    // actually happened is that we could not find out, and the caller has no
    // way to tell those apart — so the failure is reported as a failure.
    if (!res.ok) {
      return Response.json(
        { error: "source_unavailable", detail: `Wikipedia returned HTTP ${res.status}` },
        { status: 503 },
      );
    }

    const html = await res.text();
    const $ = load(html);

    const companies: Array<{ symbol: string; name: string; sector: string; eodhdSymbol: string }> = [];

    $("#constituents tbody tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length >= 3) {
        const rawSymbol = $(cells[0]).text().trim();
        const name      = $(cells[1]).text().trim();
        const sector    = $(cells[2]).text().trim();
        if (rawSymbol && name) {
          companies.push({ symbol: rawSymbol, name, sector, eodhdSymbol: `${rawSymbol}.US` });
        }
      }
    });

    // Zero rows from a page that loaded means the scrape broke — the table's
    // markup moved — not that the S&P 500 has no constituents. Serving that as
    // an empty list would turn a silent parser failure into a stated fact.
    if (companies.length === 0) {
      return Response.json(
        { error: "parse_failed", detail: "The constituents table was not found on the source page." },
        { status: 503 },
      );
    }

    return Response.json(companies);
  } catch (err) {
    return Response.json(
      { error: "source_unavailable", detail: err instanceof Error ? err.message.slice(0, 120) : "request failed" },
      { status: 503 },
    );
  }
}
