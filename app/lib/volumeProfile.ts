export type VolumeNode = { price: number; volume: number; type: "HVN" | "LVN" | "normal" };

export type VolumeProfile = {
  poc:         number;
  vah:         number;
  val:         number;
  nodes:       VolumeNode[];
  totalVolume: number;
  sessionHigh: number;
  sessionLow:  number;
};

async function fetchIntradayBars(symbol: string): Promise<{ high: number; low: number; close: number; volume: number }[]> {
  const raw = symbol.replace(/\.(US|COMM)$/, "");
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(raw)}?interval=1h&range=60d`;
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error("Yahoo fetch failed");

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const q = result?.indicators?.quote?.[0];
  const timestamps: number[] = result?.timestamp ?? [];

  return timestamps
    .map((_: number, i: number) => ({
      high:   q.high?.[i]   ?? null,
      low:    q.low?.[i]    ?? null,
      close:  q.close?.[i]  ?? null,
      volume: q.volume?.[i] ?? 0,
    }))
    .filter(b => b.high != null && b.low != null && b.close != null && b.volume > 0) as { high: number; low: number; close: number; volume: number }[];
}

function buildProfile(bars: { high: number; low: number; close: number; volume: number }[]): VolumeProfile {
  const sessionHigh = Math.max(...bars.map(b => b.high));
  const sessionLow  = Math.min(...bars.map(b => b.low));
  const range       = sessionHigh - sessionLow;
  const BUCKETS     = 40;
  const bucketSize  = range / BUCKETS;

  const buckets: number[] = new Array(BUCKETS).fill(0);
  for (const bar of bars) {
    const typical = (bar.high + bar.low + bar.close) / 3;
    const idx = Math.min(Math.floor((typical - sessionLow) / bucketSize), BUCKETS - 1);
    buckets[idx] += bar.volume;
  }

  const pocIdx = buckets.indexOf(Math.max(...buckets));
  const poc    = sessionLow + (pocIdx + 0.5) * bucketSize;

  const totalVolume = buckets.reduce((s, v) => s + v, 0);
  const target      = totalVolume * 0.70;
  let accumulated   = buckets[pocIdx];
  let lo = pocIdx, hi = pocIdx;

  while (accumulated < target && (lo > 0 || hi < BUCKETS - 1)) {
    const addLo = lo > 0 ? buckets[lo - 1] : 0;
    const addHi = hi < BUCKETS - 1 ? buckets[hi + 1] : 0;
    if (addHi >= addLo && hi < BUCKETS - 1) { hi++; accumulated += buckets[hi]; }
    else if (lo > 0)                         { lo--; accumulated += buckets[lo]; }
    else                                     { hi++; accumulated += buckets[hi]; }
  }

  const vah = sessionLow + (hi + 1) * bucketSize;
  const val = sessionLow + lo * bucketSize;

  const avgVol = totalVolume / BUCKETS;
  const nodes: VolumeNode[] = buckets.map((vol, i) => ({
    price:  parseFloat((sessionLow + (i + 0.5) * bucketSize).toFixed(2)),
    volume: Math.round(vol),
    type:   vol >= avgVol * 1.8 ? "HVN" : vol <= avgVol * 0.3 ? "LVN" : "normal",
  }));

  return {
    poc:         parseFloat(poc.toFixed(2)),
    vah:         parseFloat(vah.toFixed(2)),
    val:         parseFloat(val.toFixed(2)),
    nodes,
    totalVolume: Math.round(totalVolume),
    sessionHigh: parseFloat(sessionHigh.toFixed(2)),
    sessionLow:  parseFloat(sessionLow.toFixed(2)),
  };
}

export async function getVolumeProfile(symbol: string): Promise<VolumeProfile | null> {
  try {
    const bars = await fetchIntradayBars(symbol);
    if (bars.length < 5) return null;
    return buildProfile(bars);
  } catch { return null; }
}
