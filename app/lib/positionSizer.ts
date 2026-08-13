import { scopedKey } from "./userState";

export type RiskSettings = {
  accountSize: number;
  riskPct: number;
  /** Ceiling on total option premium as a percentage of the account. */
  maxPremiumPct: number;
};

const KEY = "traxora_risk_settings";
export const DEFAULT_MAX_PREMIUM_PCT = 10;
const DEFAULT_SETTINGS: RiskSettings = {
  accountSize: 0,
  riskPct: 1,
  maxPremiumPct: DEFAULT_MAX_PREMIUM_PCT,
};

export function loadRiskSettings(): RiskSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(scopedKey(KEY));
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      accountSize: typeof parsed.accountSize === "number" && parsed.accountSize >= 0 ? parsed.accountSize : 0,
      riskPct: typeof parsed.riskPct === "number" && parsed.riskPct > 0 ? parsed.riskPct : 1,
      maxPremiumPct:
        typeof parsed.maxPremiumPct === "number" && parsed.maxPremiumPct > 0
          ? parsed.maxPremiumPct
          : DEFAULT_MAX_PREMIUM_PCT,
    };
  } catch { return DEFAULT_SETTINGS; }
}

export function saveRiskSettings(s: RiskSettings) {
  localStorage.setItem(scopedKey(KEY), JSON.stringify(s));
}

// ─── Position sizing ──────────────────────────────────────────────────────────
//
// Size is the MINIMUM of three independent constraints. Each one answers a
// different question and any of them can legitimately bind:
//
//   1. Risk cap     — how much can I lose if the stop is hit?
//   2. Notional cap — can I actually afford the position?
//   3. Premium cap  — options only; how much of the account may sit in premium?
//
// The risk cap is the one that was wrong. It previously compared the FULL
// option premium against the risk budget, but full premium is max theoretical
// loss at expiry, not planned risk on a trade that has a defined stop. For a
// long option stopped out on an underlying level, the loss at the stop is
// approximately the delta-weighted move:
//
//     riskPerContract ≈ |delta| × stopDistance × 100
//
// For the OXY setup (delta 0.49, entry 58.35, stop 58.20) that is $7.35 per
// contract, not the $159 premium — a 21x overstatement that rendered nearly
// every options play untradeable.

export type BindingConstraint = "risk" | "notional" | "premium";

export type Instrument = "option" | "equity";

export interface SizePositionInput {
  instrument: Instrument;
  accountSize: number;
  /** Percent of account risked per trade, e.g. 1 for 1%. */
  riskPct: number;
  /** Underlying entry price. */
  entry: number;
  /** Underlying stop price. */
  stop: number;
  /** Cash available to deploy. Defaults to the account size. */
  buyingPower?: number;
  /** Options only: absolute delta of the contract. */
  delta?: number | null;
  /** Options only: total premium per contract in dollars (mid × 100). */
  premiumPerContract?: number | null;
  /** Options only: premium ceiling as a percentage of the account. */
  maxPremiumPct?: number;
  /** Shares per contract. */
  contractMultiplier?: number;
}

export interface SizeResult {
  instrument: Instrument;
  /** Contracts for options, shares for equities. */
  units: number;
  /** Dollar loss per unit if the stop is hit. */
  riskPerUnit: number;
  /** The risk budget: account × riskPct. */
  maxRiskDollars: number;
  /** Risk actually taken at the returned size. */
  actualRiskDollars: number;
  /** Cash deployed at the returned size. */
  totalCost: number;
  /**
   * Delta-adjusted underlying exposure. Informational — options are leveraged
   * and this is what the position actually controls.
   */
  notionalExposure: number;
  /** Which constraint produced the returned size. */
  binding: BindingConstraint;
  /** Short, actionable label naming the binding constraint. */
  bindingLabel: string;
  riskCapUnits: number;
  notionalCapUnits: number;
  premiumCapUnits: number;
  /** True when no constraint permits even one unit. */
  tooSmall: boolean;
  /**
   * Account size that would permit exactly one unit under the binding
   * constraint — the honest answer to "how much do I need for this trade?".
   */
  minAccountForOne: number | null;
}

const BINDING_LABELS: Record<BindingConstraint, string> = {
  risk:     "Capped by risk limit",
  notional: "Capped by buying power",
  premium:  "Capped by premium limit",
};

const isPositive = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Risk per unit if the stop is hit.
 * Equities: the stop distance itself. Options: the delta-weighted move,
 * clamped at the premium, since a long option cannot lose more than it cost.
 */
export function riskPerUnitFor(input: SizePositionInput): number | null {
  const stopDistance = Math.abs(input.entry - input.stop);
  if (!isPositive(stopDistance)) return null;

  if (input.instrument === "equity") return stopDistance;

  const delta = input.delta != null ? Math.abs(input.delta) : null;
  if (!isPositive(delta)) return null;

  const multiplier = input.contractMultiplier ?? 100;
  const deltaRisk  = delta * stopDistance * multiplier;
  const premium    = input.premiumPerContract;
  return isPositive(premium) ? Math.min(deltaRisk, premium) : deltaRisk;
}

/**
 * Size a position as the minimum of the risk, notional and premium caps.
 * Returns null when the inputs cannot support a sizing decision at all.
 */
export function sizePosition(input: SizePositionInput): SizeResult | null {
  const { instrument, accountSize, riskPct, entry } = input;
  if (!isPositive(accountSize) || !isPositive(riskPct) || !isPositive(entry)) return null;

  const riskPerUnit = riskPerUnitFor(input);
  if (riskPerUnit === null) return null;

  const multiplier   = input.contractMultiplier ?? 100;
  const buyingPower  = isPositive(input.buyingPower) ? input.buyingPower : accountSize;
  const premium      = input.premiumPerContract;
  const isOption     = instrument === "option";

  if (isOption && !isPositive(premium)) return null;

  // Cash outlay per unit: premium for a long option, share price for equity.
  const costPerUnit = isOption ? premium! : entry;

  // 1. Risk cap
  const maxRiskDollars = accountSize * (riskPct / 100);
  const riskCapUnits   = Math.floor(maxRiskDollars / riskPerUnit);

  // 2. Notional cap — a tight stop generates share counts the account cannot
  //    actually fund. 1% of $5,000 with a $0.15 stop is 333 shares (~$19k).
  const notionalCapUnits = Math.floor(buyingPower / costPerUnit);

  // 3. Premium cap — options only; equities are already bounded by notional.
  const maxPremiumPct  = input.maxPremiumPct ?? DEFAULT_MAX_PREMIUM_PCT;
  const premiumCapUnits = isOption
    ? Math.floor((accountSize * (maxPremiumPct / 100)) / premium!)
    : Number.POSITIVE_INFINITY;

  const units = Math.max(0, Math.min(riskCapUnits, notionalCapUnits, premiumCapUnits));

  // Ties resolve to the constraint listed first — risk is the most informative
  // thing to tell someone about their own sizing.
  const binding: BindingConstraint =
    riskCapUnits <= notionalCapUnits && riskCapUnits <= premiumCapUnits ? "risk"
    : notionalCapUnits <= premiumCapUnits ? "notional"
    : "premium";

  const deltaForExposure = isOption ? Math.abs(input.delta ?? 0) * multiplier : 1;

  // Account size that would permit exactly one unit under the binding constraint.
  const minAccountForOne =
    binding === "risk"     ? riskPerUnit / (riskPct / 100)
    : binding === "premium" ? premium! / (maxPremiumPct / 100)
    : costPerUnit; // notional binds on buying power, which is a cash figure

  return {
    instrument,
    units,
    riskPerUnit,
    maxRiskDollars,
    actualRiskDollars: units * riskPerUnit,
    totalCost: units * costPerUnit,
    notionalExposure: units * deltaForExposure * entry,
    binding,
    bindingLabel: BINDING_LABELS[binding],
    riskCapUnits,
    notionalCapUnits,
    premiumCapUnits,
    tooSmall: units < 1,
    minAccountForOne: Number.isFinite(minAccountForOne) ? minAccountForOne : null,
  };
}

const money = (n: number) =>
  n >= 1000 ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(n < 10 ? 2 : 0)}`;

/**
 * One-line sizing readout for a card.
 *
 * Always names the binding constraint. "Capped by premium limit" tells someone
 * what to change; a bare red warning does not. When nothing can be sized, it
 * reports the account size that would actually permit one unit rather than
 * implying the trade is impossible.
 */
export function describeSize(size: SizeResult, riskPct: number): { text: string; tone: "ok" | "warn" } {
  const noun = size.instrument === "option" ? "contract" : "share";
  const plural = size.units === 1 ? "" : "s";

  if (size.tooSmall) {
    const need = size.minAccountForOne;
    const reason =
      size.binding === "premium"  ? `1 ${noun} exceeds your premium limit`
      : size.binding === "notional" ? `1 ${noun} exceeds your buying power`
      : `1 ${noun} risks more than your ${riskPct}% cap`;
    return {
      tone: "warn",
      text: need ? `${reason} — needs ~${money(need)} to take one` : reason,
    };
  }

  return {
    tone: "ok",
    text:
      `Size: ${size.units} ${noun}${plural} · ${money(size.actualRiskDollars)} at risk ` +
      `· ${money(size.totalCost)} deployed — ${size.bindingLabel}`,
  };
}

/**
 * Convenience wrapper for the options cards.
 * `entry`/`stop` are UNDERLYING levels — the option's risk is derived from them
 * via delta, never from the premium alone.
 */
export function sizeOptionsPosition(
  accountSize: number,
  riskPct: number,
  premiumPerContract: number | null,
  opts: { entry: number | null; stop: number | null; delta: number | null; maxPremiumPct?: number; buyingPower?: number },
): SizeResult | null {
  if (!isPositive(opts.entry) || !isPositive(opts.stop) || !isPositive(premiumPerContract)) return null;
  return sizePosition({
    instrument: "option",
    accountSize,
    riskPct,
    entry: opts.entry,
    stop: opts.stop,
    delta: opts.delta,
    premiumPerContract,
    maxPremiumPct: opts.maxPremiumPct,
    buyingPower: opts.buyingPower,
  });
}
