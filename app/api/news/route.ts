import { XMLParser } from "fast-xml-parser";

export async function GET() {
  const res = await fetch(
    "https://news.google.com/rss/search?q=stock%20market&hl=en-US&gl=US&ceid=US:en",
    { cache: "no-store" },
  );

  if (!res.ok) {
    return Response.json({ error: "Failed to fetch news" }, { status: 500 });
  }

  const xml = await res.text();
  const parser = new XMLParser();
  const parsed = parser.parse(xml);

  const items = parsed?.rss?.channel?.item ?? [];

  const news = items.slice(0, 12).map((item: any) => ({
    title: item.title,
    link: item.link,
    pubDate: item.pubDate,
    source: item.source?.["#text"] ?? "News",
  }));

  return Response.json(news);
}
