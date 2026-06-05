import { XMLParser } from "fast-xml-parser";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.replace(/\.(US|COMM)$/, "").trim();
  const query  = symbol ? `${symbol} stock` : "stock market";

  try {
    const res = await fetch(
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`,
      { cache: "no-store" },
    );

    if (!res.ok) return Response.json([]);

    const xml = await res.text();
    const parser = new XMLParser();
    const parsed = parser.parse(xml);
    const items = parsed?.rss?.channel?.item ?? [];

    const news = (Array.isArray(items) ? items : [items]).slice(0, 6).map((item: any) => ({
      title:   item.title,
      link:    item.link,
      pubDate: item.pubDate,
      source:  item.source?.["#text"] ?? "News",
    }));

    return Response.json(news);
  } catch {
    return Response.json([]);
  }
}
