async function fetchYahoo(symbol: string) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=10d`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  const closes: number[] = result?.indicators?.quote?.[0]?.close ?? [];
  return { meta, closes };
}

function vixToScore(vix: number): number {
  // Lower VIX = more greed; higher VIX = more fear
  if (vix < 12) return 90;
  if (vix < 15) return 75;
  if (vix < 20) return 58;
  if (vix < 25) return 42;
  if (vix < 30) return 28;
  if (vix < 40) return 15;
  return 5;
}

function momentumBonus(closes: number[]): number {
  const valid = closes.filter(Boolean);
  if (valid.length < 2) return 0;
  const pct = ((valid[valid.length - 1] - valid[0]) / valid[0]) * 100;
  // 5-day momentum: cap adjustment at ±12 points
  return Math.max(-12, Math.min(12, pct * 2.5));
}

function scoreToLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Extreme Greed", color: "emerald" };
  if (score >= 60) return { label: "Greed",         color: "green" };
  if (score >= 40) return { label: "Neutral",        color: "amber" };
  if (score >= 20) return { label: "Fear",           color: "orange" };
  return           { label: "Extreme Fear",          color: "rose" };
}

export async function GET() {
  try {
    const [vixData, spyData] = await Promise.all([
      fetchYahoo("^VIX"),
      fetchYahoo("SPY"),
    ]);

    const vix = vixData.meta?.regularMarketPrice as number | undefined;
    const vixChange = vix != null && vixData.meta?.chartPreviousClose
      ? ((vix - vixData.meta.chartPreviousClose) / vixData.meta.chartPreviousClose) * 100
      : null;

    const spyPrice = spyData.meta?.regularMarketPrice as number | undefined;
    const spyPrevClose = spyData.meta?.chartPreviousClose as number | undefined;
    const spyChange = spyPrice && spyPrevClose
      ? ((spyPrice - spyPrevClose) / spyPrevClose) * 100
      : null;

    if (vix == null) {
      return Response.json({ error: "Could not fetch sentiment data" }, { status: 500 });
    }

    const base = vixToScore(vix);
    const bonus = momentumBonus(spyData.closes);
    const score = Math.round(Math.max(0, Math.min(100, base + bonus)));
    const { label, color } = scoreToLabel(score);

    return Response.json({
      score,
      label,
      color,
      vix: vix ? +vix.toFixed(2) : null,
      vixChange: vixChange ? +vixChange.toFixed(2) : null,
      spyPrice: spyPrice ? +spyPrice.toFixed(2) : null,
      spyChange: spyChange ? +spyChange.toFixed(2) : null,
    });
  } catch {
    return Response.json({ error: "Sentiment fetch failed" }, { status: 500 });
  }
}
