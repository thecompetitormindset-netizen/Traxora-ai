// Server-side pricing for an approved candidate. The analyst never outputs
// these figures — v4.1 reserves debit/credit, max loss/gain and breakeven for
// the application. Risk figures use the natural fill (pay the ask, receive the
// bid) so they are the conservative case; the mid is shown for reference.

import type { AnalysisOutput, InputContract } from "./schema";

export type CandidatePricing = {
  net_type: "DEBIT" | "CREDIT";
  natural_net: number;          // per share, natural fill
  mid_net: number;              // per share, at mids
  multiplier: number;
  max_loss: number;             // per 1-lot, natural fill, in underlying currency
  max_gain: number | null;      // null = unbounded (long call)
  breakevens: number[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function priceCandidate(
  structure: NonNullable<AnalysisOutput["proposed_structure"]>,
  contractsById: Map<string, InputContract>,
): { ok: true; pricing: CandidatePricing } | { ok: false; error: string } {
  const legs = structure.legs.map(l => ({ l, c: contractsById.get(l.contract_id) }));
  if (legs.some(x => !x.c || x.c.bid === null || x.c.ask === null || !x.c.spec)) {
    return { ok: false, error: "Cannot price: a leg is missing a quote or contract specification" };
  }
  const multiplier = legs[0].c!.spec!.multiplier;
  let natural = 0, mid = 0; // positive = debit paid
  for (const { l, c } of legs) {
    const m = (c!.bid! + c!.ask!) / 2;
    if (l.action === "BUY") { natural += c!.ask!; mid += m; } else { natural -= c!.bid!; mid -= m; }
  }

  const strikes = structure.legs.map(l => l.strike).sort((a, b) => a - b);
  const shortStrike = (type: "CALL" | "PUT") => structure.legs.find(l => l.action === "SELL" && l.type === type)!.strike;
  const longStrike = (type: "CALL" | "PUT") => structure.legs.find(l => l.action === "BUY" && l.type === type)!.strike;
  const width = strikes.length >= 2 ? strikes[1] - strikes[0] : 0;
  const debit = natural, credit = -natural;

  let maxLoss: number, maxGain: number | null, breakevens: number[];
  switch (structure.strategy) {
    case "LONG_CALL":
      maxLoss = debit; maxGain = null; breakevens = [longStrike("CALL") + debit]; break;
    case "LONG_PUT":
      maxLoss = debit; maxGain = longStrike("PUT") - debit; breakevens = [longStrike("PUT") - debit]; break;
    case "BULL_CALL_SPREAD":
      maxLoss = debit; maxGain = width - debit; breakevens = [longStrike("CALL") + debit]; break;
    case "BEAR_PUT_SPREAD":
      maxLoss = debit; maxGain = width - debit; breakevens = [longStrike("PUT") - debit]; break;
    case "BULL_PUT_SPREAD":
      maxLoss = width - credit; maxGain = credit; breakevens = [shortStrike("PUT") - credit]; break;
    case "BEAR_CALL_SPREAD":
      maxLoss = width - credit; maxGain = credit; breakevens = [shortStrike("CALL") + credit]; break;
    case "IRON_CONDOR":
      maxLoss = width - credit; maxGain = credit; breakevens = [shortStrike("PUT") - credit, shortStrike("CALL") + credit]; break;
  }

  if (!(maxLoss > 0)) return { ok: false, error: "Cannot price: natural fill implies no risk, which indicates bad quotes" };
  if (maxGain !== null && !(maxGain > 0)) return { ok: false, error: "Cannot price: natural fill leaves no possible gain" };

  return {
    ok: true,
    pricing: {
      net_type: natural >= 0 ? "DEBIT" : "CREDIT",
      natural_net: round2(Math.abs(natural)),
      mid_net: round2(Math.abs(mid)),
      multiplier,
      max_loss: round2(maxLoss * multiplier),
      max_gain: maxGain === null ? null : round2(maxGain * multiplier),
      breakevens: breakevens.map(round2),
    },
  };
}
