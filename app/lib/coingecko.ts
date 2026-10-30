// Crypto prices from CoinGecko.
//
// Crypto was being quoted through the same path as stocks: Finnhub first, then
// Yahoo. Finnhub's free tier does not carry these pairs under the symbols the
// app uses, so every coin fell through to Yahoo — the source that rate-limits
// this deployment's shared address about two requests in three. The result was
// a wall of dashes on a page whose entire job is showing prices.
//
// CoinGecko needs no key, quotes every coin here in ONE request rather than one
// per symbol, and is not the source that caused this project's original
// outage. That makes it the right primary for crypto specifically; nothing
// about how stocks are quoted changes.
//
// What it does not give, on the free tier, is a year of daily OHLC. The deeper
// analysis — RSI, Bollinger width, the signal and its backtest — still needs
// that, and still comes from Yahoo. When Yahoo will not answer, those fields
// are absent and say so, while the price and the day's move remain correct.

/** The app's Yahoo-style symbols, mapped to CoinGecko's own ids. */
const IDS: Record<string, string> = {
  "BTC-USD": "bitcoin",
  "ETH-USD": "ethereum",
  "SOL-USD": "solana",
  "BNB-USD": "binancecoin",
  "XRP-USD": "ripple",
  "ADA-USD": "cardano",
  "AVAX-USD": "avalanche-2",
  "DOGE-USD": "dogecoin",
  "LINK-USD": "chainlink",
  "DOT-USD": "polkadot",
  "TRX-USD": "tron",
  "UNI7083-USD": "uniswap",
};

export type CoinQuote = {
  symbol: string;
  price: number | null;
  /** Move over the last 24 hours, in percent. */
  changePct: number | null;
  /** Recent closes for the mini chart, oldest first. */
  sparkline: number[];
  volume: number | null;
};

/** Whether this symbol is one CoinGecko can answer for. */
export function isCoinGeckoSymbol(symbol: string): boolean {
  return symbol.toUpperCase() in IDS;
}

export function coinGeckoId(symbol: string): string | null {
  return IDS[symbol.toUpperCase()] ?? null;
}

/** Every symbol CoinGecko is used for, which is the crypto universe the app shows. */
export function coinGeckoSymbols(): string[] {
  return Object.keys(IDS);
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Read the /coins/markets response.
 *
 * Pure and separate from the request on purpose: the parser is the part that
 * breaks when a provider reshapes its payload, and it is the part that can be
 * tested without reaching the network.
 *
 * Returns null — not an empty map — for a body that is not the expected shape.
 * An empty map would say "CoinGecko knows of no coins", which is a claim about
 * the market; null says we did not get an answer we understood.
 */
export function parseMarkets(body: unknown): Map<string, CoinQuote> | null {
  if (!Array.isArray(body)) return null;

  const byId = new Map<string, string>();
  for (const [symbol, id] of Object.entries(IDS)) byId.set(id, symbol);

  const out = new Map<string, CoinQuote>();
  for (const row of body) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const symbol = byId.get(String(r.id));
    if (!symbol) continue;

    const spark = r.sparkline_in_7d;
    const prices = typeof spark === "object" && spark !== null
      ? (spark as { price?: unknown }).price
      : null;

    out.set(symbol, {
      symbol,
      price: num(r.current_price),
      changePct: num(r.price_change_percentage_24h),
      sparkline: Array.isArray(prices)
        ? prices.filter((p): p is number => typeof p === "number" && Number.isFinite(p)).slice(-30)
        : [],
      volume: num(r.total_volume),
    });
  }

  // A well-formed array that mentions none of our coins is still not an answer
  // about them.
  return out.size > 0 ? out : null;
}

export type CoinGeckoOutcome =
  | { ok: true; quotes: Map<string, CoinQuote> }
  | { ok: false; reason: "rate_limited" | "unavailable" | "unexpected_shape" };

/**
 * Quote every requested coin in one request.
 *
 * CoinGecko's free tier is a per-minute budget, so one batched call for the
 * whole board costs the same as one coin and leaves room for the page to be
 * opened repeatedly.
 */
export async function coinGeckoMarkets(
  symbols: string[] = coinGeckoSymbols(),
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<CoinGeckoOutcome> {
  const { timeoutMs = 10_000, fetchImpl = fetch } = opts;

  const ids = symbols.map(coinGeckoId).filter((id): id is string => id !== null);
  if (ids.length === 0) return { ok: false, reason: "unavailable" };

  const url =
    "https://api.coingecko.com/api/v3/coins/markets" +
    // Each id escaped, the separators left as literal commas — which is the
    // form the API documents, and readable in a log.
    `?vs_currency=usd&ids=${[...new Set(ids)].map(encodeURIComponent).join(",")}` +
    "&sparkline=true&price_change_percentage=24h&per_page=250&page=1";

  try {
    const res = await fetchImpl(url, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });

    // 429 is the one worth naming: it clears on its own, and telling someone to
    // wait a minute is different from telling them something is broken.
    if (res.status === 429) return { ok: false, reason: "rate_limited" };
    if (!res.ok) return { ok: false, reason: "unavailable" };

    const quotes = parseMarkets(await res.json().catch(() => null));
    return quotes ? { ok: true, quotes } : { ok: false, reason: "unexpected_shape" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
