// Display formatting for Fieldnotes. Unknown values render as "Unavailable",
// never as zero. Market times are shown in US Eastern, the session's own clock.

export const UNAVAILABLE = "Unavailable";

/** Symbol of the fictional user-data example; any result for it is labeled fictional. */
export const EXAMPLE_SYMBOL = "EXMPL";

const etTime = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
const etDay = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
const etKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

/** "15:59 ET" today, "Oct 7, 15:59 ET" otherwise. */
export function fmtEt(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return UNAVAILABLE;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return UNAVAILABLE;
  const time = `${etTime.format(d)} ET`;
  return etKey.format(d) === etKey.format(now) ? time : `${etDay.format(d)}, ${time}`;
}

export function fmtAge(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const s = Math.round((now.getTime() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s)) return null;
  if (s < 0) return "in the future";
  if (s < 90) return `${s}s old`;
  if (s < 5400) return `${Math.round(s / 60)} min old`;
  if (s < 172800) return `${Math.round(s / 3600)} h old`;
  return `${Math.round(s / 86400)} days old`;
}

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return UNAVAILABLE;
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Strikes/levels: keep the precision the value was supplied with (up to 2 dp). */
export function fmtLevel(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return UNAVAILABLE;
  return Number.isInteger(n) ? n.toLocaleString("en-US") : fmtNum(n, 2);
}

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return UNAVAILABLE;
  return `$${fmtNum(n, 2)}`;
}

export function fmtSignedPct(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return UNAVAILABLE;
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}%`;
}

export function fmtDay(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function strategyName(s: string): string {
  const map: Record<string, string> = {
    LONG_CALL: "Long call", LONG_PUT: "Long put",
    BULL_CALL_SPREAD: "Bull call spread", BEAR_PUT_SPREAD: "Bear put spread",
    BULL_PUT_SPREAD: "Bull put spread", BEAR_CALL_SPREAD: "Bear call spread",
    IRON_CONDOR: "Iron condor",
  };
  return map[s] ?? s;
}

export function directionWord(d: "BULLISH" | "BEARISH" | "NEUTRAL"): string {
  return d === "BULLISH" ? "Bullish" : d === "BEARISH" ? "Bearish" : "Neutral";
}

export const CHECK_LABEL: Record<string, string> = {
  STRUCTURE: "Price structure", TARGET: "Target", VOLATILITY: "Volatility", LEG_DATA: "Leg data",
  POSITIONING: "Positioning", INVALIDATION: "Invalidation", EVENT_TIME: "Events & time",
};

export const SIGNAL_LABEL: Record<string, string> = {
  EMA_STACK: "EMA stack (20/50)", TREND_5D: "5-session trend", TREND_20D: "20-session trend",
  SMART_MONEY_SCORE: "Smart-money score", VOLUME_ACTIVITY: "Volume activity",
};

export function signalName(s: string): string {
  return SIGNAL_LABEL[s] ?? s.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());
}
