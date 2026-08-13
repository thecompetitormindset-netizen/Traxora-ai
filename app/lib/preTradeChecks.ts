// Automated pre-trade calendar checks.
//
// Both of these were previously left to the user to remember. Earnings inside
// the contract's life changes the IV and gap profile the setup was scored on;
// an ex-dividend date before expiry creates early-assignment risk on any short
// leg. Neither is a hard block — they are flags the card must surface.

export type PreTradeFlagKind = "earnings" | "ex-dividend";

export interface PreTradeFlag {
  kind: PreTradeFlagKind;
  /** Short label for the card. */
  label: string;
  /** Full explanation for tooltips and the copy-to-Claude prompt. */
  detail: string;
  severity: "warn" | "info";
}

export interface PreTradeCheckInput {
  /** Unix seconds. */
  earningsTs?: number | null;
  /** Unix seconds. */
  exDividendTs?: number | null;
  /** Option expiry, unix seconds. */
  expiryTs?: number | null;
  /** Evaluation time, unix milliseconds. Defaults to now. */
  nowMs?: number;
  /** Whether the setup carries a short leg exposed to early assignment. */
  hasShortLeg?: boolean;
}

const DAY_MS = 86_400_000;

function fmtDate(tsSeconds: number): string {
  return new Date(tsSeconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const daysBetween = (tsSeconds: number, nowMs: number) =>
  Math.ceil((tsSeconds * 1000 - nowMs) / DAY_MS);

/**
 * Evaluate the calendar events that fall inside the contract's life.
 * Pure — the caller fetches the dates and passes them in.
 */
export function evaluatePreTradeChecks({
  earningsTs,
  exDividendTs,
  expiryTs,
  nowMs = Date.now(),
  hasShortLeg = false,
}: PreTradeCheckInput): PreTradeFlag[] {
  const flags: PreTradeFlag[] = [];
  if (!expiryTs || !Number.isFinite(expiryTs)) return flags;

  const expiryMs = expiryTs * 1000;

  // Earnings inside the DTE window — between now and expiry.
  if (earningsTs && Number.isFinite(earningsTs)) {
    const earningsMs = earningsTs * 1000;
    if (earningsMs >= nowMs && earningsMs <= expiryMs) {
      const days = daysBetween(earningsTs, nowMs);
      flags.push({
        kind: "earnings",
        label: `Earnings ${fmtDate(earningsTs)} (in ${days}d) — before expiry`,
        detail:
          `Earnings on ${fmtDate(earningsTs)} falls inside the contract's ${Math.max(1, daysBetween(expiryTs, nowMs))}-day life. ` +
          `Expect an IV crush after the print and gap risk through the stop.`,
        severity: "warn",
      });
    }
  }

  // Ex-dividend before expiry — assignment risk on short legs.
  if (exDividendTs && Number.isFinite(exDividendTs)) {
    const exDivMs = exDividendTs * 1000;
    if (exDivMs >= nowMs && exDivMs <= expiryMs) {
      flags.push({
        kind: "ex-dividend",
        label: `Ex-div ${fmtDate(exDividendTs)} — before expiry`,
        detail: hasShortLeg
          ? `Ex-dividend on ${fmtDate(exDividendTs)} precedes expiry. Short calls that are in the money ` +
            `are at risk of early assignment the day before.`
          : `Ex-dividend on ${fmtDate(exDividendTs)} precedes expiry. No short leg in this setup, so there is ` +
            `no assignment exposure, but the underlying will trade down by the dividend on that date.`,
        severity: hasShortLeg ? "warn" : "info",
      });
    }
  }

  return flags;
}
