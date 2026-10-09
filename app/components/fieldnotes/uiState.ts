// The Fieldnotes state model and the plain-language copy for each outcome.
// One mapping from server results to UI states, used by every screen, so a
// state always means the same thing and looks the same everywhere.

import type { DisplayAnalysis } from "../../lib/optionsAnalysis/display";
import type { AnalysisOutput } from "../../lib/optionsAnalysis/schema";

export type UiState = "analyzing" | "candidate" | "validated" | "paper" | "no_trade" | "expired" | "unavailable" | "error";

export const STATE_LABEL: Record<UiState, string> = {
  analyzing: "Analyzing",
  candidate: "Candidate · checks pending",
  validated: "Validated estimate",
  paper: "Paper only",
  no_trade: "No trade",
  expired: "Expired",
  unavailable: "Data unavailable",
  error: "Error",
};

export const STATE_HELP: Record<UiState, string> = {
  analyzing: "Work is in progress; nothing is approved yet.",
  candidate: "A structure was proposed; the app's checks have not finished.",
  validated: "Contract, source, liquidity and pricing checks passed. Fills and results remain uncertain.",
  paper: "Analysis is for paper trading only, never a live instruction.",
  no_trade: "The analysis finished and found no qualifying candidate.",
  expired: "The source freshness window has ended. Shown as a historical observation.",
  unavailable: "Required inputs could not be obtained.",
  error: "A processing failure or failed check prevented a result.",
};

/** Global G1 failures mean the inputs themselves were missing — distinct from an ordinary no-trade. */
function isDataUnavailable(o: AnalysisOutput): boolean {
  const r = o.no_trade_reason;
  return r?.code === "G1_DATA" && /missing/i.test(r.detail) && !/event calendar/i.test(r.detail);
}

export function stateOf(d: Pick<DisplayAnalysis, "status" | "output">): UiState {
  switch (d.status) {
    case "PAPER_CANDIDATE": return "validated";
    case "STALE_CANDIDATE": return "expired";
    case "UNAVAILABLE": return "error";
    case "NO_TRADE": return d.output && isDataUnavailable(d.output) ? "unavailable" : "no_trade";
  }
}

// ── No-trade explanation and next action ─────────────────────────────────────

export type NextAction =
  | { kind: "refresh"; label: string; help: string }
  | { kind: "wait"; label: string; help: string }
  | { kind: "supply"; label: string; help: string }
  | { kind: "review"; label: string; help: string };

export type Explanation = {
  title: string;
  body: string;
  next: NextAction;
  // Refreshing re-reads the same sources. When those sources cannot provide
  // the missing evidence, refresh is disabled and this says why.
  refreshBlockedReason: string | null;
};

const NO_QUOTE_TIMES = "The option source publishes bid and ask prices without the time each was set, so the app can't confirm they're current.";

export function explain(o: AnalysisOutput, sessionOpen: boolean): Explanation {
  const r = o.no_trade_reason;
  const detail = r?.detail ?? "";
  const sessionWait = sessionOpen ? null : "The market is closed, so a refresh won't produce newer prices until the next session.";
  switch (r?.code) {
    case "G2_FRESHNESS":
      if (/No bid\/ask timestamp/i.test(detail)) {
        return {
          title: "Quote time unavailable",
          body: NO_QUOTE_TIMES,
          next: { kind: "supply", label: "Analyze your own timestamped data", help: "Paste quotes with their times. They're checked for consistency, not independently verified." },
          refreshBlockedReason: "Refreshing reads the same source, which never provides quote times.",
        };
      }
      if (/Underlying price/i.test(detail)) {
        return {
          title: "Underlying price is out of date",
          body: sessionOpen
            ? "The latest underlying price is older than the freshness limit."
            : "The latest underlying price is from the last session and is older than the freshness limit.",
          next: sessionOpen
            ? { kind: "refresh", label: "Refresh data", help: "Re-read the underlying and option quotes." }
            : { kind: "wait", label: "Wait for the regular session", help: "Analysis resumes with fresh prices at 9:30 ET on the next trading day." },
          refreshBlockedReason: sessionWait,
        };
      }
      return {
        title: "Quotes are out of date",
        body: "At least one selected leg's quote is older than its freshness limit.",
        next: { kind: "refresh", label: "Refresh quotes", help: "Re-read the option quotes." },
        refreshBlockedReason: sessionWait,
      };
    case "G3_SESSION":
      return {
        title: "Market closed",
        body: "No structure is proposed outside the regular session. Observations are shown for the next session.",
        next: { kind: "wait", label: "Wait for the regular session", help: "Regular session: 9:30–16:00 ET on trading days." },
        refreshBlockedReason: "The session is closed; refreshing won't change this.",
      };
    case "G4_EVENT":
      return {
        title: "Event before expiry",
        body: "A named event falls before the expiry, which this analysis does not hold a structure through.",
        next: { kind: "review", label: "Review the event date", help: "Reassess after the event or with an expiry before it." },
        refreshBlockedReason: null,
      };
    case "G1_DATA":
      if (/event calendar/i.test(detail)) {
        return {
          title: "Event coverage unavailable",
          body: "The earnings calendar couldn't be confirmed through the expiry. That is different from having no events.",
          next: { kind: "refresh", label: "Refresh data", help: "Retry loading the event calendar." },
          refreshBlockedReason: null,
        };
      }
      if (/missing/i.test(detail)) {
        return {
          title: "Required data unavailable",
          body: detail,
          next: { kind: "refresh", label: "Refresh data", help: "Retry the data sources." },
          refreshBlockedReason: null,
        };
      }
      return {
        title: "No contract met the selection rules",
        body: detail,
        next: { kind: "wait", label: "Check back later", help: "Liquidity and listed strikes change during the session." },
        refreshBlockedReason: sessionWait,
      };
    case "G7_EXIT":
      return {
        title: "No complete exit plan",
        body: "A supplied invalidation level, target or configured time rule is missing.",
        next: { kind: "wait", label: "Wait for clearer levels", help: "A new swing high or low can supply the missing level." },
        refreshBlockedReason: null,
      };
    case "CONFLICTING_SIGNALS":
      return {
        title: "Signals disagree",
        body: "Price-structure observations point in different directions, so no direction is taken.",
        next: { kind: "wait", label: "Wait for a confirmed close", help: "A daily close that resolves the conflict allows reassessment." },
        refreshBlockedReason: null,
      };
    case "LOW_CHECKLIST":
      return {
        title: "Too little evidence",
        body: "Fewer than four of the seven checks pass on supplied evidence.",
        next: { kind: "wait", label: "Wait for more evidence", help: "Reassess when more checks pass." },
        refreshBlockedReason: null,
      };
    case "WELLBEING":
      return {
        title: "Not a trade to analyze",
        body: "Money needed for essentials shouldn't be put at risk. Paper trading is a good place to practice.",
        next: { kind: "review", label: "Practice on paper", help: "Paper trading uses simulated money only." },
        refreshBlockedReason: null,
      };
    case "G6_UNSUPPORTED":
      return {
        title: "Unsupported structure",
        body: "Only defined-risk structures are analyzed.",
        next: { kind: "review", label: "Choose a defined-risk structure", help: "Spreads and condors have a capped loss." },
        refreshBlockedReason: null,
      };
    default:
      return {
        title: "No qualifying candidate",
        body: detail || "No candidate cleared every gate on supplied evidence.",
        next: { kind: "wait", label: "Check back later", help: "Evidence changes as the session develops." },
        refreshBlockedReason: null,
      };
  }
}

/** Plain-language rewrite of the analyst's data-gap strings. */
export function gapCopy(gap: string): string {
  if (/IV rank unavailable/i.test(gap)) return "IV rank is unavailable until about 60 trading days of IV history are stored.";
  if (/Positioning data not supplied/i.test(gap)) return "Positioning (who holds which contracts) isn't available from the current sources.";
  if (/bid\/ask quote timestamps/i.test(gap)) return "Quote time unavailable: the option source doesn't publish when each bid and ask was set.";
  const ev = /Event calendar coverage unknown through (\S+)/i.exec(gap);
  if (ev) return `Event coverage unavailable through ${ev[1]}. This is not the same as having no events.`;
  return gap;
}

export const NO_TRADE_SHORT: Record<string, string> = {
  G1_DATA: "Missing data", G2_FRESHNESS: "Quotes not current", G3_SESSION: "Market closed", G4_EVENT: "Event before expiry",
  G6_UNSUPPORTED: "Unsupported structure", G7_EXIT: "No complete exit plan", WELLBEING: "Wellbeing",
  CONFLICTING_SIGNALS: "Signals disagree", LOW_CHECKLIST: "Too little evidence", NO_EDGE: "No qualifying candidate",
};

export function shortReason(d: Pick<DisplayAnalysis, "status" | "output" | "note">): string {
  if (d.status === "PAPER_CANDIDATE") return "All checks passed";
  if (d.status === "STALE_CANDIDATE") return "Freshness window ended";
  if (d.status === "UNAVAILABLE") return "Failed application checks";
  const o = d.output;
  if (!o?.no_trade_reason) return "No qualifying candidate";
  const e = explain(o, true);
  return e.title === "Underlying price is out of date" || e.title === "Quote time unavailable" ? e.title : NO_TRADE_SHORT[o.no_trade_reason.code] ?? e.title;
}

/** Checklist reasons can cite a gate code ("Not assessed: G3_SESSION"); show words instead. */
export function checkReasonCopy(reason: string): string {
  return reason.replace(/\b(G1_DATA|G2_FRESHNESS|G3_SESSION|G4_EVENT|G6_UNSUPPORTED|G7_EXIT|WELLBEING|CONFLICTING_SIGNALS|LOW_CHECKLIST|NO_EDGE)\b/g,
    code => (NO_TRADE_SHORT[code] ?? code).toLowerCase());
}

// ── Everyday-language reasons (Options overview) ─────────────────────────────
// Same outcomes as above, worded for someone who has never traded options.

export function plainReason(d: Pick<DisplayAnalysis, "status" | "output">, sessionOpen: boolean): string {
  if (d.status === "PAPER_CANDIDATE") return "Passed every check — worth a look";
  if (d.status === "STALE_CANDIDATE") return "This idea is out of date";
  if (d.status === "UNAVAILABLE") return "We couldn’t finish checking this one";
  const r = d.output?.no_trade_reason;
  if (!r) return "Nothing worth doing right now";
  switch (r.code) {
    case "G3_SESSION": return "Market is closed";
    case "G2_FRESHNESS":
      if (/No bid\/ask timestamp/i.test(r.detail)) return "Can’t confirm the option prices are current";
      if (/Underlying price/i.test(r.detail)) return sessionOpen ? "Prices are too old to trust" : "Market is closed";
      return "Option prices are too old to trust";
    case "G4_EVENT": return "Big company news is coming first";
    case "G1_DATA": return /event calendar/i.test(r.detail) ? "Couldn’t confirm upcoming company news" : /missing/i.test(r.detail) ? "Some data was missing" : "No option was a safe enough fit";
    case "G7_EXIT": return "No clear way out of the trade";
    case "CONFLICTING_SIGNALS": return "Signs point both ways";
    case "LOW_CHECKLIST": return "Not enough good signs";
    default: return "Nothing worth doing right now";
  }
}
