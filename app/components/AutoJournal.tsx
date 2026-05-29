"use client";

import { scopedKey } from "../lib/userState";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TradeAnalysis = {
  grade:    string;
  verdict:  string;
  concepts: string[];
  mistakes: string[];
  wins:     string[];
  lesson:   string;
};

export type JournalEntry = {
  id:           string;
  symbol:       string;
  side:         "BUY" | "SELL";
  quantity:     number;
  price:        number;
  entry:        string;
  concepts:     string[];
  timestamp:    string;
  entryPrice?:  number;
  pl?:          number;
  plPct?:       number;
  closeReason?: "manual" | "stop" | "tp";
  stopLoss?:    number;
  takeProfit?:  number;
  analysis?:    TradeAnalysis;
};

const JOURNAL_KEY_BASE = "traxora-journal";

// ── Storage helpers ───────────────────────────────────────────────────────────

export function getJournal(): JournalEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(scopedKey(JOURNAL_KEY_BASE)) ?? "[]"); }
  catch { return []; }
}

export function clearJournal(): void {
  localStorage.removeItem(scopedKey(JOURNAL_KEY_BASE));
  window.dispatchEvent(new Event("journal-updated"));
}

export function saveJournalEntry(e: JournalEntry) {
  const existing = getJournal();
  const key = `${e.symbol}|${e.side}|${e.timestamp}`;
  if (existing.some(j => `${j.symbol}|${j.side}|${j.timestamp}` === key)) return;
  existing.unshift(e);
  localStorage.setItem(scopedKey(JOURNAL_KEY_BASE), JSON.stringify(existing.slice(0, 300)));
  window.dispatchEvent(new Event("journal-updated"));
}

// ── Paper portfolio journal entry generator ───────────────────────────────────

type PaperCloseData = {
  id:          string;
  symbol:      string;
  direction:   "LONG" | "SHORT";
  entryPrice:  number;
  exitPrice:   number;
  shares:      number;
  stopLoss:    number | null;
  takeProfit:  number | null;
  exitDate:    string;
  exitReason:  "manual" | "stop_hit" | "target_hit";
};

export async function generateAndSavePaperEntry(trade: PaperCloseData): Promise<void> {
  const diff  = trade.direction === "LONG"
    ? trade.exitPrice - trade.entryPrice
    : trade.entryPrice - trade.exitPrice;
  const pl    = diff * trade.shares;
  const plPct = (diff / trade.entryPrice) * 100;
  const closeReason: JournalEntry["closeReason"] =
    trade.exitReason === "stop_hit"   ? "stop"   :
    trade.exitReason === "target_hit" ? "tp"     : "manual";

  let aiEntry    = "";
  let aiConcepts: string[] = [];
  let aiAnalysis: JournalEntry["analysis"] | undefined;

  try {
    const res  = await fetch("/api/ai/journal", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol:      trade.symbol,
        side:        "SELL",
        quantity:    trade.shares,
        price:       trade.exitPrice,
        entryPrice:  trade.entryPrice,
        pl,
        plPct,
        closeReason,
        stopLoss:    trade.stopLoss,
        takeProfit:  trade.takeProfit,
      }),
    });
    const data = await res.json();
    if (res.ok && data.entry) {
      aiEntry    = data.entry;
      aiConcepts = data.concepts ?? [];
      aiAnalysis = data.analysis ?? undefined;
    }
  } catch (err) {
    console.error("[Journal] paper entry generation failed:", err);
  }

  if (!aiEntry) {
    aiEntry = `Closed ${trade.symbol} ${trade.direction} at $${trade.exitPrice.toFixed(2)} — ${pl >= 0 ? "+" : ""}$${pl.toFixed(2)} (${plPct.toFixed(2)}%). ${closeReason === "stop" ? "Stop loss hit." : closeReason === "tp" ? "Take profit reached." : "Closed manually."}`;
    aiConcepts = ["PD"];
  }

  saveJournalEntry({
    id:          `${trade.exitDate}-${Math.random().toString(36).slice(2)}`,
    symbol:      trade.symbol,
    side:        "SELL",
    quantity:    trade.shares,
    price:       trade.exitPrice,
    entry:       aiEntry,
    concepts:    aiConcepts,
    timestamp:   trade.exitDate,
    entryPrice:  trade.entryPrice,
    pl,
    plPct,
    closeReason,
    stopLoss:    trade.stopLoss ?? undefined,
    takeProfit:  trade.takeProfit ?? undefined,
    analysis:    aiAnalysis,
  });
}

// ── Component (no-op — kept for layout.tsx compatibility) ─────────────────────

export default function AutoJournal() {
  return null;
}
