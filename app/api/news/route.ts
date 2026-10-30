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

    // A feed that did not answer is not the same as a topic with no stories.
    // Both used to arrive as an empty array, leaving the page to report the
    // second when the first had happened.
    if (!res.ok) {
      return Response.json(
        { error: "source_unavailable", detail: `Google News returned HTTP ${res.status}` },
        { status: 503 },
      );
    }

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

    // An empty list here IS a real answer — a niche query genuinely may have no
    // stories — so unlike the company list this one is served as it stands.
    return Response.json(news);
  } catch (err) {
    return Response.json(
      { error: "source_unavailable", detail: err instanceof Error ? err.message.slice(0, 120) : "request failed" },
      { status: 503 },
    );
  }
}
