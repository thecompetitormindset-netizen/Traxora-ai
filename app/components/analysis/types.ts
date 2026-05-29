export type ICTAnalysis = {
  marketStructure: "Bullish" | "Bearish" | "Ranging";
  dailyBias: "Bullish" | "Bearish" | "Neutral";
  priceZone: "Premium" | "Discount" | "Equilibrium";
  orderBlock: string | null;
  fairValueGap: string | null;
  liquidity: string;
  ote: string | null;
  setup: string | null;
};

export type ICTSetup = {
  direction: "LONG" | "SHORT";
  entryFrom: string;
  entryTo: string;
  entryTrigger: string;
  stopLoss: string;
  stopReason: string;
  target1: string;
  target1Reason: string;
  target2: string;
  target2Reason: string;
  target3: string | null;
  target3Reason: string | null;
  rrRatio: string;
  invalidation: string;
  bestEntryTime: string;
};

export type DeepICT = {
  overallBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: "High" | "Medium" | "Low";
  biasReasoning: string;
  marketStructure: {
    monthly: string;
    weekly: string;
    daily: string;
    h4: string;
    recentBOS: string;
    recentChoCH: string;
    drawOnLiquidity: string;
  };
  liquidity: {
    bsl: string[];
    ssl: string[];
    dominantSide: "BSL" | "SSL" | "Equal";
    likelyTarget: string;
  };
  orderBlocks: {
    bullish: { zone: string; timeframe: string; mitigated: boolean } | null;
    bearish: { zone: string; timeframe: string; mitigated: boolean } | null;
    priceAtOB: boolean;
    note: string;
  };
  fvgs: {
    above: { zone: string; timeframe: string }[];
    below: { zone: string; timeframe: string }[];
    currentlyInFVG: boolean;
    note: string;
  };
  premiumDiscount: {
    weeklyEq: string;
    dailyEq: string;
    currentZone: "Premium" | "Discount" | "Equilibrium";
    note: string;
  };
  ote: {
    longZone: { from: string; to: string } | null;
    shortZone: { from: string; to: string } | null;
    inOTE: boolean;
  };
  keyLevels: {
    pwh: string;
    pwl: string;
    pdh: string;
    pdl: string;
    weeklyOpen: string;
    monthlyOpen: string;
    atr14: string;
    rsi14: string;
    swingHigh: string;
    swingLow: string;
    eq50: string;
  };
  killZones: { nextKillZone: string; setupNote: string };
  scenarioA: ICTSetup;
  scenarioB: ICTSetup | null;
  watchList: string[];
  risk: {
    earningsWithin5Days: boolean;
    earningsDate: string | null;
    majorEventThisWeek: boolean;
    majorEvent: string | null;
    ivElevated: boolean;
    lowLiquidity: boolean;
  };
  noTrade: boolean;
  noTradeNote: string | null;
};

export type AIAnalysis = {
  signal: "BUY" | "HOLD" | "SELL";
  confidence: "High" | "Medium" | "Low";
  summary: string;
  keyPoints: string[];
  risk: "Low" | "Medium" | "High";
  ict?: ICTAnalysis;
};

export function signalStyle(signal: string) {
  if (signal === "BUY")  return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (signal === "SELL") return "bg-rose-500/20 text-rose-400 border-rose-500/30";
  return "bg-amber-500/20 text-amber-400 border-amber-500/30";
}

export function riskStyle(risk: string) {
  if (risk === "Low")  return "text-emerald-400";
  if (risk === "High") return "text-rose-400";
  return "text-amber-400";
}

export function confidenceStyle(confidence: string) {
  if (confidence === "High") return "text-emerald-400";
  if (confidence === "Low")  return "text-rose-400";
  return "text-amber-400";
}
