export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim() || "";

  const apiKey = process.env.EODHD_API_KEY;

  if (!apiKey) {
    return Response.json({ error: "Missing EODHD_API_KEY" }, { status: 500 });
  }

  if (!query) {
    return Response.json([]);
  }

  try {
    const url =
      `https://eodhd.com/api/search/${encodeURIComponent(query)}` +
      `?api_token=${apiKey}` +
      `&fmt=json`;

    const res = await fetch(url, { cache: "no-store" });
    const rawText = await res.text();

    if (!res.ok) {
      return Response.json(
        {
          error: "EODHD request failed",
          status: res.status,
          raw: rawText.slice(0, 500),
        },
        { status: 500 },
      );
    }

    let data: unknown;

    try {
      data = JSON.parse(rawText);
    } catch {
      return Response.json(
        {
          error: "EODHD did not return JSON",
          raw: rawText.slice(0, 500),
        },
        { status: 500 },
      );
    }

    if (!Array.isArray(data)) {
      return Response.json(
        {
          error: "Unexpected response format",
          raw: data,
        },
        { status: 500 },
      );
    }

    const formatted = data.map((item: any) => ({
      code: item.Code ?? "",
      name: item.Name ?? "",
      exchange: item.Exchange ?? "",
      country: item.Country ?? "",
      currency: item.Currency ?? "",
      type: item.Type ?? "",
      symbol:
        item.Code && item.Exchange
          ? `${item.Code}.${item.Exchange}`
          : (item.Code ?? ""),
    }));

    return Response.json(formatted);
  } catch (error) {
    return Response.json(
      {
        error: "Search route crashed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
