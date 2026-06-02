import { load } from "cheerio";

export async function GET() {
  try {
    const res = await fetch(
      "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
      { cache: "no-store" },
    );

    if (!res.ok) return Response.json([], { status: 200 });

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

    return Response.json(companies);
  } catch {
    return Response.json([]);
  }
}
