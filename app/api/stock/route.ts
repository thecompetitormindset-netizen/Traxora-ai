export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "AAPL.US";
  const interval = searchParams.get("interval") || "d";

  const eodhdKey = process.env.EODHD_API_KEY;
  const alphaKey = process.env.ALPHA_VANTAGE_API_KEY;

  // 1) Try EODHD first
  if (eodhdKey) {
    try {
      const eodhdUrl =
        `https://eodhd.com/api/eod/${encodeURIComponent(symbol)}` +
        `?api_token=${eodhdKey}` +
        `&fmt=json` +
        `&period=${interval}` +
        `&order=a`;

      const res = await fetch(eodhdUrl, { cache: "no-store" });
      const raw = await res.text();

      if (res.ok) {
        const data = JSON.parse(raw);

        if (Array.isArray(data) && data.length > 0) {
          const cleaned = data
            .map((item: any) => ({
              time: item.date,
              value: item.close,
            }))
            .filter((point: any) => point.time && point.value != null);

          return Response.json({
            provider: "EODHD",
            points: cleaned,
          });
        }
      }
    } catch {
      // fall through to Alpha Vantage
    }
  }

  // 2) Fallback to Alpha Vantage
  if (!alphaKey) {
    return Response.json(
      { error: "No available chart provider keys configured" },
      { status: 500 },
    );
  }

  try {
    const alphaSymbol = symbol.replace(".US", "");
    const alphaUrl =
      `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY` +
      `&symbol=${encodeURIComponent(alphaSymbol)}` +
      `&outputsize=full` +
      `&apikey=${alphaKey}`;

    const res = await fetch(alphaUrl, { cache: "no-store" });
    const data = await res.json();

    const series = data?.["Time Series (Daily)"];
    if (!series) {
      return Response.json(
        { error: "Fallback chart provider returned no data", details: data },
        { status: 500 },
      );
    }

    const cleaned = Object.entries(series)
      .map(([date, values]: [string, any]) => ({
        time: date,
        value: Number(values["4. close"]),
      }))
      .filter((point) => point.value != null)
      .sort((a, b) => a.time.localeCompare(b.time));

    return Response.json({
      provider: "Alpha Vantage",
      points: cleaned,
    });
  } catch (error) {
    return Response.json(
      {
        error: "Both chart providers failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
