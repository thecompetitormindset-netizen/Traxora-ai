"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import Sidebar from "@/app/components/Sidebar";
import Topbar from "@/app/components/Topbar";
import dynamic from "next/dynamic";
const StockChart = dynamic(() => import("@/app/components/StockChart"), {
  ssr: false,
});
import MarketStatus from "@/app/components/MarketStatus";
import { getPortfolio } from "@/app/lib/trading";

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

// ── Market Depth / Order Bars ─────────────────────────────────────────────────

function MarketDepth({ price, high, low, symbol }: { price: number; high: number; low: number; symbol: string }) {
  const portfolio = getPortfolio();
  const userOrders = portfolio.pendingOrders.filter(o => o.symbol === symbol);

  const range = Math.max((high - low) || price * 0.02, price * 0.015);
  const step  = range / 8;

  // Deterministic "volume" using price-level hash so it doesn't flicker
  function vol(lvlPrice: number) {
    const seed = Math.abs(Math.sin(lvlPrice * 137.5 + 42));
    return Math.round(seed * 95_000 + 5_000);
  }

  const asks = Array.from({ length: 6 }, (_, i) => {
    const lvl = price + step * (i + 1);
    return {
      price:   lvl,
      volume:  Math.round(vol(lvl) * Math.exp(-i * 0.45)),
      myOrder: userOrders.find(o => o.side === "SELL" && Math.abs(o.limitPrice - lvl) < step * 0.6),
    };
  });
  const bids = Array.from({ length: 6 }, (_, i) => {
    const lvl = price - step * (i + 1);
    return {
      price:   lvl,
      volume:  Math.round(vol(lvl) * Math.exp(-i * 0.45)),
      myOrder: userOrders.find(o => o.side === "BUY"  && Math.abs(o.limitPrice - lvl) < step * 0.6),
    };
  });

  const maxVol = Math.max(...asks.map(a => a.volume), ...bids.map(b => b.volume));

  const Row = ({ lvl, side }: { lvl: typeof asks[number]; side: "ask" | "bid" }) => {
    const pct  = Math.max(4, (lvl.volume / maxVol) * 100);
    const color = side === "ask" ? "bg-rose-500/25" : "bg-emerald-500/25";
    const txt   = side === "ask" ? "text-rose-400" : "text-emerald-400";
    return (
      <div className={`relative flex items-center gap-2 px-2 py-[3px] rounded-sm ${lvl.myOrder ? "ring-1 ring-indigo-500/50 bg-indigo-500/5" : ""}`}>
        {/* Bar */}
        <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${pct}%`, background: side === "ask" ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)" }} />
        <span className={`relative z-10 text-[10px] font-mono w-20 shrink-0 ${txt}`}>
          ${lvl.price.toFixed(2)}
        </span>
        <div className="relative z-10 flex-1 h-1 bg-[#1C2333] rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="relative z-10 text-[10px] font-mono text-[#4B5675] w-16 text-right shrink-0">
          {lvl.volume.toLocaleString()}
        </span>
        {lvl.myOrder && (
          <span className="relative z-10 text-[9px] font-bold text-indigo-400 shrink-0">MY ORDER</span>
        )}
      </div>
    );
  };

  const spread = asks[0].price - bids[0].price;

  return (
    <div className="bg-[#0C1017] rounded-3xl p-5 border border-[#1C2333]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[#4B5675] uppercase tracking-widest">Order Depth</p>
        <span className="text-[10px] text-[#2D3A50] font-mono">Spread ${spread.toFixed(2)}</span>
      </div>

      {/* Header row */}
      <div className="flex items-center gap-2 px-2 mb-1">
        <span className="text-[9px] text-[#2D3A50] uppercase tracking-widest w-20 shrink-0">Price</span>
        <span className="flex-1" />
        <span className="text-[9px] text-[#2D3A50] uppercase tracking-widest w-16 text-right shrink-0">Volume</span>
      </div>

      {/* Asks (above price) — reversed so lowest ask is nearest to mid */}
      <div className="space-y-0.5 mb-1">
        {[...asks].reverse().map((a, i) => <Row key={i} lvl={a} side="ask" />)}
      </div>

      {/* Mid price */}
      <div className="flex items-center gap-2 my-1.5 px-2">
        <span className="text-[11px] font-black font-mono text-[#F1F5F9]">${price.toFixed(2)}</span>
        <div className="flex-1 h-px bg-[#2D3A50]" />
        <span className="text-[10px] text-[#4B5675]">Last price</span>
      </div>

      {/* Bids (below price) */}
      <div className="space-y-0.5">
        {bids.map((b, i) => <Row key={i} lvl={b} side="bid" />)}
      </div>

      {userOrders.length > 0 && (
        <p className="text-[9px] text-indigo-400 mt-3 text-center">
          {userOrders.length} paper limit order{userOrders.length > 1 ? "s" : ""} shown — go to Paper Trading to manage
        </p>
      )}
      <p className="text-[9px] text-[#1C2333] text-center mt-1">Simulated depth · for reference only</p>
    </div>
  );
}

// ── Main Analysis Component ───────────────────────────────────────────────────

function AnalysisContent() {
  const searchParams = useSearchParams();
  const symbol = searchParams.get("symbol") || "AAPL.US";

  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  const [deepICT, setDeepICT] = useState<DeepICT | null>(null);
  const [loadingDeep, setLoadingDeep] = useState(false);
  const [deepError, setDeepError] = useState<string | null>(null);

  // Current portfolio holding for this symbol
  const [holding, setHolding] = useState<{ quantity: number; avgPrice: number } | null>(null);

  useEffect(() => {
    function loadHolding() {
      const p = getPortfolio();
      const clean = symbol.replace(".US", "").replace(".COMM", "");
      const h = p.holdings.find(x => x.symbol === symbol || x.symbol.replace(".US","").replace(".COMM","") === clean);
      setHolding(h ? { quantity: h.quantity, avgPrice: h.avgPrice } : null);
    }
    loadHolding();
    window.addEventListener("portfolio-updated", loadHolding);
    return () => window.removeEventListener("portfolio-updated", loadHolding);
  }, [symbol]);

  // Keep the quick-signal panel in sync with the deep ICT result so they never contradict
  useEffect(() => {
    if (!deepICT) return;
    const mapped: "BUY" | "HOLD" | "SELL" =
      deepICT.overallBias === "BULLISH" ? "BUY" :
      deepICT.overallBias === "BEARISH" ? "SELL" : "HOLD";
    setAnalysis(prev =>
      prev
        ? { ...prev, signal: mapped, confidence: deepICT.confidence }
        : { signal: mapped, confidence: deepICT.confidence, summary: deepICT.biasReasoning, keyPoints: [], risk: "Medium" as const }
    );
  }, [deepICT]);

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

  const [expandChart, setExpandChart] = useState(false);

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

          {/* ── Chart — always full width ── */}
          <div className="mt-6 relative">
            <StockChart symbol={symbol} height={expandChart ? 680 : 460} defaultInterval="D" />
            <button
              type="button"
              onClick={() => setExpandChart(e => !e)}
              title={expandChart ? "Collapse chart" : "Expand chart"}
              className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-[#0C1017]/90 border border-[#1C2333] hover:border-indigo-500/40 text-[#7B8DB4] hover:text-indigo-400 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all backdrop-blur-sm"
            >
              {expandChart ? (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
                  </svg>
                  Collapse
                </>
              ) : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                  </svg>
                  Expand
                </>
              )}
            </button>
          </div>

          {/* ── Info panels — always below chart in a grid ── */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Signal Card */}
            <div className="bg-[#0C1017] rounded-2xl p-5 border border-[#1C2333]">
              <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-3">Traxora AI Signal</p>

              {/* Current portfolio position for this symbol */}
              {holding && (
                <div className="mb-3 flex items-center gap-2 bg-indigo-500/8 border border-indigo-500/20 rounded-xl px-3 py-2">
                  <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wide">Position</span>
                  <span className="text-[10px] font-mono text-[#F1F5F9]">{holding.quantity} sh @ ${holding.avgPrice.toFixed(2)}</span>
                  {quoteData.price && (
                    <span className={`ml-auto text-[10px] font-black font-mono ${
                      quoteData.price >= holding.avgPrice ? "text-emerald-400" : "text-rose-400"
                    }`}>
                      {quoteData.price >= holding.avgPrice ? "+" : ""}
                      ${((quoteData.price - holding.avgPrice) * holding.quantity).toFixed(2)}
                    </span>
                  )}
                </div>
              )}

              {loadingAnalysis && (
                <div className="space-y-3 animate-pulse">
                  <div className="h-10 bg-[#1F2937] rounded-xl" />
                  <div className="h-3 bg-[#1F2937] rounded w-3/4" />
                  <div className="h-3 bg-[#1F2937] rounded w-1/2" />
                </div>
              )}

              {!loadingAnalysis && analysis && (
                <>
                  <span className={`inline-block text-xl font-bold px-4 py-2 rounded-xl border ${signalStyle(analysis.signal)}`}>
                    {analysis.signal}
                  </span>
                  <div className="flex items-center gap-4 mt-3">
                    <div>
                      <p className="text-[10px] text-[#4B5675]">Confidence</p>
                      <p className={`text-sm font-semibold mt-0.5 ${confidenceStyle(analysis.confidence)}`}>{analysis.confidence}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#4B5675]">Risk</p>
                      <p className={`text-sm font-semibold mt-0.5 ${riskStyle(analysis.risk)}`}>{analysis.risk}</p>
                    </div>
                  </div>
                  <p className="text-xs text-[#CBD5E1] mt-3 leading-relaxed">{analysis.summary}</p>
                </>
              )}

              {!loadingAnalysis && !analysis && (
                <p className="text-sm text-[#4B5675]">Unable to generate signal. Market data may be unavailable.</p>
              )}

              {/* Paper Trade CTA */}
              {!loadingAnalysis && analysis && analysis.signal !== "HOLD" && (
                <a
                  href={`/paper?symbol=${encodeURIComponent(symbol.replace(".US","").replace(".COMM",""))}&side=${analysis.signal === "BUY" ? "BUY" : "SELL"}`}
                  className={`mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold transition-all ${
                    analysis.signal === "BUY" ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-rose-600 hover:bg-rose-500 text-white"
                  }`}
                >
                  {holding
                    ? analysis.signal === "BUY" ? "Add to Position" : "Close / Sell Position"
                    : analysis.signal === "BUY" ? "Buy Long on Paper" : "Sell Short on Paper"}
                </a>
              )}
            </div>

            {/* Price Snapshot */}
            <div className="bg-[#0C1017] rounded-2xl p-5 border border-[#1C2333]">
              <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-3">Price Snapshot</p>
              {quoteData.price ? (
                <div className="space-y-2">
                  {[
                    { label: "Current",    value: `$${quoteData.price.toFixed(2)}`,        color: "text-white font-semibold" },
                    dayChange !== null ? { label: "Day Change", value: `${dayChange >= 0 ? "+" : ""}${dayChange.toFixed(2)}%`, color: dayChange >= 0 ? "text-emerald-400" : "text-rose-400" } : null,
                    quoteData.open   ? { label: "Open",       value: `$${quoteData.open.toFixed(2)}`,          color: "text-white" } : null,
                    quoteData.high   ? { label: "High",       value: `$${quoteData.high.toFixed(2)}`,          color: "text-white" } : null,
                    quoteData.low    ? { label: "Low",        value: `$${quoteData.low.toFixed(2)}`,           color: "text-white" } : null,
                    quoteData.previousClose ? { label: "Prev. Close", value: `$${quoteData.previousClose.toFixed(2)}`, color: "text-white" } : null,
                  ].filter(Boolean).map((row) => (
                    <div key={row!.label} className="flex justify-between text-sm">
                      <span className="text-[#7B8DB4]">{row!.label}</span>
                      <span className={row!.color}>{row!.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#4B5675] animate-pulse">Loading…</p>
              )}
            </div>

            {/* Key Observations */}
            {analysis?.keyPoints && analysis.keyPoints.length > 0 && (
              <div className="bg-[#0C1017] rounded-2xl p-5 border border-[#1C2333]">
                <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-3">Key Observations</p>
                <ul className="space-y-2">
                  {analysis.keyPoints.map((point, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#CBD5E1]">
                      <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ICT Smart Money */}
            {analysis?.ict && (
              <div className="bg-[#0C1017] rounded-2xl p-5 border border-[#1C2333]">
                <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-3">ICT Smart Money</p>
                <div className="flex gap-2 mb-3">
                  {[
                    { label: "Structure", val: analysis.ict.marketStructure },
                    { label: "Bias",      val: analysis.ict.dailyBias       },
                    { label: "Zone",      val: analysis.ict.priceZone       },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex-1 bg-[#060A14] rounded-xl p-2.5">
                      <p className="text-[9px] text-[#4B5675] mb-1">{label}</p>
                      <p className={`text-xs font-bold ${val === "Bullish" || val === "Discount" ? "text-emerald-400" : val === "Bearish" || val === "Premium" ? "text-rose-400" : "text-amber-400"}`}>{val}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {[
                    { tag: "OB",  color: "text-purple-400", text: analysis.ict.orderBlock    },
                    { tag: "FVG", color: "text-blue-400",   text: analysis.ict.fairValueGap  },
                    { tag: "LIQ", color: "text-yellow-400", text: analysis.ict.liquidity     },
                    { tag: "OTE", color: "text-cyan-400",   text: analysis.ict.ote           },
                  ].filter(r => r.text).map(({ tag, color, text }) => (
                    <div key={tag} className="flex gap-2">
                      <span className={`text-[10px] font-black w-7 shrink-0 mt-0.5 ${color}`}>{tag}</span>
                      <p className="text-[11px] text-[#CBD5E1] leading-snug">{text}</p>
                    </div>
                  ))}
                  {analysis.ict.setup && (
                    <div className="mt-2 pt-2 border-t border-[#1C2333]">
                      <p className="text-[9px] text-[#4B5675] mb-1">Primary Setup</p>
                      <p className="text-[11px] text-white leading-snug">{analysis.ict.setup}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Order Depth */}
            {quoteData.price && quoteData.high && quoteData.low && (
              <MarketDepth price={quoteData.price} high={quoteData.high} low={quoteData.low} symbol={symbol} />
            )}

            {/* Deep ICT Analysis trigger */}
            <div className="bg-[#0C1017] rounded-2xl p-5 border border-indigo-500/20">
              <div className="flex items-center gap-2 mb-2">
                <span>🎯</span>
                <p className="text-sm font-bold text-[#F1F5F9]">Deep ICT Analysis</p>
              </div>
              <p className="text-xs text-[#4B5675] leading-relaxed mb-4">
                Full institutional breakdown — OBs, FVGs, liquidity, OTE zones, and two trade setups with exact entry/SL/TP.
              </p>
              <button
                type="button"
                onClick={runDeepICT}
                disabled={loadingDeep}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-all text-white flex items-center justify-center gap-2"
              >
                {loadingDeep ? (
                  <>
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Analyzing…
                  </>
                ) : deepICT ? "Re-run Deep ICT" : "Run Deep ICT Analysis"}
              </button>
              {deepError && <p className="text-xs text-rose-400 mt-2 text-center">{deepError}</p>}
            </div>
          </div>

          {/* ── Deep ICT Analysis Results (full width) ── */}
          {deepICT && <DeepICTPanel data={deepICT} symbol={symbol} />}
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
