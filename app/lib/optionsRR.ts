// Risk:reward on the instrument that is actually being traded.
//
// The cards showed a stock-derived ratio (risk $0.15/share, reward $0.50/share
// => 3.3:1) next to an options contract. That ratio does not describe the
// contract: the option only captures the move through delta, and it pays theta
// and the bid-ask round trip on the way. For the OXY setup those frictions
// consume most of a 0.85% target move, taking a headline 3.3:1 down to roughly
// 1.2:1 — a materially different trade than the one the card advertised.
//
// All levels passed in are UNDERLYING prices, taken from computeCanonicalTrade().

/** Below this, an option's edge is considered eaten by friction. */
export const DEGRADED_OPTION_RR = 1.5;

/** Fallback bid-ask assumption when the chain has no quoted market, as a fraction of premium. */
const ASSUMED_SPREAD_FRACTION = 0.02;

export interface OptionRRInput {
  /** Underlying entry, stop and target — from computeCanonicalTrade(). */
  entry: number;
  stop: number;
  target: number;
  /** Absolute delta of the contract. */
  delta: number;
  /** Days to expiry. */
  dte: number;
  /** Total premium per contract in dollars (mid × 100). */
  premiumPerContract: number;
  /** Per-share per-day theta from the chain (negative for long options). */
  theta?: number | null;
  bid?: number | null;
  ask?: number | null;
  /**
   * Underlying's expected daily move in dollars, used to estimate how long the
   * trade must be held to reach target — which is what theta is charged over.
   */
  expectedDailyMove?: number | null;
  contractMultiplier?: number;
}

export interface OptionRRResult {
  /** Per 100 shares, so it is directly comparable to one contract. */
  equityRisk: number;
  equityReward: number;
  equityRR: number;
  /** Per contract, net of friction. */
  optionRisk: number;
  optionReward: number;
  optionRR: number;
  thetaCost: number;
  spreadCost: number;
  thetaPerDay: number;
  holdingDays: number;
  /** thetaCost + spreadCost — the total drag on the contract. */
  friction: number;
  /** Option R:R is below threshold. */
  degraded: boolean;
  /** Option R:R is degraded while the equity leg still clears the threshold. */
  recommendShares: boolean;
}

const isPositive = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Estimate per-day theta in dollars per contract.
 * Prefers the chain's own theta; otherwise uses the standard ATM approximation
 * that an at-the-money option sheds its premium over roughly 2×DTE.
 */
export function thetaPerDayFor(
  theta: number | null | undefined,
  premiumPerContract: number,
  dte: number,
  contractMultiplier = 100,
): number {
  if (typeof theta === "number" && Number.isFinite(theta) && theta !== 0) {
    return Math.abs(theta) * contractMultiplier;
  }
  if (!isPositive(dte)) return 0;
  return premiumPerContract / (2 * dte);
}

/**
 * Round-trip bid-ask cost per contract: entered at the ask and exited at the
 * bid, so relative to mid the trade pays the full spread once.
 */
export function spreadCostFor(
  bid: number | null | undefined,
  ask: number | null | undefined,
  premiumPerContract: number,
  contractMultiplier = 100,
): number {
  if (isPositive(bid) && isPositive(ask) && ask > bid) {
    return (ask - bid) * contractMultiplier;
  }
  return premiumPerContract * ASSUMED_SPREAD_FRACTION;
}

/**
 * Expected holding period in days: how many average sessions the underlying
 * needs to travel the target distance. Clamped to at least one day and never
 * beyond expiry.
 */
export function holdingDaysFor(targetDistance: number, expectedDailyMove: number | null | undefined, dte: number): number {
  const maxDays = isPositive(dte) ? Math.floor(dte) : 1;
  if (!isPositive(expectedDailyMove)) return Math.min(Math.max(1, maxDays), 3);
  return Math.min(Math.max(1, Math.ceil(targetDistance / expectedDailyMove)), Math.max(1, maxDays));
}

/**
 * Compute R:R for both legs of the setup: the equity leg per 100 shares and the
 * options contract net of theta and spread. Returns null when the setup is not
 * well formed (no stop distance, no delta, no premium).
 */
export function computeOptionRR(input: OptionRRInput): OptionRRResult | null {
  const multiplier    = input.contractMultiplier ?? 100;
  const stopDistance  = Math.abs(input.entry - input.stop);
  const targetDistance = Math.abs(input.target - input.entry);
  const delta         = Math.abs(input.delta);

  if (!isPositive(stopDistance) || !isPositive(targetDistance)) return null;
  if (!isPositive(delta) || !isPositive(input.premiumPerContract)) return null;

  const equityRisk   = stopDistance * multiplier;
  const equityReward = targetDistance * multiplier;
  const equityRR     = equityReward / equityRisk;

  const thetaPerDay  = thetaPerDayFor(input.theta, input.premiumPerContract, input.dte, multiplier);
  const holdingDays  = holdingDaysFor(targetDistance, input.expectedDailyMove, input.dte);
  const thetaCost    = thetaPerDay * holdingDays;
  const spreadCost   = spreadCostFor(input.bid, input.ask, input.premiumPerContract, multiplier);
  const friction     = thetaCost + spreadCost;

  // Losing at the stop costs the delta-weighted move plus the friction already
  // paid, but never more than the premium — a long option's floor is zero.
  const optionRisk = Math.min(
    delta * stopDistance * multiplier + friction,
    input.premiumPerContract,
  );
  // Winning at the target pays the delta-weighted move less the same friction,
  // and cannot go below zero.
  const optionReward = Math.max(0, delta * targetDistance * multiplier - friction);
  const optionRR     = optionRisk > 0 ? optionReward / optionRisk : 0;

  const degraded = optionRR < DEGRADED_OPTION_RR;

  return {
    equityRisk,
    equityReward,
    equityRR,
    optionRisk,
    optionReward,
    optionRR,
    thetaCost,
    spreadCost,
    thetaPerDay,
    holdingDays,
    friction,
    degraded,
    recommendShares: degraded && equityRR >= DEGRADED_OPTION_RR,
  };
}
