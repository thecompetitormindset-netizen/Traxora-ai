export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol") || "AAPL.US";

  const apiKey = process.env.EODHD_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Missing EODHD_API_KEY" }, { status: 500 });
  }

  const url =
    `https://eodhd.com/api/fundamentals/${encodeURIComponent(symbol)}` +
    `?api_token=${apiKey}&fmt=json`;

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    return Response.json(
      { error: "Failed to fetch company details" },
      { status: 500 },
    );
  }

  const data = await res.json();

  return Response.json({
    symbol,
    name: data?.General?.Name ?? symbol,
    code: data?.General?.Code ?? "",
    exchange: data?.General?.Exchange ?? "",
    currency: data?.General?.CurrencyCode ?? "",
    country: data?.General?.CountryName ?? "",
    sector: data?.General?.Sector ?? "",
    industry: data?.General?.Industry ?? "",
    ipoDate: data?.General?.IPODate ?? "",
    website: data?.General?.WebURL ?? "",
    phone: data?.General?.Phone ?? "",
    address: data?.General?.Address ?? "",
    description: data?.General?.Description ?? "",
    logo: data?.General?.LogoURL ?? "",
    employees: data?.General?.FullTimeEmployees ?? "",
  });
}
