"use client";

import { useEffect, useState } from "react";
import { loadRiskSettings, saveRiskSettings, DEFAULT_MAX_PREMIUM_PCT, type RiskSettings } from "@/app/lib/positionSizer";

// Persists to localStorage so it's set once and applies everywhere plays are shown.
export function useRiskSettings() {
  const [settings, setSettings] = useState<RiskSettings>({
    accountSize: 0,
    riskPct: 1,
    maxPremiumPct: DEFAULT_MAX_PREMIUM_PCT,
  });

  useEffect(() => {
    setSettings(loadRiskSettings());
  }, []);

  function update(next: Partial<RiskSettings>) {
    setSettings(prev => {
      const merged = { ...prev, ...next };
      saveRiskSettings(merged);
      return merged;
    });
  }

  return { settings, update };
}

export default function RiskSizerBar({
  settings,
  onChange,
}: {
  settings: RiskSettings;
  onChange: (next: Partial<RiskSettings>) => void;
}) {
  return (
    <div data-tour="risk-sizer-bar" className="mb-3 px-3 py-2.5 rounded-xl bg-[#13112A] border border-[#252345] flex items-center gap-4 flex-wrap">
      <p className="text-[9px] font-bold text-[#4B5675] uppercase tracking-widest shrink-0">Position sizer</p>
      <label className="flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
        Account $
        <input
          type="number"
          min={0}
          step={100}
          placeholder="e.g. 5000"
          value={settings.accountSize || ""}
          onChange={(e) => onChange({ accountSize: Math.max(0, Number(e.target.value) || 0) })}
          className="w-24 bg-[#0D0C1F] border border-[#252345] rounded-lg px-2 py-1 text-[#F1F5F9] font-mono text-[11px] focus:outline-none focus:border-violet-500/50"
        />
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
        Risk %/trade
        <input
          type="number"
          min={0.1}
          max={100}
          step={0.5}
          value={settings.riskPct}
          onChange={(e) => onChange({ riskPct: Math.min(100, Math.max(0.1, Number(e.target.value) || 1)) })}
          className="w-16 bg-[#0D0C1F] border border-[#252345] rounded-lg px-2 py-1 text-[#F1F5F9] font-mono text-[11px] focus:outline-none focus:border-violet-500/50"
        />
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-[#94A3B8]" title="Ceiling on total option premium as a share of the account">
        Max premium %
        <input
          type="number"
          min={1}
          max={100}
          step={5}
          value={settings.maxPremiumPct}
          onChange={(e) => onChange({ maxPremiumPct: Math.min(100, Math.max(1, Number(e.target.value) || DEFAULT_MAX_PREMIUM_PCT)) })}
          className="w-16 bg-[#0D0C1F] border border-[#252345] rounded-lg px-2 py-1 text-[#F1F5F9] font-mono text-[11px] focus:outline-none focus:border-violet-500/50"
        />
      </label>
      <p className="text-[9px] text-[#333368] leading-snug">
        {settings.accountSize > 0
          ? `Sizes every play below to the tightest of: ${settings.riskPct}% risk to stop, your buying power, and ${settings.maxPremiumPct}% of the account in premium.`
          : "Set your account size once — every play below sizes itself to it."}
      </p>
    </div>
  );
}
