import { scopedKey } from "./userState";

export type RiskSettings = { accountSize: number; riskPct: number };

const KEY = "traxora_risk_settings";
const DEFAULT_SETTINGS: RiskSettings = { accountSize: 0, riskPct: 1 };

export function loadRiskSettings(): RiskSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(scopedKey(KEY));
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      accountSize: typeof parsed.accountSize === "number" && parsed.accountSize >= 0 ? parsed.accountSize : 0,
      riskPct: typeof parsed.riskPct === "number" && parsed.riskPct > 0 ? parsed.riskPct : 1,
    };
  } catch { return DEFAULT_SETTINGS; }
}

export function saveRiskSettings(s: RiskSettings) {
  localStorage.setItem(scopedKey(KEY), JSON.stringify(s));
}

export type SizeResult = {
  contracts: number;
  maxRiskDollars: number;
  actualRiskDollars: number;
  tooExpensive: boolean;
};

// A single option contract's worst case is its full premium (100% loss is normal,
// not an edge case) — so "risk" for sizing purposes is just contracts * premium.
export function sizeOptionsPosition(
  accountSize: number,
  riskPct: number,
  premiumPerContract: number | null,
): SizeResult | null {
  if (!premiumPerContract || premiumPerContract <= 0 || accountSize <= 0) return null;
  const maxRiskDollars = accountSize * (riskPct / 100);
  const contracts = Math.floor(maxRiskDollars / premiumPerContract);
  return {
    contracts,
    maxRiskDollars,
    actualRiskDollars: contracts * premiumPerContract,
    tooExpensive: contracts < 1,
  };
}
