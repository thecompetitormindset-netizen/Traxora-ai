import { scopedKey } from "./userState";

const TTL_MS = 30 * 60 * 1000; // 30 minutes

type CachedSignal = {
  signal:     "BUY" | "HOLD" | "SELL";
  confidence: "High" | "Medium" | "Low";
  trade:      unknown;
  ts:         number;
};

function cacheKey(symbol: string, price: number): string {
  const cents = Math.round(price * 100);
  return scopedKey(`sig_${symbol}_${cents}`);
}

export function getSignalCache(symbol: string, price: number): CachedSignal | null {
  try {
    const raw = localStorage.getItem(cacheKey(symbol, price));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedSignal;
    if (Date.now() - entry.ts > TTL_MS) {
      localStorage.removeItem(cacheKey(symbol, price));
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export function setSignalCache(symbol: string, price: number, data: Omit<CachedSignal, "ts">): void {
  try {
    const entry: CachedSignal = { ...data, ts: Date.now() };
    localStorage.setItem(cacheKey(symbol, price), JSON.stringify(entry));
  } catch { /* quota exceeded — ignore */ }
}
