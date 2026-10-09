export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Company profile for /company/[symbol]: name, sector, industry, website and
// a short description, from Nasdaq's public company profile (no API key).
// The previous source (EODHD fundamentals) isn't included in our plan.

export type CompanyProfile = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  website: string;
  description: string;
  region: string;
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const cache = new Map<string, { at: number; data: CompanyProfile }>();

export async function GET(req: Request) {
  const raw = (new URL(req.url).searchParams.get("symbol") ?? "").trim().toUpperCase().replace(/\.(US|COMM)$/, "");
  if (!/^[A-Z][A-Z.\-]{0,9}$/.test(raw)) return Response.json({ error: "Enter a US stock ticker, like AAPL." }, { status: 400 });

  const hit = cache.get(raw);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return Response.json(hit.data);

  try {
    const r = await fetch(`https://api.nasdaq.com/api/company/${raw.toLowerCase()}/company-profile`, {
      cache: "no-store", signal: AbortSignal.timeout(9000),
      headers: { "User-Agent": UA, Accept: "application/json", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" },
    });
    if (!r.ok) return Response.json({ error: "Company details are unavailable right now." }, { status: 502 });
    const d = (await r.json() as { data?: Record<string, { value?: string | null }> | null }).data;
    const v = (k: string) => (d?.[k]?.value ?? "").trim();
    if (!d || !v("CompanyName")) return Response.json({ error: `We couldn't find ${raw}.` }, { status: 404 });
    const data: CompanyProfile = {
      symbol: raw,
      name: v("CompanyName"),
      sector: v("Sector"),
      industry: v("Industry"),
      website: v("CompanyUrl"),
      description: v("CompanyDescription"),
      region: v("Region"),
    };
    cache.set(raw, { at: Date.now(), data });
    return Response.json(data);
  } catch {
    return Response.json({ error: "Could not reach the data provider." }, { status: 502 });
  }
}
