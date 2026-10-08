// Configured thresholds for the v4.1 options analysis. The policy forbids the
// analyst (deterministic or model) from inventing thresholds or dates — every
// number it is allowed to apply lives here and is shipped inside the input
// payload as `rules`, so a persisted run is attributable to the exact config.
// Bump RULES_VERSION whenever a value changes.

export const RULES_VERSION = "options-rules-1";

// Server-enforced. Not read from env, the request, or model output — the
// payload builder always copies this constant and the validator rejects any
// output whose paper_trading_only differs from the input or is not true.
export const PAPER_TRADING_ONLY = true as const;

export type FreshnessBand = { min_dte: number; max_dte: number | null; max_quote_age_seconds: number };

export const OPTIONS_RULES = {
  rules_version: RULES_VERSION,
  // Swing candidates only. review_dte (7) sits strictly below the swing floor
  // (14) so REVIEW_AT_DTE is always a usable time rule for an eligible expiry.
  min_swing_dte: 14,
  max_swing_dte: 60,
  review_dte: 7,
  // No approved exit dates configured → EXIT_BY_DATE is never available.
  approved_exit_dates: [] as string[],
  freshness: {
    bands: [
      { min_dte: 0, max_dte: 2,    max_quote_age_seconds: 120 },
      { min_dte: 3, max_dte: 5,    max_quote_age_seconds: 600 },
      { min_dte: 6, max_dte: null, max_quote_age_seconds: 1200 },
    ] as FreshnessBand[],
    max_underlying_age_seconds: 1200,
    // Max gap between the oldest and newest quote across one candidate's legs.
    max_leg_sync_seconds: 300,
    clock_tolerance_seconds: 5,
  },
  liquidity: {
    min_open_interest: 500,
    min_volume: null as number | null,     // volume is optional input; no floor configured
    max_spread_pct_of_mid: 0.08,
  },
  debit_long_leg_abs_delta: { min: 0.30, max: 0.60 },
};

export type OptionsRules = typeof OPTIONS_RULES;

export function freshnessBandFor(dte: number, rules: { freshness: { bands: FreshnessBand[] } } = OPTIONS_RULES): FreshnessBand | null {
  return rules.freshness.bands.find(b => dte >= b.min_dte && (b.max_dte === null || dte <= b.max_dte)) ?? null;
}
