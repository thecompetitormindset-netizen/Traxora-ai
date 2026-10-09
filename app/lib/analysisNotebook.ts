// Append-only notebook of options analyses as they were at save time. Stored
// on this device (scoped per user like the journal). Entries are never edited:
// a later analysis that changes direction or decision is a new entry, and the
// change is shown explicitly against the previous one.

import { scopedKey } from "./userState";

export type NotebookEntry = {
  id: string;
  saved_at: string;
  symbol: string;
  source_as_of: string;
  state: string;                  // UiState at save time
  state_label: string;
  decision: "TRADE" | "NO_TRADE" | null;
  reason_title: string | null;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL" | null;
  thesis: string | null;
  strategy: string | null;
  legs: { action: "BUY" | "SELL"; type: "CALL" | "PUT"; strike: number; expiry: string }[];
  invalidation: { lower: number | null; upper: number | null; condition: string } | null;
  target: number | null;
  time_rule: string | null;
  max_loss: number | null;        // app-calculated, per structure
  pricing_basis: string | null;
  user_supplied: boolean;
};

const KEY_BASE = "traxora-analysis-notebook";
export const NOTEBOOK_EVENT = "analysis-notebook-updated";
const MAX_ENTRIES = 300;

export function loadNotebook(): NotebookEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(scopedKey(KEY_BASE));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/** Returns false if storage is unavailable (private mode, quota). */
export function appendNotebook(entry: NotebookEntry): boolean {
  try {
    const all = loadNotebook();
    all.unshift(entry);
    localStorage.setItem(scopedKey(KEY_BASE), JSON.stringify(all.slice(0, MAX_ENTRIES)));
    window.dispatchEvent(new Event(NOTEBOOK_EVENT));
    return true;
  } catch { return false; }
}

const word = (d: NotebookEntry["direction"]) => (d ? d.toLowerCase() : "none");

/** What changed between an earlier entry and a later one for the same symbol. */
export function changesSince(prev: NotebookEntry, next: NotebookEntry): string[] {
  const out: string[] = [];
  if (prev.direction !== next.direction) out.push(`Direction: ${word(prev.direction)} → ${word(next.direction)}`);
  if (prev.state_label !== next.state_label) out.push(`State: ${prev.state_label} → ${next.state_label}`);
  if (prev.reason_title !== next.reason_title && next.reason_title) out.push(`Reason: ${prev.reason_title ?? "none"} → ${next.reason_title}`);
  if ((prev.strategy ?? "") !== (next.strategy ?? "")) out.push(`Structure: ${prev.strategy ?? "none"} → ${next.strategy ?? "none"}`);
  if (prev.invalidation?.lower !== next.invalidation?.lower || prev.invalidation?.upper !== next.invalidation?.upper) {
    if (prev.invalidation || next.invalidation) out.push("Invalidation levels changed");
  }
  return out;
}
