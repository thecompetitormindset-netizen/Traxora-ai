"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Sidebar from "@/app/components/Sidebar";
import Topbar from "@/app/components/Topbar";
import dynamic from "next/dynamic";
const StockChart = dynamic(() => import("@/app/components/StockChart"), {
  ssr: false,
});
import ComparisonPanel from "@/app/components/ComparisonPanel";
import MarketStatus from "@/app/components/MarketStatus";

type ICTAnalysis = {
  marketStructure: "Bullish" | "Bearish" | "Ranging";
  dailyBias: "Bullish" | "Bearish" | "Neutral";
  priceZone: "Premium" | "Discount" | "Equilibrium";
  orderBlock: string | null;
  fairValueGap: string | null;
  liquidity: string;
  ote: string | null;
  setup: string | null;
};

type ICTSetup = {
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

type DeepICT = {
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

type AIAnalysis = {
  signal: "BUY" | "HOLD" | "SELL";
  confidence: "High" | "Medium" | "Low";
  summary: string;
  keyPoints: string[];
  risk: "Low" | "Medium" | "High";
  ict?: ICTAnalysis;
};

function signalStyle(signal: string) {
  if (signal === "BUY")
    return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (signal === "SELL")
    return "bg-rose-500/20 text-rose-400 border-rose-500/30";
  return "bg-amber-500/20 text-amber-400 border-amber-500/30";
}

function riskStyle(risk: string) {
  if (risk === "Low") return "text-emerald-400";
  if (risk === "High") return "text-rose-400";
  return "text-amber-400";
}

function confidenceStyle(confidence: string) {
  if (confidence === "High") return "text-emerald-400";
  if (confidence === "Low") return "text-rose-400";
  return "text-amber-400";
}

// ── Deep ICT Analysis Panel ───────────────────────────────────────────────────

function SetupCard({
  setup,
  label,
  color,
}: {
  setup: ICTSetup;
  label: string;
  color: "emerald" | "rose";
}) {
  const c =
    color === "emerald"
      ? {
          border: "border-emerald-500/20",
          bg: "bg-emerald-500/5",
          txt: "text-emerald-400",
          badge: "bg-emerald-500/15 border-emerald-500/25 text-emerald-400",
        }
      : {
          border: "border-rose-500/20",
          bg: "bg-rose-500/5",
          txt: "text-rose-400",
          badge: "bg-rose-500/15 border-rose-500/25 text-rose-400",
        };

  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-5 space-y-3`}>
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border ${c.badge}`}
        >
          {label}
        </span>
        <span className={`text-sm font-black ${c.txt}`}>{setup.direction}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[
          {
            label: "Entry Zone",
            value: `${setup.entryFrom} – ${setup.entryTo}`,
            color: "text-[#F1F5F9]",
          },
          { label: "Stop Loss", value: setup.stopLoss, color: "text-rose-400" },
          {
            label: "R:R Ratio",
            value: setup.rrRatio,
            color: "text-emerald-400",
          },
          {
            label: "Target 1",
            value: setup.target1,
            color: "text-emerald-400",
          },
          {
            label: "Target 2",
            value: setup.target2,
            color: "text-emerald-400",
          },
          ...(setup.target3
            ? [
                {
                  label: "Target 3",
                  value: setup.target3,
                  color: "text-emerald-400",
                },
              ]
            : []),
        ].map((item) => (
          <div key={item.label} className="bg-[#060A14] rounded-xl p-2.5">
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-0.5">
              {item.label}
            </p>
            <p className={`text-xs font-black font-mono ${item.color}`}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 text-xs text-[#7B8DB4] leading-relaxed">
        <p>
          <span className="text-[#4B5675] font-semibold">Trigger: </span>
          {setup.entryTrigger}
        </p>
        <p>
          <span className="text-[#4B5675] font-semibold">SL reason: </span>
          {setup.stopReason}
        </p>
        {setup.target1Reason && (
          <p>
            <span className="text-[#4B5675] font-semibold">T1 — </span>
            {setup.target1Reason}
          </p>
        )}
        {setup.target2Reason && (
          <p>
            <span className="text-[#4B5675] font-semibold">T2 — </span>
            {setup.target2Reason}
          </p>
        )}
        {setup.target3 && setup.target3Reason && (
          <p>
            <span className="text-[#4B5675] font-semibold">T3 — </span>
            {setup.target3Reason}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3 pt-1 border-t border-white/5 text-[10px]">
        <span className="text-[#4B5675]">
          Best entry:{" "}
          <span className="text-indigo-400 font-semibold">
            {setup.bestEntryTime}
          </span>
        </span>
        <span className="text-[#4B5675]">
          Invalidation:{" "}
          <span className="text-rose-400 font-semibold">
            {setup.invalidation}
          </span>
        </span>
      </div>
    </div>
  );
}

function ICTRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[#1C2333] last:border-0">
      <span className="text-[10px] text-[#4B5675] uppercase tracking-widest shrink-0 mt-0.5 w-28">
        {label}
      </span>
      <span
        className={`text-xs font-mono font-semibold text-right ${accent ?? "text-[#F1F5F9]"}`}
      >
        {value}
      </span>
    </div>
  );
}

function SectionHead({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-base shrink-0">{icon}</span>
      <span className="text-[10px] font-black text-[#7B8DB4] uppercase tracking-widest">
        {label}
      </span>
      <div className="flex-1 h-px bg-[#1C2333]" />
    </div>
  );
}

function DeepICTPanel({ data, symbol }: { data: DeepICT; symbol: string }) {
  const clean = symbol.replace(".US", "").replace(".COMM", "");
  const biasColor =
    data.overallBias === "BULLISH"
      ? "text-emerald-400"
      : data.overallBias === "BEARISH"
        ? "text-rose-400"
        : "text-amber-400";
  const biasRing =
    data.overallBias === "BULLISH"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : data.overallBias === "BEARISH"
        ? "border-rose-500/30 bg-rose-500/5"
        : "border-amber-500/30 bg-amber-500/5";
  const zoneCls =
    data.premiumDiscount.currentZone === "Premium"
      ? "text-rose-400"
      : data.premiumDiscount.currentZone === "Discount"
        ? "text-emerald-400"
        : "text-amber-400";

  return (
    <div className="mt-6 bg-[#0C1017] border border-[#1C2333] rounded-3xl overflow-hidden">
      {/* Header */}
      <div
        className={`flex items-center justify-between px-6 py-4 border-b border-[#1C2333] ${biasRing} border-b-0`}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎯</span>
          <div>
            <p className="font-bold text-[#F1F5F9]">
              Deep ICT Analysis — {clean}
            </p>
            <p className="text-[10px] text-[#4B5675] mt-0.5">
              Institutional Smart Money Framework · ICT methodology
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-black px-2.5 py-1 rounded-lg border ${biasRing} ${biasColor}`}
          >
            {data.overallBias}
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
              data.confidence === "High"
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                : data.confidence === "Medium"
                  ? "border-amber-500/25 bg-amber-500/10 text-amber-400"
                  : "border-rose-500/25 bg-rose-500/10 text-rose-400"
            }`}
          >
            {data.confidence} conf.
          </span>
        </div>
      </div>

      <div className="p-6 space-y-7">
        {/* No-trade notice */}
        {data.noTrade && data.noTradeNote && (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl px-5 py-4">
            <p className="text-sm font-bold text-amber-400 mb-1">
              ⚠ No Valid Setup Today
            </p>
            <p className="text-xs text-[#CBD5E1] leading-relaxed">
              {data.noTradeNote}
            </p>
          </div>
        )}

        {/* Bias reasoning */}
        <div className={`rounded-2xl border px-5 py-4 ${biasRing}`}>
          <p
            className={`text-xs font-black uppercase tracking-widest mb-1.5 ${biasColor}`}
          >
            Directional Bias · {data.overallBias}
          </p>
          <p className="text-sm text-[#CBD5E1] leading-relaxed">
            {data.biasReasoning}
          </p>
        </div>

        {/* Market Structure + Key Levels side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Market Structure */}
          <div>
            <SectionHead icon="📐" label="Market Structure" />
            <div className="bg-[#060A14] border border-[#1C2333] rounded-2xl p-4 space-y-0">
              {[
                { label: "Monthly", value: data.marketStructure.monthly },
                { label: "Weekly", value: data.marketStructure.weekly },
                { label: "Daily", value: data.marketStructure.daily },
                { label: "4H (inferred)", value: data.marketStructure.h4 },
                { label: "Recent BOS", value: data.marketStructure.recentBOS },
                { label: "ChoCH/MSS", value: data.marketStructure.recentChoCH },
              ].map((r) => (
                <ICTRow key={r.label} label={r.label} value={r.value} />
              ))}
            </div>
            <div className="mt-2 bg-indigo-500/5 border border-indigo-500/15 rounded-xl px-4 py-2.5">
              <p className="text-[8px] text-indigo-400 font-black uppercase tracking-widest mb-0.5">
                Draw on Liquidity
              </p>
              <p className="text-xs text-[#CBD5E1]">
                {data.marketStructure.drawOnLiquidity}
              </p>
            </div>
          </div>

          {/* Key Levels */}
          <div>
            <SectionHead icon="📊" label="Key Price Levels" />
            <div className="bg-[#060A14] border border-[#1C2333] rounded-2xl p-4 space-y-0">
              {[
                {
                  label: "Swing High",
                  value: data.keyLevels.swingHigh,
                  accent: "text-emerald-400",
                },
                {
                  label: "Swing Low",
                  value: data.keyLevels.swingLow,
                  accent: "text-rose-400",
                },
                {
                  label: "50% Eq",
                  value: data.keyLevels.eq50,
                  accent: "text-amber-400",
                },
                {
                  label: "Prev Week Hi",
                  value: data.keyLevels.pwh,
                  accent: "text-emerald-400",
                },
                {
                  label: "Prev Week Lo",
                  value: data.keyLevels.pwl,
                  accent: "text-rose-400",
                },
                { label: "Prev Day Hi", value: data.keyLevels.pdh },
                { label: "Prev Day Lo", value: data.keyLevels.pdl },
                { label: "Weekly Open", value: data.keyLevels.weeklyOpen },
                { label: "Monthly Open", value: data.keyLevels.monthlyOpen },
                {
                  label: "ATR (14d)",
                  value: data.keyLevels.atr14,
                  accent: "text-indigo-400",
                },
                {
                  label: "RSI (14d)",
                  value: data.keyLevels.rsi14,
                  accent:
                    Number(data.keyLevels.rsi14) > 70
                      ? "text-rose-400"
                      : Number(data.keyLevels.rsi14) < 30
                        ? "text-emerald-400"
                        : "text-amber-400",
                },
              ].map((r) => (
                <ICTRow
                  key={r.label}
                  label={r.label}
                  value={r.value}
                  accent={r.accent}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Liquidity + OB + FVG */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Liquidity */}
          <div>
            <SectionHead icon="💧" label="Liquidity Pools" />
            <div className="space-y-2">
              <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3">
                <p className="text-[8px] text-emerald-400 font-black uppercase tracking-widest mb-1.5">
                  Buy-Side (BSL)
                </p>
                {data.liquidity.bsl.map((l, i) => (
                  <p key={i} className="text-[10px] text-[#CBD5E1]">
                    ▲ {l}
                  </p>
                ))}
              </div>
              <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl p-3">
                <p className="text-[8px] text-rose-400 font-black uppercase tracking-widest mb-1.5">
                  Sell-Side (SSL)
                </p>
                {data.liquidity.ssl.map((l, i) => (
                  <p key={i} className="text-[10px] text-[#CBD5E1]">
                    ▼ {l}
                  </p>
                ))}
              </div>
              <div className="bg-[#060A14] border border-indigo-500/15 rounded-xl p-3">
                <p className="text-[8px] text-indigo-400 font-black uppercase tracking-widest mb-1">
                  Likely Target
                </p>
                <p className="text-[10px] text-[#CBD5E1]">
                  {data.liquidity.likelyTarget}
                </p>
              </div>
            </div>
          </div>

          {/* Order Blocks */}
          <div>
            <SectionHead icon="📦" label="Order Blocks" />
            <div className="space-y-2">
              {data.orderBlocks.bullish && (
                <div
                  className={`rounded-xl p-3 border ${data.orderBlocks.bullish.mitigated ? "border-[#1C2333] opacity-50" : "border-emerald-500/20 bg-emerald-500/5"}`}
                >
                  <p className="text-[8px] text-emerald-400 font-black uppercase tracking-widest mb-1">
                    Bullish OB · {data.orderBlocks.bullish.timeframe}
                  </p>
                  <p className="text-xs font-mono text-[#F1F5F9]">
                    {data.orderBlocks.bullish.zone}
                  </p>
                  {data.orderBlocks.bullish.mitigated && (
                    <p className="text-[9px] text-[#4B5675] mt-0.5">
                      Mitigated
                    </p>
                  )}
                </div>
              )}
              {data.orderBlocks.bearish && (
                <div
                  className={`rounded-xl p-3 border ${data.orderBlocks.bearish.mitigated ? "border-[#1C2333] opacity-50" : "border-rose-500/20 bg-rose-500/5"}`}
                >
                  <p className="text-[8px] text-rose-400 font-black uppercase tracking-widest mb-1">
                    Bearish OB · {data.orderBlocks.bearish.timeframe}
                  </p>
                  <p className="text-xs font-mono text-[#F1F5F9]">
                    {data.orderBlocks.bearish.zone}
                  </p>
                  {data.orderBlocks.bearish.mitigated && (
                    <p className="text-[9px] text-[#4B5675] mt-0.5">
                      Mitigated
                    </p>
                  )}
                </div>
              )}
              {data.orderBlocks.priceAtOB && (
                <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
                  <p className="text-[9px] text-amber-400 font-bold">
                    ⚡ Price currently AT order block
                  </p>
                </div>
              )}
              <p className="text-[10px] text-[#7B8DB4] leading-relaxed">
                {data.orderBlocks.note}
              </p>
            </div>
          </div>

          {/* FVGs */}
          <div>
            <SectionHead icon="⬜" label="Fair Value Gaps" />
            <div className="space-y-2">
              {data.fvgs.above.length > 0 && (
                <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3">
                  <p className="text-[8px] text-emerald-400 font-black uppercase tracking-widest mb-1.5">
                    Above (draw up)
                  </p>
                  {data.fvgs.above.map((f, i) => (
                    <p key={i} className="text-[10px] text-[#CBD5E1] font-mono">
                      ▲ {f.zone}{" "}
                      <span className="text-[#4B5675]">({f.timeframe})</span>
                    </p>
                  ))}
                </div>
              )}
              {data.fvgs.below.length > 0 && (
                <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl p-3">
                  <p className="text-[8px] text-rose-400 font-black uppercase tracking-widest mb-1.5">
                    Below (draw down)
                  </p>
                  {data.fvgs.below.map((f, i) => (
                    <p key={i} className="text-[10px] text-[#CBD5E1] font-mono">
                      ▼ {f.zone}{" "}
                      <span className="text-[#4B5675]">({f.timeframe})</span>
                    </p>
                  ))}
                </div>
              )}
              {data.fvgs.currentlyInFVG && (
                <div className="bg-indigo-500/10 border border-indigo-500/25 rounded-xl px-3 py-2">
                  <p className="text-[9px] text-indigo-400 font-bold">
                    ⚡ Price currently inside FVG
                  </p>
                </div>
              )}
              <p className="text-[10px] text-[#7B8DB4] leading-relaxed">
                {data.fvgs.note}
              </p>
            </div>
          </div>
        </div>

        {/* Premium/Discount + OTE + Kill Zone */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#060A14] border border-[#1C2333] rounded-2xl p-4">
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-2">
              Premium / Discount
            </p>
            <p className={`text-lg font-black mb-1 ${zoneCls}`}>
              {data.premiumDiscount.currentZone}
            </p>
            <p className="text-[9px] text-[#4B5675] mb-2">
              Weekly eq:{" "}
              <span className="text-[#CBD5E1]">
                {data.premiumDiscount.weeklyEq}
              </span>
            </p>
            <p className="text-[9px] text-[#4B5675] mb-3">
              Daily eq:{" "}
              <span className="text-[#CBD5E1]">
                {data.premiumDiscount.dailyEq}
              </span>
            </p>
            <p className="text-[10px] text-[#7B8DB4] leading-relaxed">
              {data.premiumDiscount.note}
            </p>
          </div>

          <div className="bg-[#060A14] border border-[#1C2333] rounded-2xl p-4">
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-2">
              OTE Zones (Fibonacci)
            </p>
            {data.ote.longZone && (
              <div className="mb-2">
                <p className="text-[8px] text-emerald-400 font-bold uppercase tracking-widest mb-0.5">
                  Long OTE (0.705–0.79)
                </p>
                <p className="text-xs font-mono text-[#F1F5F9]">
                  {data.ote.longZone.from} – {data.ote.longZone.to}
                </p>
              </div>
            )}
            {data.ote.shortZone && (
              <div className="mb-2">
                <p className="text-[8px] text-rose-400 font-bold uppercase tracking-widest mb-0.5">
                  Short OTE (0.705–0.79)
                </p>
                <p className="text-xs font-mono text-[#F1F5F9]">
                  {data.ote.shortZone.from} – {data.ote.shortZone.to}
                </p>
              </div>
            )}
            {data.ote.inOTE && (
              <div className="mt-2 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-1.5">
                <p className="text-[9px] text-amber-400 font-bold">
                  Price currently in OTE zone
                </p>
              </div>
            )}
          </div>

          <div className="bg-[#060A14] border border-[#1C2333] rounded-2xl p-4">
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-2">
              Kill Zones
            </p>
            <p className="text-xs font-bold text-indigo-400 mb-2">
              {data.killZones.nextKillZone}
            </p>
            <p className="text-[10px] text-[#7B8DB4] leading-relaxed">
              {data.killZones.setupNote}
            </p>
          </div>
        </div>

        {/* Trade Scenarios */}
        {!data.noTrade && (
          <div className="space-y-4">
            <SectionHead icon="🎯" label="Trade Setups" />
            <SetupCard
              setup={data.scenarioA}
              label="Scenario A — Primary"
              color={data.scenarioA.direction === "LONG" ? "emerald" : "rose"}
            />
            {data.scenarioB && (
              <SetupCard
                setup={data.scenarioB}
                label="Scenario B — Alternative"
                color={data.scenarioB.direction === "LONG" ? "emerald" : "rose"}
              />
            )}
          </div>
        )}

        {/* Watch + Risk */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <SectionHead icon="👁" label="What to Watch" />
            <ul className="space-y-2">
              {data.watchList.map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-indigo-400 shrink-0 mt-0.5 text-xs">
                    ›
                  </span>
                  <p className="text-xs text-[#7B8DB4] leading-relaxed">{w}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <SectionHead icon="⚠️" label="Risk Warnings" />
            <div className="space-y-2">
              {[
                {
                  label: "Earnings ≤5 days",
                  value: data.risk.earningsWithin5Days
                    ? `Yes — ${data.risk.earningsDate ?? "check"}`
                    : "No",
                  warn: data.risk.earningsWithin5Days,
                },
                {
                  label: "Major event",
                  value: data.risk.majorEventThisWeek
                    ? (data.risk.majorEvent ?? "Yes")
                    : "None",
                  warn: data.risk.majorEventThisWeek,
                },
                {
                  label: "IV elevated",
                  value: data.risk.ivElevated
                    ? "Yes — caution on options"
                    : "No",
                  warn: data.risk.ivElevated,
                },
                {
                  label: "Low liquidity",
                  value: data.risk.lowLiquidity ? "Yes — wider spreads" : "No",
                  warn: data.risk.lowLiquidity,
                },
              ].map((r) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-[#4B5675]">{r.label}</span>
                  <span
                    className={
                      r.warn
                        ? "text-rose-400 font-semibold"
                        : "text-emerald-400"
                    }
                  >
                    {r.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-[10px] text-[#2D3A50] text-center border-t border-[#1C2333] pt-4">
          ICT analysis based on Michael J. Huddleston's Smart Money methodology
          · Educational purposes only · Not financial advice
        </p>
      </div>
    </div>
  );
}

// ── Main Analysis Component ───────────────────────────────────────────────────

function AnalysisContent() {
  const searchParams = useSearchParams();
  const symbol = searchParams.get("symbol") || "AAPL.US";

  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const [deepICT, setDeepICT] = useState<DeepICT | null>(null);
  const [loadingDeep, setLoadingDeep] = useState(false);
  const [deepError, setDeepError] = useState<string | null>(null);

  async function runDeepICT() {
    setLoadingDeep(true);
    setDeepError(null);
    setDeepICT(null);
    try {
      const res = await fetch("/api/ai/ict-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const data = await res.json();
      if (data.reason === "AI_UNAVAILABLE") {
        setDeepError("AI unavailable — check your Anthropic API key in settings.");
        return;
      }
      if (!res.ok || data.error) {
        setDeepError(data.error ?? "Analysis failed");
        return;
      }
      setDeepICT(data as DeepICT);
    } catch (e) {
      setDeepError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoadingDeep(false);
    }
  }

  // Alpaca trade state
  const [tradeQty, setTradeQty] = useState("1");
  const [tradeStatus, setTradeStatus] = useState<"idle" | "placing" | string>(
    "idle",
  );
  const [tradeResult, setTradeResult] = useState<{
    orderId: string;
    symbol: string;
    side: string;
    qty: string;
    status: string;
  } | null>(null);

  async function executeAlpacaTrade(side: "buy" | "sell") {
    const saved = localStorage.getItem("traxora_alpaca");
    if (!saved) {
      setTradeStatus(
        "No Alpaca account connected — go to Settings → Broker Connection",
      );
      return;
    }
    const { apiKey, apiSecret, paper } = JSON.parse(saved);
    if (!apiKey || !apiSecret) {
      setTradeStatus(
        "No Alpaca account connected — go to Settings → Broker Connection",
      );
      return;
    }
    setTradeStatus("placing");
    setTradeResult(null);
    try {
      const res = await fetch("/api/alpaca/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          apiSecret,
          paper,
          symbol,
          side,
          qty: Number(tradeQty),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTradeStatus(data.error || "Order failed");
        return;
      }
      setTradeResult(data);
      setTradeStatus("done");
    } catch {
      setTradeStatus("Network error — check your connection");
    }
  }

  const [quoteData, setQuoteData] = useState<{
    price: number | null;
    previousClose: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
  }>({ price: null, previousClose: null, open: null, high: null, low: null });

  useEffect(() => {
    setAnalysis(null);
    setQuoteData({
      price: null,
      previousClose: null,
      open: null,
      high: null,
      low: null,
    });

    async function fetchAndAnalyze() {
      setLoadingAnalysis(true);
      try {
        const res = await fetch(
          `/api/quote?symbol=${encodeURIComponent(symbol)}`,
        );
        const data = await res.json();

        const price = data?.price ?? null;
        const previousClose = data?.previousClose ?? null;
        const open = data?.open ?? null;
        const high = data?.high ?? null;
        const low = data?.low ?? null;
        const dayChangePercent =
          price && previousClose
            ? ((price - previousClose) / previousClose) * 100
            : null;

        setQuoteData({ price, previousClose, open, high, low });

        if (price && previousClose) {
          const analyzeRes = await fetch("/api/ai/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              symbol,
              price,
              previousClose,
              open,
              high,
              low,
              dayChangePercent,
            }),
          });
          const result = await analyzeRes.json();
          if (result?.signal) setAnalysis(result);
        }
      } catch {
        // analysis stays null
      } finally {
        setLoadingAnalysis(false);
      }
    }

    fetchAndAnalyze();
  }, [symbol]);

  const dayChange =
    quoteData.price && quoteData.previousClose
      ? ((quoteData.price - quoteData.previousClose) /
          quoteData.previousClose) *
        100
      : null;

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-6 xl:p-8 pb-28">
        <Topbar />
        <div className="max-w-6xl mx-auto w-full">
          <div className="mt-6 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-4xl font-bold">
                {symbol.replace(".US", "").replace(".COMM", "")} Analysis
              </h1>
              <p className="text-[#7B8DB4] mt-2">
                AI-powered ICT signal for {symbol}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <MarketStatus />
              {analysis && (
                <button
                  type="button"
                  onClick={() => {
                    const url = window.location.href;
                    const text = `Traxora AI just fired a ${analysis.signal} signal on ${symbol.replace(".US", "").replace(".COMM", "")} with ${analysis.confidence} confidence.\n\nFree ICT trading signals → ${window.location.origin}`;
                    navigator.clipboard
                      .writeText(`${text}\n\n${url}`)
                      .then(() => {
                        const btn = document.getElementById("share-btn");
                        if (btn) {
                          btn.textContent = "Copied!";
                          setTimeout(() => {
                            btn.textContent = "Share Signal";
                          }, 2000);
                        }
                      });
                  }}
                  id="share-btn"
                  className="bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 text-indigo-400 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                >
                  Share Signal
                </button>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-col xl:flex-row gap-6">
            {/* Chart — left */}
            <div className="flex-1 min-w-0">
              <StockChart symbol={symbol} height={520} defaultInterval="D" />
            </div>

            {/* AI Panel — right */}
            <div className="xl:w-[340px] shrink-0 flex flex-col gap-4">
              {/* Signal Card */}
              <div className="bg-[#0C1017] rounded-3xl p-6 border border-[#1C2333]">
                <p className="text-xs text-[#4B5675] uppercase tracking-widest mb-3">
                  Traxora AI Signal
                </p>

                {loadingAnalysis && (
                  <div className="space-y-3 animate-pulse">
                    <div className="h-12 bg-[#1F2937] rounded-xl" />
                    <div className="h-4 bg-[#1F2937] rounded w-3/4" />
                    <div className="h-4 bg-[#1F2937] rounded w-1/2" />
                  </div>
                )}

                {!loadingAnalysis && analysis && (
                  <>
                    <span
                      className={`inline-block text-2xl font-bold px-4 py-2 rounded-xl border ${signalStyle(analysis.signal)}`}
                    >
                      {analysis.signal}
                    </span>

                    <div className="flex items-center gap-6 mt-4">
                      <div>
                        <p className="text-xs text-[#4B5675]">Confidence</p>
                        <p
                          className={`text-sm font-semibold mt-0.5 ${confidenceStyle(analysis.confidence)}`}
                        >
                          {analysis.confidence}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#4B5675]">Risk Level</p>
                        <p
                          className={`text-sm font-semibold mt-0.5 ${riskStyle(analysis.risk)}`}
                        >
                          {analysis.risk}
                        </p>
                      </div>
                    </div>

                    <p className="text-sm text-[#CBD5E1] mt-4 leading-relaxed">
                      {analysis.summary}
                    </p>
                  </>
                )}

                {!loadingAnalysis && !analysis && (
                  <p className="text-sm text-[#4B5675]">
                    Unable to generate signal. Market data may be unavailable.
                  </p>
                )}
              </div>

              {/* Alpaca Trade Button */}
              {!loadingAnalysis && analysis && analysis.signal !== "HOLD" && (
                <div
                  className={`rounded-3xl p-5 border ${
                    analysis.signal === "BUY"
                      ? "bg-emerald-950/30 border-emerald-500/25"
                      : "bg-rose-950/30 border-rose-500/25"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={analysis.signal === "BUY" ? "#10B981" : "#F43F5E"}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <p
                      className={`text-[10px] font-bold uppercase tracking-widest ${analysis.signal === "BUY" ? "text-emerald-400" : "text-rose-400"}`}
                    >
                      Execute on Alpaca
                    </p>
                  </div>

                  <p className="text-xs text-[#7B8DB4] mb-3 leading-relaxed">
                    Connected to Alpaca? Send a{" "}
                    <span
                      className={`font-semibold ${analysis.signal === "BUY" ? "text-emerald-400" : "text-rose-400"}`}
                    >
                      market {analysis.signal.toLowerCase()} order
                    </span>{" "}
                    for{" "}
                    <strong className="text-[#F1F5F9]">
                      {symbol.replace(".US", "").replace(".COMM", "")}
                    </strong>{" "}
                    in one tap.
                  </p>

                  <div className="flex items-center gap-2 mb-3">
                    <label className="text-xs text-[#4B5675] shrink-0">
                      Qty (shares):
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={tradeQty}
                      onChange={(e) => setTradeQty(e.target.value)}
                      aria-label="Number of shares to trade"
                      className="w-20 bg-[#060A14]/80 border border-[#1C2333] rounded-lg px-2.5 py-1.5 text-sm text-[#F1F5F9] outline-none focus:border-indigo-500/50 text-center"
                    />
                    {quoteData.price && (
                      <span className="text-xs text-[#4B5675]">
                        ≈ $
                        {(quoteData.price * Number(tradeQty)).toLocaleString(
                          undefined,
                          { maximumFractionDigits: 0 },
                        )}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={tradeStatus === "placing"}
                    onClick={() =>
                      executeAlpacaTrade(
                        analysis.signal === "BUY" ? "buy" : "sell",
                      )
                    }
                    className={`w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 ${
                      analysis.signal === "BUY"
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                        : "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                    }`}
                  >
                    {tradeStatus === "placing"
                      ? "Placing order…"
                      : `${analysis.signal === "BUY" ? "BUY" : "SELL"} ${tradeQty} share${Number(tradeQty) !== 1 ? "s" : ""} on Alpaca`}
                  </button>

                  {tradeStatus !== "idle" &&
                    tradeStatus !== "placing" &&
                    tradeStatus !== "done" && (
                      <p className="text-xs text-rose-400 mt-2 text-center">
                        {tradeStatus}
                      </p>
                    )}
                  {tradeStatus === "done" && tradeResult && (
                    <div className="mt-3 bg-[#060A14]/60 border border-emerald-500/20 rounded-xl px-3 py-2.5 text-xs space-y-1">
                      <p className="text-emerald-400 font-semibold">
                        ✓ Order placed successfully
                      </p>
                      <p className="text-[#7B8DB4]">
                        Symbol:{" "}
                        <span className="text-[#F1F5F9]">
                          {tradeResult.symbol}
                        </span>
                      </p>
                      <p className="text-[#7B8DB4]">
                        Qty:{" "}
                        <span className="text-[#F1F5F9]">
                          {tradeResult.qty} shares
                        </span>
                      </p>
                      <p className="text-[#7B8DB4]">
                        Status:{" "}
                        <span className="text-[#F1F5F9] capitalize">
                          {tradeResult.status}
                        </span>
                      </p>
                      <p className="text-[#7B8DB4] font-mono text-[10px]">
                        ID: {tradeResult.orderId.slice(0, 8)}…
                      </p>
                    </div>
                  )}

                  <p className="text-[10px] text-[#4B5675] text-center mt-2">
                    Not connected?{" "}
                    <a
                      href="/settings"
                      className="text-indigo-400 hover:underline"
                    >
                      Settings → Broker Connection
                    </a>
                  </p>
                </div>
              )}

              {/* Webull affiliate CTA */}
              {!loadingAnalysis && analysis && (
                <div className="bg-[#0C1017] rounded-3xl p-5 border border-[#1C2333]">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[#4B5675] mb-3">
                    Ready to act on this signal?
                  </p>

                  {/* Steps */}
                  <div className="space-y-2.5 mb-4">
                    {[
                      { n: "1", text: "Open a free Webull account" },
                      { n: "2", text: "Get up to 12 free stocks 🎁" },
                      { n: "3", text: "Place your trade in minutes" },
                    ].map((step) => (
                      <div key={step.n} className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-indigo-500/15 border border-indigo-500/25 text-indigo-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                          {step.n}
                        </span>
                        <p className="text-xs text-[#CBD5E1]">{step.text}</p>
                      </div>
                    ))}
                  </div>

                  {/* CTA button */}
                  <a
                    href="https://a.webull.com/i/YOUR_AFFILIATE_CODE"
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold transition-all ${
                      analysis.signal === "BUY"
                        ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20"
                        : analysis.signal === "SELL"
                          ? "bg-rose-500 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/20"
                          : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                    }`}
                  >
                    {analysis.signal === "BUY"
                      ? "Buy"
                      : analysis.signal === "SELL"
                        ? "Sell"
                        : "Trade"}{" "}
                    {symbol.replace(".US", "").replace(".COMM", "")} on Webull
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="7" y1="17" x2="17" y2="7" />
                      <polyline points="7 7 17 7 17 17" />
                    </svg>
                  </a>

                  {/* Trust badges */}
                  <div className="flex items-center justify-center gap-3 mt-3">
                    {["Commission-free", "SIPC insured", "5-min setup"].map(
                      (badge) => (
                        <span
                          key={badge}
                          className="text-[10px] text-[#4B5675] flex items-center gap-1"
                        >
                          <span className="text-emerald-500">✓</span> {badge}
                        </span>
                      ),
                    )}
                  </div>

                  <p className="text-[10px] text-[#4B5675] text-center mt-2 opacity-50">
                    Affiliate link — we may earn a commission
                  </p>
                </div>
              )}

              {/* Robinhood how-to guide */}
              {!loadingAnalysis && analysis && (
                <div className="bg-[#0C1017] rounded-3xl border border-[#1C2333] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setGuideOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#111827] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">📱</span>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-[#F1F5F9]">
                          How to trade this on Robinhood
                        </p>
                        <p className="text-[11px] text-[#4B5675] mt-0.5">
                          Step-by-step for beginners
                        </p>
                      </div>
                    </div>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#4B5675"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`shrink-0 transition-transform ${guideOpen ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {guideOpen && (
                    <div className="px-5 pb-5 border-t border-[#1C2333]">
                      {analysis.signal === "BUY" && (
                        <ol className="mt-4 space-y-4">
                          {[
                            {
                              emoji: "🔍",
                              title: "Search the stock",
                              desc: `Open Robinhood → tap the search bar → type "${symbol.replace(".US", "").replace(".COMM", "")}"`,
                            },
                            {
                              emoji: "💵",
                              title: "Choose your amount",
                              desc: 'Tap Buy → choose "Dollars" → start small (e.g. $25–$100). Never invest more than you can afford to lose.',
                            },
                            {
                              emoji: "⚡",
                              title: "Place a market order",
                              desc: 'Leave order type as "Market" so it buys instantly at the current price. Tap Review → Submit.',
                            },
                            {
                              emoji: "🛡️",
                              title: "Set a stop-loss",
                              desc: "After buying, go back to the stock → Trade → Sell → Stop Loss. Set it 4–5% below your buy price to cap your downside.",
                            },
                            {
                              emoji: "⏳",
                              title: "Wait for the SELL signal",
                              desc: "Hold your position. When Traxora AI fires a SELL signal, come back here and follow the sell steps.",
                            },
                          ].map((step, i) => (
                            <li key={i} className="flex gap-3">
                              <span className="text-base shrink-0 mt-0.5">
                                {step.emoji}
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-[#F1F5F9]">
                                  {step.title}
                                </p>
                                <p className="text-xs text-[#7B8DB4] mt-0.5 leading-relaxed">
                                  {step.desc}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}

                      {analysis.signal === "SELL" && (
                        <ol className="mt-4 space-y-4">
                          {[
                            {
                              emoji: "📂",
                              title: "Open your portfolio",
                              desc: `Tap the person icon → Portfolio → find ${symbol.replace(".US", "").replace(".COMM", "")}.`,
                            },
                            {
                              emoji: "💸",
                              title: "Tap Trade → Sell",
                              desc: 'Choose how many shares to sell. To exit fully, tap "Sell All Shares".',
                            },
                            {
                              emoji: "✅",
                              title: "Submit the order",
                              desc: 'Leave order type as "Market" → Review → Submit. Your shares sell at the current price.',
                            },
                            {
                              emoji: "📊",
                              title: "Review your result",
                              desc: "Go to History to see your profit or loss. Use it as a learning moment regardless of outcome.",
                            },
                          ].map((step, i) => (
                            <li key={i} className="flex gap-3">
                              <span className="text-base shrink-0 mt-0.5">
                                {step.emoji}
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-[#F1F5F9]">
                                  {step.title}
                                </p>
                                <p className="text-xs text-[#7B8DB4] mt-0.5 leading-relaxed">
                                  {step.desc}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}

                      {analysis.signal === "HOLD" && (
                        <div className="mt-4 space-y-3">
                          <div className="flex gap-3">
                            <span className="text-base shrink-0">⏸️</span>
                            <div>
                              <p className="text-sm font-semibold text-[#F1F5F9]">
                                No action needed
                              </p>
                              <p className="text-xs text-[#7B8DB4] mt-0.5 leading-relaxed">
                                The AI sees no clear edge right now. If you
                                already own this stock, keep holding. If you
                                don&apos;t own it, wait for a BUY signal before
                                entering.
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <span className="text-base shrink-0">🔔</span>
                            <div>
                              <p className="text-sm font-semibold text-[#F1F5F9]">
                                Enable push alerts
                              </p>
                              <p className="text-xs text-[#7B8DB4] mt-0.5 leading-relaxed">
                                Go to the Alerts page and enable notifications —
                                you&apos;ll get a ping the moment the signal
                                flips to BUY or SELL.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-5 pt-4 border-t border-[#1C2333] flex gap-2">
                        <span className="text-amber-400 shrink-0 text-sm">
                          ⚠️
                        </span>
                        <p className="text-[11px] text-[#4B5675] leading-relaxed">
                          AI signals are not guarantees. Always use a stop-loss
                          and only invest what you can afford to lose. This is
                          not financial advice.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Key Observations */}
              {analysis?.keyPoints && analysis.keyPoints.length > 0 && (
                <div className="bg-[#0C1017] rounded-3xl p-6 border border-[#1C2333]">
                  <p className="text-xs text-[#4B5675] uppercase tracking-widest mb-3">
                    Key Observations
                  </p>
                  <ul className="space-y-2">
                    {analysis.keyPoints.map((point, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-[#CBD5E1]"
                      >
                        <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ICT Smart Money Concepts */}
              {analysis?.ict && (
                <div className="bg-[#0C1017] rounded-3xl p-6 border border-[#1C2333]">
                  <p className="text-xs text-[#4B5675] uppercase tracking-widest mb-4">
                    ICT Smart Money
                  </p>

                  {/* Market Structure + Bias row */}
                  <div className="flex gap-3 mb-4">
                    <div className="flex-1 bg-[#060A14]/60 rounded-xl p-3">
                      <p className="text-xs text-[#4B5675] mb-1">Structure</p>
                      <p
                        className={`text-sm font-bold ${
                          analysis.ict.marketStructure === "Bullish"
                            ? "text-emerald-400"
                            : analysis.ict.marketStructure === "Bearish"
                              ? "text-rose-400"
                              : "text-amber-400"
                        }`}
                      >
                        {analysis.ict.marketStructure}
                      </p>
                    </div>
                    <div className="flex-1 bg-[#060A14]/60 rounded-xl p-3">
                      <p className="text-xs text-[#4B5675] mb-1">Daily Bias</p>
                      <p
                        className={`text-sm font-bold ${
                          analysis.ict.dailyBias === "Bullish"
                            ? "text-emerald-400"
                            : analysis.ict.dailyBias === "Bearish"
                              ? "text-rose-400"
                              : "text-amber-400"
                        }`}
                      >
                        {analysis.ict.dailyBias}
                      </p>
                    </div>
                    <div className="flex-1 bg-[#060A14]/60 rounded-xl p-3">
                      <p className="text-xs text-[#4B5675] mb-1">Zone</p>
                      <p
                        className={`text-sm font-bold ${
                          analysis.ict.priceZone === "Discount"
                            ? "text-emerald-400"
                            : analysis.ict.priceZone === "Premium"
                              ? "text-rose-400"
                              : "text-amber-400"
                        }`}
                      >
                        {analysis.ict.priceZone}
                      </p>
                    </div>
                  </div>

                  {/* ICT Details */}
                  <div className="space-y-2.5">
                    {analysis.ict.orderBlock && (
                      <div className="flex gap-2">
                        <span className="text-xs text-purple-400 font-semibold w-8 shrink-0 mt-0.5">
                          OB
                        </span>
                        <p className="text-xs text-[#CBD5E1]">
                          {analysis.ict.orderBlock}
                        </p>
                      </div>
                    )}
                    {analysis.ict.fairValueGap && (
                      <div className="flex gap-2">
                        <span className="text-xs text-blue-400 font-semibold w-8 shrink-0 mt-0.5">
                          FVG
                        </span>
                        <p className="text-xs text-[#CBD5E1]">
                          {analysis.ict.fairValueGap}
                        </p>
                      </div>
                    )}
                    {analysis.ict.liquidity && (
                      <div className="flex gap-2">
                        <span className="text-xs text-yellow-400 font-semibold w-8 shrink-0 mt-0.5">
                          LIQ
                        </span>
                        <p className="text-xs text-[#CBD5E1]">
                          {analysis.ict.liquidity}
                        </p>
                      </div>
                    )}
                    {analysis.ict.ote && (
                      <div className="flex gap-2">
                        <span className="text-xs text-cyan-400 font-semibold w-8 shrink-0 mt-0.5">
                          OTE
                        </span>
                        <p className="text-xs text-[#CBD5E1]">
                          {analysis.ict.ote}
                        </p>
                      </div>
                    )}
                    {analysis.ict.setup && (
                      <div className="mt-3 pt-3 border-t border-[#1C2333]">
                        <p className="text-xs text-[#4B5675] mb-1">
                          Primary Setup
                        </p>
                        <p className="text-xs text-white leading-relaxed">
                          {analysis.ict.setup}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Price Snapshot */}
              <div className="bg-[#0C1017] rounded-3xl p-6 border border-[#1C2333]">
                <p className="text-xs text-[#4B5675] uppercase tracking-widest mb-3">
                  Price Snapshot
                </p>
                {quoteData.price ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#7B8DB4]">Current</span>
                      <span className="text-white font-semibold">
                        ${quoteData.price.toFixed(2)}
                      </span>
                    </div>
                    {dayChange !== null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#7B8DB4]">Day Change</span>
                        <span
                          className={
                            dayChange >= 0
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }
                        >
                          {dayChange >= 0 ? "+" : ""}
                          {dayChange.toFixed(2)}%
                        </span>
                      </div>
                    )}
                    {quoteData.open && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#7B8DB4]">Open</span>
                        <span className="text-white">
                          ${quoteData.open.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {quoteData.high && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#7B8DB4]">High</span>
                        <span className="text-white">
                          ${quoteData.high.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {quoteData.low && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#7B8DB4]">Low</span>
                        <span className="text-white">
                          ${quoteData.low.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {quoteData.previousClose && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#7B8DB4]">Prev. Close</span>
                        <span className="text-white">
                          ${quoteData.previousClose.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-[#4B5675] animate-pulse">
                    Loading price data…
                  </p>
                )}
              </div>

              {/* Deep ICT Analysis trigger */}
              <div className="bg-[#0C1017] rounded-3xl p-5 border border-indigo-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">🎯</span>
                  <p className="text-sm font-bold text-[#F1F5F9]">
                    Deep ICT Analysis
                  </p>
                </div>
                <p className="text-xs text-[#4B5675] leading-relaxed mb-4">
                  Full institutional breakdown — market structure, OBs, FVGs,
                  liquidity pools, OTE zones, and two trade setups with exact
                  entry/SL/TP levels.
                </p>
                <button
                  type="button"
                  onClick={runDeepICT}
                  disabled={loadingDeep}
                  className="w-full py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-all text-white flex items-center justify-center gap-2"
                >
                  {loadingDeep ? (
                    <>
                      <svg
                        className="animate-spin"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Analyzing with ICT framework…
                    </>
                  ) : deepICT ? (
                    "Re-run Deep ICT Analysis"
                  ) : (
                    "Run Deep ICT Analysis"
                  )}
                </button>
                {deepError && (
                  <p className="text-xs text-rose-400 mt-2 text-center">
                    {deepError}
                  </p>
                )}
              </div>

              {/* Disclaimer */}
              <p className="text-xs text-[#4B5675] leading-relaxed px-1">
                AI signals are for informational purposes only and do not
                constitute financial advice. Always do your own research before
                investing.
              </p>
            </div>
          </div>

          {/* ── Deep ICT Analysis Results (full width) ── */}
          {deepICT && <DeepICTPanel data={deepICT} symbol={symbol} />}

          {/* Comparison vs E-mini S&P 500 and key benchmarks */}
          <ComparisonPanel
            currentSymbol={symbol}
            currentLabel={symbol.replace(".US", "").replace(".COMM", "")}
            currentDayChange={dayChange}
          />
        </div>
      </main>
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen text-[#F1F5F9] items-center justify-center">
          <div className="text-[#4B5675] text-sm">Loading analysis…</div>
        </div>
      }
    >
      <AnalysisContent />
    </Suspense>
  );
}
