"use client";

import { useEffect, useRef } from "react";
import { getPortfolio, PORTFOLIO_UPDATED_EVENT, type Trade } from "../lib/trading";
import { scopedKey } from "../lib/userState";
import { fifoEntryForSell } from "../lib/pl";

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
  autoClose?:   boolean;
  analysis?:    TradeAnalysis;
};

const JOURNAL_KEY_BASE = "traxora-journal";

let _autoJournalStarted = false;

export function getJournal(): JournalEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(scopedKey(JOURNAL_KEY_BASE)) ?? "[]"); }
  catch { return []; }
}

export function clearJournal(): void {
  localStorage.removeItem(scopedKey(JOURNAL_KEY_BASE));
  window.dispatchEvent(new Event("journal-updated"));
}

function saveJournalEntry(e: JournalEntry) {
  const existing = getJournal();
  // Avoid duplicates — drop if a matching key already exists
  const key = `${e.symbol}|${e.side}|${e.timestamp}`;
  if (existing.some(j => `${j.symbol}|${j.side}|${j.timestamp}` === key)) return;
  existing.unshift(e);
  localStorage.setItem(scopedKey(JOURNAL_KEY_BASE), JSON.stringify(existing.slice(0, 300)));
  window.dispatchEvent(new Event("journal-updated"));
}

async function generateEntry(
  trade: Trade,
  allTrades: Trade[],
): Promise<JournalEntry> {
  let entryPrice: number | undefined;
  let pl:         number | undefined;
  let plPct:      number | undefined;

  if (trade.side === "SELL") {
    const fifo = fifoEntryForSell(trade, allTrades);
    entryPrice = fifo.entryPrice;
    pl         = fifo.pl;
    plPct      = fifo.plPct;
  }

  const closeReason: JournalEntry["closeReason"] =
    trade.closeReason === "tp"   ? "tp"   :
    trade.closeReason === "stop" ? "stop" :
    trade.autoClose              ? "stop" : "manual";

  let aiEntry    = "";
  let aiConcepts: string[] = [];
  let aiAnalysis: JournalEntry["analysis"] | undefined;

  try {
    const res  = await fetch("/api/ai/journal", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol:      trade.symbol,
        side:        trade.side,
        quantity:    trade.quantity,
        price:       trade.price,
        entryPrice,
        pl,
        plPct,
        closeReason: trade.side === "SELL" ? closeReason : undefined,
        stopLoss:    trade.stopLoss,
        takeProfit:  trade.takeProfit,
      }),
    });
    const data = await res.json();
    if (res.ok && data.entry) {
      aiEntry    = data.entry;
      aiConcepts = data.concepts ?? [];
      aiAnalysis = data.analysis ?? undefined;
    } else {
      console.error("[Journal] API error:", data?.error ?? res.status);
    }
  } catch (err) {
    console.error("[Journal] fetch failed:", err);
  }

  // Fallback: always produce an entry even if AI fails
  const clean = String(trade.symbol).replace(".US","").replace(".COMM","");
  if (!aiEntry) {
    aiEntry = trade.side === "BUY"
      ? `Entered ${clean} long at $${trade.price.toFixed(2)} — price showed ICT alignment at a key PD level; monitor for continuation and order flow confirmation.`
      : `Closed ${clean} position at $${trade.price.toFixed(2)}${pl != null ? ` with ${pl >= 0 ? "+" : ""}$${pl.toFixed(2)} realised P&L` : ""} — review structure and execution quality against the original entry thesis.`;
    aiConcepts = ["PD"];
  }

  return {
    id:          `${trade.time ?? Date.now()}-${Math.random().toString(36).slice(2)}`,
    symbol:      trade.symbol,
    side:        trade.side,
    quantity:    trade.quantity,
    price:       trade.price,
    entry:       aiEntry,
    concepts:    aiConcepts,
    timestamp:   trade.time ?? new Date().toISOString(),
    entryPrice,
    pl,
    plPct,
    closeReason: trade.side === "SELL" ? closeReason : undefined,
    stopLoss:    trade.stopLoss,
    takeProfit:  trade.takeProfit,
    autoClose:   trade.autoClose,
    analysis:    aiAnalysis,
  };
}

export default function AutoJournal() {
  const lastTradeCountRef = useRef<number | null>(null);
  const backfillDoneRef   = useRef(false);

  useEffect(() => {
    if (_autoJournalStarted) { console.warn("[AutoJournal] duplicate mount — skipping"); return; }
    _autoJournalStarted = true;

    const portfolio = getPortfolio();
    lastTradeCountRef.current = portfolio.trades.length;

    // ── Backfill: generate entries for any trade not yet journaled ──────────
    if (!backfillDoneRef.current) {
      backfillDoneRef.current = true;

      const journaledKeys = new Set(
        getJournal().map(j => `${j.symbol}|${j.side}|${j.timestamp}`),
      );

      // trades are newest-first; process oldest-first for correct FIFO context
      const unjournaled = [...portfolio.trades]
        .reverse()
        .filter(t => !journaledKeys.has(`${t.symbol}|${t.side}|${t.time}`));

      if (unjournaled.length > 0) {
        (async () => {
          for (const trade of unjournaled) {
            const entry = await generateEntry(trade, portfolio.trades);
            saveJournalEntry(entry);
            // Small pause between AI calls to avoid rate-limiting on large backfills
            await new Promise(r => setTimeout(r, 300));
          }
        })();
      }
    }

    // ── New-trade listener ──────────────────────────────────────────────────
    async function handlePortfolioUpdate() {
      const updated = getPortfolio();
      const prev    = lastTradeCountRef.current ?? updated.trades.length;
      const newCount = updated.trades.length - prev;

      if (newCount <= 0) {
        lastTradeCountRef.current = updated.trades.length;
        return;
      }

      const newTrades = updated.trades.slice(0, newCount);
      lastTradeCountRef.current = updated.trades.length;

      for (const trade of newTrades as Trade[]) {
        const entry = await generateEntry(trade, updated.trades);
        saveJournalEntry(entry);
      }
    }

    window.addEventListener(PORTFOLIO_UPDATED_EVENT, handlePortfolioUpdate);
    return () => {
      window.removeEventListener(PORTFOLIO_UPDATED_EVENT, handlePortfolioUpdate);
      _autoJournalStarted = false;
    };
  }, []);

  return null;
}
