// Cached endpoint — one call returns prices for all 20 pool symbols.
// Upstream fetches use next: { revalidate: 60 } so a fresh batch is
// fetched at most once per minute regardless of visitor count.

export const dynamic = "force-dynamic"; // always run, rely on s-maxage for caching

const ITEMS = [
  // Mega-cap tech
  { key: "NVDA",  finnhub: "NVDA",  yahoo: "NVDA",  eodhd: "NVDA.US"  },
  { key: "AAPL",  finnhub: "AAPL",  yahoo: "AAPL",  eodhd: "AAPL.US"  },
  { key: "MSFT",  finnhub: "MSFT",  yahoo: "MSFT",  eodhd: "MSFT.US"  },
  { key: "META",  finnhub: "META",  yahoo: "META",  eodhd: "META.US"  },
  { key: "AMZN",  finnhub: "AMZN",  yahoo: "AMZN",  eodhd: "AMZN.US"  },
  { key: "GOOGL", finnhub: "GOOGL", yahoo: "GOOGL", eodhd: "GOOGL.US" },
  { key: "TSLA",  finnhub: "TSLA",  yahoo: "TSLA",  eodhd: "TSLA.US"  },
  { key: "AMD",   finnhub: "AMD",   yahoo: "AMD",   eodhd: "AMD.US"   },
  { key: "NFLX",  finnhub: "NFLX",  yahoo: "NFLX",  eodhd: "NFLX.US"  },
  // Financials
  { key: "JPM",   finnhub: "JPM",   yahoo: "JPM",   eodhd: "JPM.US"   },
  { key: "GS",    finnhub: "GS",    yahoo: "GS",    eodhd: "GS.US"    },
  { key: "V",     finnhub: "V",     yahoo: "V",     eodhd: "V.US"     },
  // ETFs
  { key: "SPY",   finnhub: "SPY",   yahoo: "SPY",   eodhd: "SPY.US"   },
  { key: "QQQ",   finnhub: "QQQ",   yahoo: "QQQ",   eodhd: "QQQ.US"   },
  // Energy / commodities
  { key: "XOM",   finnhub: "XOM",   yahoo: "XOM",   eodhd: "XOM.US"   },
  { key: "COIN",  finnhub: "COIN",  yahoo: "COIN",  eodhd: "COIN.US"  },
  // Futures
  { key: "ES",    finnhub: "ES1!",  yahoo: "ES=F",  eodhd: "ES.COMM"  },
  { key: "NQ",    finnhub: "NQ1!",  yahoo: "NQ=F",  eodhd: "NQ.COMM"  },
  { key: "GC",    finnhub: "GC1!",  yahoo: "GC=F",  eodhd: "GC.COMM"  },
  { key: "CL",    finnhub: "CL1!",  yahoo: "CL=F",  eodhd: "CL.COMM"  },
];

function fmtPrice(p: number): string {
  return p >= 1000
    ? `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : `$${p.toFixed(2)}`;
}

async function fetchOne(
  item: (typeof ITEMS)[number],
): Promise<{ price: number; previousClose: number } | null> {
  const finnhubKey = process.env.FINNHUB_API_KEY;

  if (finnhubKey) {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${item.finnhub}&token=${finnhubKey}`,
        { next: { revalidate: 60 } },
      );
      const d = await res.json() as { c?: number; pc?: number };
      if (res.ok && d.c && d.c > 0 && d.pc && d.pc > 0) {
        return { price: d.c, previousClose: d.pc };
      }
    } catch { /* fall through */ }
  }

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${item.yahoo}?interval=1m&range=1d`,
      { next: { revalidate: 60 }, headers: { "User-Agent": "Mozilla/5.0" } },
    );
    const d = await res.json();
    const meta = d?.chart?.result?.[0]?.meta;
    if (meta?.regularMarketPrice && (meta.previousClose ?? meta.chartPreviousClose)) {
      return {
        price:         meta.regularMarketPrice,
        previousClose: meta.previousClose ?? meta.chartPreviousClose,
      };
    }
  } catch { /* fall through */ }

  const eodhdKey = process.env.EODHD_API_KEY;
  if (eodhdKey) {
    try {
      const res = await fetch(
        `https://eodhd.com/api/real-time/${encodeURIComponent(item.eodhd)}?api_token=${eodhdKey}&fmt=json`,
        { next: { revalidate: 60 } },
      );
      const d = await res.json() as { close?: number; previousClose?: number };
      if (res.ok && d.close && d.previousClose) {
        return { price: d.close, previousClose: d.previousClose };
      }
    } catch { /* fall through */ }
  }

  return null;
}

export async function GET() {
  const results = await Promise.allSettled(ITEMS.map(fetchOne));

  const prices: Record<string, { price: string; chg: string; up: boolean }> = {};
  results.forEach((result, i) => {
    if (result.status !== "fulfilled" || !result.value) return;
    const { price, previousClose } = result.value;
    const chgPct = ((price - previousClose) / previousClose) * 100;
    prices[ITEMS[i].key] = {
      price: fmtPrice(price),
      chg:   `${chgPct >= 0 ? "+" : ""}${chgPct.toFixed(2)}%`,
      up:    chgPct >= 0,
    };
  });

  return Response.json(prices, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}
