import { scopedKey } from "./userState";

export type Direction   = "LONG" | "SHORT";
export type TradeStatus = "OPEN" | "CLOSED";
export type ExitReason  = "manual" | "stop_hit" | "target_hit";

export type PaperTrade = {
  id:         string;
  symbol:     string;
  direction:  Direction;
  entryPrice: number;
  shares:     number;
  stopLoss:   number | null;
  takeProfit: number | null;
  entryDate:  string;
  notes:      string;
  status:     TradeStatus;
  exitPrice:  number | null;
  exitDate:   string | null;
  exitReason: ExitReason | null;
};

export type AddTradeInitial = { symbol?: string; direction?: Direction; entryPrice?: string };

export const STORAGE_KEY    = "paper_portfolio_v2";
export const STARTING_CAPITAL = 10_000;

export function loadTrades(): PaperTrade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveTrades(trades: PaperTrade[]) {
  localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(trades));
}

export function calcPL(trade: PaperTrade, currentPrice: number): number {
  const diff = trade.direction === "LONG"
    ? currentPrice - trade.entryPrice
    : trade.entryPrice - currentPrice;
  return diff * trade.shares;
}

export function calcPLPct(trade: PaperTrade, currentPrice: number): number {
  const diff = trade.direction === "LONG"
    ? (currentPrice - trade.entryPrice) / trade.entryPrice
    : (trade.entryPrice - currentPrice) / trade.entryPrice;
  return diff * 100;
}

export function fmtMoney(n: number, sign = true): string {
  const abs = Math.abs(n).toFixed(2);
  if (!sign) return `$${abs}`;
  return `${n >= 0 ? "+" : "-"}$${abs}`;
}

export function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function plColor(n: number) {
  return n > 0 ? "text-emerald-400" : n < 0 ? "text-rose-400" : "text-[#7B8DB4]";
}

export function daysBetween(a: string, b: string) {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}
