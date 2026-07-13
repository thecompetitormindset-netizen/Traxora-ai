import { scopedKey, getCurrentUser } from "./userState";
import type { GamePrediction } from "@/app/api/sports/predictions/route";
import type { CryptoMover } from "@/app/api/market/crypto-movers/route";
import type { IPOItem } from "@/app/api/ipo/route";

// Shared snapshot of the Sports / Crypto / IPO feeds, used by the dashboard
// Discover cards and the Topbar search palette so both hit the APIs once.

export type DiscoverData = {
  games: GamePrediction[];
  sportsConfigured: boolean;
  coins: CryptoMover[];
  ipos:  IPOItem[];
};

const CACHE_KEY = "traxora_discover_v1";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let inflight: Promise<DiscoverData> | null = null;

export async function loadDiscoverData(): Promise<DiscoverData> {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw) as { ts: number; data: DiscoverData };
      if (Date.now() - c.ts < CACHE_TTL) return c.data;
    }
  } catch { /* ignore */ }

  if (inflight) return inflight;
  inflight = (async () => {
    const [sports, crypto, ipo] = await Promise.all([
      fetch("/api/sports/predictions").then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/market/crypto-movers").then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/ipo").then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const data: DiscoverData = {
      games:            Array.isArray(sports?.games) ? sports.games : [],
      sportsConfigured: sports?.configured !== false,
      coins:            Array.isArray(crypto?.coins) ? crypto.coins : [],
      ipos:             Array.isArray(ipo?.upcoming) ? ipo.upcoming : [],
    };
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch { /* quota */ }
    inflight = null;
    return data;
  })();
  return inflight;
}

// ── Ranking helpers ───────────────────────────────────────────────────────────

export function topGames(games: GamePrediction[], n: number): GamePrediction[] {
  return [...games]
    .filter(g => g.predictedWinner && g.winnerConfidence !== null)
    .sort((a, b) => (b.winnerConfidence ?? 0) - (a.winnerConfidence ?? 0))
    .slice(0, n);
}

export function topCoins(coins: CryptoMover[], n: number): CryptoMover[] {
  return [...coins]
    .filter(c => c.price !== null)
    .sort((a, b) => {
      if (a.bigMove !== b.bigMove) return a.bigMove ? -1 : 1;
      return Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0);
    })
    .slice(0, n);
}

export function nextIpos(ipos: IPOItem[], n: number): IPOItem[] {
  return [...ipos]
    .filter(i => i.status !== "withdrawn")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, n);
}

// ── Fresh AI signals already cached on this device ────────────────────────────
// The watchlist writes per-symbol signal caches (sig_<symbol>_<cents>[__user]).
// Scanning them lets the search palette show live confidences with zero fetches.

export type LocalSignal = {
  symbol:     string;
  signal:     "BUY" | "SELL";
  confidence: "High" | "Medium" | "Low";
  ts:         number;
};

const SIGNAL_TTL = 30 * 60 * 1000; // matches signalCache TTL

export function scanLocalSignals(max = 6): LocalSignal[] {
  if (typeof window === "undefined") return [];
  const suffix = getCurrentUser() ? scopedKey("") : "";
  const seen = new Set<string>();
  const out: LocalSignal[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith("sig_")) continue;
    if (suffix ? !key.endsWith(suffix) : key.includes("__")) continue;
    const body = suffix ? key.slice(4, -suffix.length) : key.slice(4);
    const us   = body.lastIndexOf("_");
    if (us <= 0) continue;
    const symbol = body.slice(0, us);
    if (seen.has(symbol)) continue;
    try {
      const entry = JSON.parse(localStorage.getItem(key) ?? "null") as
        { signal: string; confidence: LocalSignal["confidence"]; ts: number } | null;
      if (!entry || (entry.signal !== "BUY" && entry.signal !== "SELL")) continue;
      if (Date.now() - entry.ts > SIGNAL_TTL) continue;
      seen.add(symbol);
      out.push({ symbol, signal: entry.signal, confidence: entry.confidence, ts: entry.ts });
    } catch { /* ignore */ }
  }
  const rank: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  return out
    .sort((a, b) => (rank[a.confidence] ?? 3) - (rank[b.confidence] ?? 3) || b.ts - a.ts)
    .slice(0, max);
}
