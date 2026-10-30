// What a futures contract actually is.
//
// Practice trading treated futures like shares: one "share" of CL at 75 cost
// 75, and a dollar move in crude made a dollar. A real CL contract is a
// thousand barrels — 75,000 of exposure, where that same dollar move is a
// thousand dollars. The simulation understated the position by the contract
// size, which runs from fifty times on ES to a thousand on CL, and a practice
// account that gets risk wrong by three orders of magnitude teaches the
// opposite of what it is for.
//
// Two numbers do the work. `multiplier` converts a move in the quoted price
// into money. `initialMargin` is what must be put up to hold one contract,
// because futures are margined rather than bought outright — modelling them
// as a cash purchase would make the leverage, which is the whole character of
// the instrument, disappear.

export type FuturesSpec = {
  /** The app's symbol, e.g. "CL.COMM". */
  symbol: string;
  /** Exchange root, e.g. "CL". */
  root: string;
  name: string;
  /** Money per 1.00 of quoted price, per contract. */
  multiplier: number;
  /** Smallest price increment the contract trades in. */
  tickSize: number;
  /** What one contract represents, in the instrument's own units. */
  unit: string;
  /**
   * Approximate initial margin per contract, in dollars.
   *
   * Exchanges revise these and brokers set their own above the exchange
   * minimum, so this is a teaching figure rather than a quote. Every screen
   * that shows it says so — a margin number presented as exact would be the
   * kind of precise-looking wrong answer this codebase keeps removing.
   */
  initialMargin: number;
  /**
   * A liquid US-listed fund that tracks the same underlying.
   *
   * There is no free source of futures history, so signals are measured on the
   * proxy, which IS in the stored daily bars. The proxy is not the contract:
   * funds holding futures roll them, and in contango that roll costs money the
   * spot price never shows. Anything built on this has to say so.
   */
  proxyEtf: string;
  /** Why the proxy and the contract can drift apart. */
  proxyCaveat: string;
};

const SPECS: FuturesSpec[] = [
  {
    symbol: "CL.COMM", root: "CL", name: "Crude oil",
    multiplier: 1_000, tickSize: 0.01, unit: "1,000 barrels",
    initialMargin: 6_000, proxyEtf: "USO",
    proxyCaveat: "USO holds crude futures and rolls them. In contango that roll costs money, so USO can fall over time while crude itself is flat.",
  },
  {
    symbol: "NG.COMM", root: "NG", name: "Natural gas",
    multiplier: 10_000, tickSize: 0.001, unit: "10,000 MMBtu",
    initialMargin: 4_500, proxyEtf: "UNG",
    proxyCaveat: "UNG rolls monthly gas futures and has historically lost a great deal to that roll. Over anything but short holds it tracks the futures curve, not the gas price.",
  },
  {
    symbol: "GC.COMM", root: "GC", name: "Gold",
    multiplier: 100, tickSize: 0.10, unit: "100 troy ounces",
    initialMargin: 12_000, proxyEtf: "GLD",
    proxyCaveat: "GLD holds physical gold, so it tracks spot closely, less a management fee. It is the closest proxy here.",
  },
  {
    symbol: "SI.COMM", root: "SI", name: "Silver",
    multiplier: 5_000, tickSize: 0.005, unit: "5,000 troy ounces",
    initialMargin: 16_000, proxyEtf: "SLV",
    proxyCaveat: "SLV holds physical silver and tracks spot closely, less a management fee.",
  },
  {
    symbol: "HG.COMM", root: "HG", name: "Copper",
    multiplier: 25_000, tickSize: 0.0005, unit: "25,000 pounds",
    initialMargin: 6_000, proxyEtf: "CPER",
    proxyCaveat: "CPER holds copper futures and rolls them, so it carries the same roll cost as any futures-backed fund.",
  },
  {
    symbol: "ES.COMM", root: "ES", name: "S&P 500 (E-mini)",
    multiplier: 50, tickSize: 0.25, unit: "$50 × the index",
    initialMargin: 15_000, proxyEtf: "SPY",
    proxyCaveat: "SPY holds the shares themselves and pays dividends; the future prices them in instead. They track closely but are not identical.",
  },
  {
    symbol: "NQ.COMM", root: "NQ", name: "Nasdaq 100 (E-mini)",
    multiplier: 20, tickSize: 0.25, unit: "$20 × the index",
    initialMargin: 22_000, proxyEtf: "QQQ",
    proxyCaveat: "QQQ holds the shares themselves and pays dividends; the future prices them in instead.",
  },
  {
    symbol: "YM.COMM", root: "YM", name: "Dow (E-mini)",
    multiplier: 5, tickSize: 1, unit: "$5 × the index",
    initialMargin: 9_000, proxyEtf: "DIA",
    proxyCaveat: "DIA holds the shares themselves and pays dividends; the future prices them in instead.",
  },
  {
    symbol: "RTY.COMM", root: "RTY", name: "Russell 2000 (E-mini)",
    multiplier: 50, tickSize: 0.10, unit: "$50 × the index",
    initialMargin: 7_500, proxyEtf: "IWM",
    proxyCaveat: "IWM holds the shares themselves and pays dividends; the future prices them in instead.",
  },
  {
    symbol: "ZB.COMM", root: "ZB", name: "30-year Treasury bond",
    multiplier: 1_000, tickSize: 1 / 32, unit: "$100,000 face value",
    initialMargin: 4_500, proxyEtf: "TLT",
    proxyCaveat: "TLT holds a basket of long Treasuries rather than the cheapest-to-deliver bond the future settles against, so the two move together without matching.",
  },
  {
    symbol: "ZN.COMM", root: "ZN", name: "10-year Treasury note",
    multiplier: 1_000, tickSize: 1 / 64, unit: "$100,000 face value",
    initialMargin: 2_000, proxyEtf: "IEF",
    proxyCaveat: "IEF holds 7–10 year Treasuries rather than the cheapest-to-deliver note the future settles against.",
  },
];

const BY_SYMBOL = new Map(SPECS.map(s => [s.symbol, s]));
const BY_ROOT = new Map(SPECS.map(s => [s.root, s]));

/** Every contract the app offers. */
export function allFutures(): readonly FuturesSpec[] {
  return SPECS;
}

/**
 * The spec for a symbol, in any form the app uses: "CL.COMM", "CL=F" or "CL".
 *
 * Null for anything that is not a known future. Callers must treat null as
 * "not a future" rather than defaulting to a multiplier of one, which is how
 * the original mistake would reappear.
 */
export function futuresSpec(symbol: string): FuturesSpec | null {
  const s = symbol.trim().toUpperCase();
  return BY_SYMBOL.get(s)
    ?? BY_ROOT.get(s.replace(/\.COMM$/, "").replace(/=F$/, ""))
    ?? null;
}

/** Money per 1.00 of price. One for anything that is not a futures contract. */
export function contractMultiplier(symbol: string): number {
  return futuresSpec(symbol)?.multiplier ?? 1;
}

/** What one tick is worth, per contract. */
export function tickValue(spec: FuturesSpec): number {
  return spec.tickSize * spec.multiplier;
}

/** The full value of the position a contract controls. */
export function notional(spec: FuturesSpec, price: number, contracts = 1): number {
  return price * spec.multiplier * contracts;
}

/** The proxy fund for each contract, for the signal side. */
export function proxySymbols(): string[] {
  return [...new Set(SPECS.map(s => s.proxyEtf))];
}
