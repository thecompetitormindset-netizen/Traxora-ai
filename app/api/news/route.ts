import { XMLParser } from "fast-xml-parser";

const TOPIC_QUERIES: Record<string, string> = {
  market:      "stock market investing",
  technology:  "technology stocks semiconductor",
  finance:     "financial markets banking earnings",
  energy:      "energy oil gas sector stocks",
  crypto:      "cryptocurrency bitcoin ethereum",
  healthcare:  "healthcare biotech pharma stocks",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.replace(/\.(US|COMM)$/, "").trim();
  const topic  = searchParams.get("topic")?.toLowerCase().trim();
  const limit  = Math.min(50, parseInt(searchParams.get("limit") ?? "12", 10));

  let query = "stock market";
  if (symbol) query = `${symbol} stock`;
  else if (topic && TOPIC_QUERIES[topic]) query = TOPIC_QUERIES[topic];

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const news = (Array.isArray(items) ? items : [items]).slice(0, limit).map((item: any) => ({
      title:   item.title   ?? "",
      link:    item.link    ?? "",
      pubDate: item.pubDate ?? "",
      source:  item.source?.["#text"] ?? "News",
    })).filter((n: { title: string }) => n.title);

    return Response.json(news);
  } catch {
    return Response.json([]);
  }
}
