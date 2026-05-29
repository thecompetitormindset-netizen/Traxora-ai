"use client";

import type { DeepICT, ICTSetup } from "./types";

// ── Shared primitives ─────────────────────────────────────────────────────────

export function ICTRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[#252345] last:border-0">
      <span className="text-[10px] text-[#4B5675] uppercase tracking-widest shrink-0 mt-0.5 w-28">{label}</span>
      <span className={`text-xs font-mono font-semibold text-right ${accent ?? "text-[#F1F5F9]"}`}>{value}</span>
    </div>
  );
}

export function SectionHead({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-base shrink-0">{icon}</span>
      <span className="text-[10px] font-black text-[#7B8DB4] uppercase tracking-widest">{label}</span>
      <div className="flex-1 h-px bg-[#252345]" />
    </div>
  );
}

// ── SetupCard ─────────────────────────────────────────────────────────────────

function SetupCard({ setup, label, color }: { setup: ICTSetup; label: string; color: "emerald" | "rose" }) {
  const c = color === "emerald"
    ? { border: "border-emerald-500/20", bg: "bg-emerald-500/5", txt: "text-emerald-400", badge: "bg-emerald-500/15 border-emerald-500/25 text-emerald-400" }
    : { border: "border-rose-500/20",    bg: "bg-rose-500/5",    txt: "text-rose-400",    badge: "bg-rose-500/15 border-rose-500/25 text-rose-400" };

  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-5 space-y-3`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border ${c.badge}`}>{label}</span>
        <span className={`text-sm font-black ${c.txt}`}>{setup.direction}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[
          { label: "Entry Zone", value: `${setup.entryFrom} – ${setup.entryTo}`, color: "text-[#F1F5F9]" },
          { label: "Stop Loss",  value: setup.stopLoss,  color: "text-rose-400" },
          { label: "R:R Ratio",  value: setup.rrRatio,   color: "text-emerald-400" },
          { label: "Target 1",   value: setup.target1,   color: "text-emerald-400" },
          { label: "Target 2",   value: setup.target2,   color: "text-emerald-400" },
          ...(setup.target3 ? [{ label: "Target 3", value: setup.target3, color: "text-emerald-400" }] : []),
        ].map(item => (
          <div key={item.label} className="bg-[#0D0B1A] rounded-xl p-2.5">
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-0.5">{item.label}</p>
            <p className={`text-xs font-black font-mono ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 text-xs text-[#7B8DB4] leading-relaxed">
        <p><span className="text-[#4B5675] font-semibold">Trigger: </span>{setup.entryTrigger}</p>
        <p><span className="text-[#4B5675] font-semibold">SL reason: </span>{setup.stopReason}</p>
        {setup.target1Reason && <p><span className="text-[#4B5675] font-semibold">T1 — </span>{setup.target1Reason}</p>}
        {setup.target2Reason && <p><span className="text-[#4B5675] font-semibold">T2 — </span>{setup.target2Reason}</p>}
        {setup.target3 && setup.target3Reason && <p><span className="text-[#4B5675] font-semibold">T3 — </span>{setup.target3Reason}</p>}
      </div>

      <div className="flex flex-wrap gap-3 pt-1 border-t border-white/5 text-[10px]">
        <span className="text-[#4B5675]">Best entry: <span className="text-emerald-400 font-semibold">{setup.bestEntryTime}</span></span>
        <span className="text-[#4B5675]">Invalidation: <span className="text-rose-400 font-semibold">{setup.invalidation}</span></span>
      </div>
    </div>
  );
}

// ── DeepMarketPanel ───────────────────────────────────────────────────────────

export default function DeepMarketPanel({ data, symbol }: { data: DeepICT; symbol: string }) {
  const clean = symbol.replace(".US", "").replace(".COMM", "");
  const biasColor =
    data.overallBias === "BULLISH" ? "text-emerald-400" :
    data.overallBias === "BEARISH" ? "text-rose-400" : "text-amber-400";
  const biasRing =
    data.overallBias === "BULLISH" ? "border-emerald-500/30 bg-emerald-500/5" :
    data.overallBias === "BEARISH" ? "border-rose-500/30 bg-rose-500/5" : "border-amber-500/30 bg-amber-500/5";
  const zoneCls =
    data.premiumDiscount.currentZone === "Premium" ? "text-rose-400" :
    data.premiumDiscount.currentZone === "Discount" ? "text-emerald-400" : "text-amber-400";

  return (
    <div className="mt-6 bg-[#13112A] border border-[#252345] rounded-3xl overflow-hidden">
      {/* Header */}
      <div className={`flex items-center justify-between px-6 py-4 border-b border-[#252345] ${biasRing} border-b-0`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎯</span>
          <div>
            <p className="font-bold text-[#F1F5F9]">Deep Market Analysis — {clean}</p>
            <p className="text-[10px] text-[#4B5675] mt-0.5">Institutional Smart Money Framework · Multi-timeframe structure</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-black px-2.5 py-1 rounded-lg border ${biasRing} ${biasColor}`}>{data.overallBias}</span>
          <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
            data.confidence === "High"   ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400" :
            data.confidence === "Medium" ? "border-amber-500/25 bg-amber-500/10 text-amber-400" :
                                           "border-rose-500/25 bg-rose-500/10 text-rose-400"
          }`}>{data.confidence} conf.</span>
        </div>
      </div>

      <div className="p-6 space-y-7">
        {/* No-trade notice */}
        {data.noTrade && data.noTradeNote && (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl px-5 py-4">
            <p className="text-sm font-bold text-amber-400 mb-1">⚠ No Valid Setup Today</p>
            <p className="text-xs text-[#CBD5E1] leading-relaxed">{data.noTradeNote}</p>
          </div>
        )}

        {/* Bias reasoning */}
        <div className={`rounded-2xl border px-5 py-4 ${biasRing}`}>
          <p className={`text-xs font-black uppercase tracking-widest mb-1.5 ${biasColor}`}>Directional Bias · {data.overallBias}</p>
          <p className="text-sm text-[#CBD5E1] leading-relaxed">{data.biasReasoning}</p>
        </div>

        {/* Market Structure + Key Levels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <SectionHead icon="📐" label="Market Structure" />
            <div className="bg-[#0D0B1A] border border-[#252345] rounded-2xl p-4 space-y-0">
              {[
                { label: "Monthly",    value: data.marketStructure.monthly },
                { label: "Weekly",     value: data.marketStructure.weekly },
                { label: "Daily",      value: data.marketStructure.daily },
                { label: "4H (inferred)", value: data.marketStructure.h4 },
                { label: "Recent BOS",   value: data.marketStructure.recentBOS },
                { label: "ChoCH/MSS",    value: data.marketStructure.recentChoCH },
              ].map(r => <ICTRow key={r.label} label={r.label} value={r.value} />)}
            </div>
            <div className="mt-2 bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-4 py-2.5">
              <p className="text-[8px] text-emerald-400 font-black uppercase tracking-widest mb-0.5">Draw on Liquidity</p>
              <p className="text-xs text-[#CBD5E1]">{data.marketStructure.drawOnLiquidity}</p>
            </div>
          </div>

          <div>
            <SectionHead icon="📊" label="Key Price Levels" />
            <div className="bg-[#0D0B1A] border border-[#252345] rounded-2xl p-4 space-y-0">
              {[
                { label: "Swing High",    value: data.keyLevels.swingHigh,    accent: "text-emerald-400" },
                { label: "Swing Low",     value: data.keyLevels.swingLow,     accent: "text-rose-400" },
                { label: "50% Eq",        value: data.keyLevels.eq50,         accent: "text-amber-400" },
                { label: "Prev Week Hi",  value: data.keyLevels.pwh,          accent: "text-emerald-400" },
                { label: "Prev Week Lo",  value: data.keyLevels.pwl,          accent: "text-rose-400" },
                { label: "Prev Day Hi",   value: data.keyLevels.pdh },
                { label: "Prev Day Lo",   value: data.keyLevels.pdl },
                { label: "Weekly Open",   value: data.keyLevels.weeklyOpen },
                { label: "Monthly Open",  value: data.keyLevels.monthlyOpen },
                { label: "ATR (14d)",     value: data.keyLevels.atr14,        accent: "text-emerald-400" },
                {
                  label: "RSI (14d)",
                  value: data.keyLevels.rsi14,
                  accent: Number(data.keyLevels.rsi14) > 70 ? "text-rose-400" :
                          Number(data.keyLevels.rsi14) < 30 ? "text-emerald-400" : "text-amber-400",
                },
              ].map(r => <ICTRow key={r.label} label={r.label} value={r.value} accent={r.accent} />)}
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
                <p className="text-[8px] text-emerald-400 font-black uppercase tracking-widest mb-1.5">Buy-Side (BSL)</p>
                {data.liquidity.bsl.map((l, i) => <p key={i} className="text-[10px] text-[#CBD5E1]">▲ {l}</p>)}
              </div>
              <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl p-3">
                <p className="text-[8px] text-rose-400 font-black uppercase tracking-widest mb-1.5">Sell-Side (SSL)</p>
                {data.liquidity.ssl.map((l, i) => <p key={i} className="text-[10px] text-[#CBD5E1]">▼ {l}</p>)}
              </div>
              <div className="bg-[#0D0B1A] border border-emerald-500/15 rounded-xl p-3">
                <p className="text-[8px] text-emerald-400 font-black uppercase tracking-widest mb-1">Likely Target</p>
                <p className="text-[10px] text-[#CBD5E1]">{data.liquidity.likelyTarget}</p>
              </div>
            </div>
          </div>

          {/* Order Blocks */}
          <div>
            <SectionHead icon="📦" label="Order Blocks" />
            <div className="space-y-2">
              {data.orderBlocks.bullish && (
                <div className={`rounded-xl p-3 border ${data.orderBlocks.bullish.mitigated ? "border-[#252345] opacity-50" : "border-emerald-500/20 bg-emerald-500/5"}`}>
                  <p className="text-[8px] text-emerald-400 font-black uppercase tracking-widest mb-1">Bullish OB · {data.orderBlocks.bullish.timeframe}</p>
                  <p className="text-xs font-mono text-[#F1F5F9]">{data.orderBlocks.bullish.zone}</p>
                  {data.orderBlocks.bullish.mitigated && <p className="text-[9px] text-[#4B5675] mt-0.5">Mitigated</p>}
                </div>
              )}
              {data.orderBlocks.bearish && (
                <div className={`rounded-xl p-3 border ${data.orderBlocks.bearish.mitigated ? "border-[#252345] opacity-50" : "border-rose-500/20 bg-rose-500/5"}`}>
                  <p className="text-[8px] text-rose-400 font-black uppercase tracking-widest mb-1">Bearish OB · {data.orderBlocks.bearish.timeframe}</p>
                  <p className="text-xs font-mono text-[#F1F5F9]">{data.orderBlocks.bearish.zone}</p>
                  {data.orderBlocks.bearish.mitigated && <p className="text-[9px] text-[#4B5675] mt-0.5">Mitigated</p>}
                </div>
              )}
              {data.orderBlocks.priceAtOB && (
                <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
                  <p className="text-[9px] text-amber-400 font-bold">⚡ Price currently AT order block</p>
                </div>
              )}
              <p className="text-[10px] text-[#7B8DB4] leading-relaxed">{data.orderBlocks.note}</p>
            </div>
          </div>

          {/* FVGs */}
          <div>
            <SectionHead icon="⬜" label="Fair Value Gaps" />
            <div className="space-y-2">
              {data.fvgs.above.length > 0 && (
                <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3">
                  <p className="text-[8px] text-emerald-400 font-black uppercase tracking-widest mb-1.5">Above (draw up)</p>
                  {data.fvgs.above.map((f, i) => (
                    <p key={i} className="text-[10px] text-[#CBD5E1] font-mono">▲ {f.zone} <span className="text-[#4B5675]">({f.timeframe})</span></p>
                  ))}
                </div>
              )}
              {data.fvgs.below.length > 0 && (
                <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl p-3">
                  <p className="text-[8px] text-rose-400 font-black uppercase tracking-widest mb-1.5">Below (draw down)</p>
                  {data.fvgs.below.map((f, i) => (
                    <p key={i} className="text-[10px] text-[#CBD5E1] font-mono">▼ {f.zone} <span className="text-[#4B5675]">({f.timeframe})</span></p>
                  ))}
                </div>
              )}
              {data.fvgs.currentlyInFVG && (
                <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-3 py-2">
                  <p className="text-[9px] text-emerald-400 font-bold">⚡ Price currently inside FVG</p>
                </div>
              )}
              <p className="text-[10px] text-[#7B8DB4] leading-relaxed">{data.fvgs.note}</p>
            </div>
          </div>
        </div>

        {/* Premium/Discount + OTE + Kill Zone */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#0D0B1A] border border-[#252345] rounded-2xl p-4">
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-2">Premium / Discount</p>
            <p className={`text-lg font-black mb-1 ${zoneCls}`}>{data.premiumDiscount.currentZone}</p>
            <p className="text-[9px] text-[#4B5675] mb-2">Weekly eq: <span className="text-[#CBD5E1]">{data.premiumDiscount.weeklyEq}</span></p>
            <p className="text-[9px] text-[#4B5675] mb-3">Daily eq: <span className="text-[#CBD5E1]">{data.premiumDiscount.dailyEq}</span></p>
            <p className="text-[10px] text-[#7B8DB4] leading-relaxed">{data.premiumDiscount.note}</p>
          </div>

          <div className="bg-[#0D0B1A] border border-[#252345] rounded-2xl p-4">
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-2">OTE Zones (Fibonacci)</p>
            {data.ote.longZone && (
              <div className="mb-2">
                <p className="text-[8px] text-emerald-400 font-bold uppercase tracking-widest mb-0.5">Long OTE (0.705–0.79)</p>
                <p className="text-xs font-mono text-[#F1F5F9]">{data.ote.longZone.from} – {data.ote.longZone.to}</p>
              </div>
            )}
            {data.ote.shortZone && (
              <div className="mb-2">
                <p className="text-[8px] text-rose-400 font-bold uppercase tracking-widest mb-0.5">Short OTE (0.705–0.79)</p>
                <p className="text-xs font-mono text-[#F1F5F9]">{data.ote.shortZone.from} – {data.ote.shortZone.to}</p>
              </div>
            )}
            {data.ote.inOTE && (
              <div className="mt-2 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-1.5">
                <p className="text-[9px] text-amber-400 font-bold">Price currently in OTE zone</p>
              </div>
            )}
          </div>

          <div className="bg-[#0D0B1A] border border-[#252345] rounded-2xl p-4">
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-2">Kill Zones</p>
            <p className="text-xs font-bold text-emerald-400 mb-2">{data.killZones.nextKillZone}</p>
            <p className="text-[10px] text-[#7B8DB4] leading-relaxed">{data.killZones.setupNote}</p>
          </div>
        </div>

        {/* Trade Scenarios */}
        {!data.noTrade && (
          <div className="space-y-4">
            <SectionHead icon="🎯" label="Trade Setups" />
            <SetupCard setup={data.scenarioA} label="Scenario A — Primary" color={data.scenarioA.direction === "LONG" ? "emerald" : "rose"} />
            {data.scenarioB && (
              <SetupCard setup={data.scenarioB} label="Scenario B — Alternative" color={data.scenarioB.direction === "LONG" ? "emerald" : "rose"} />
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
                  <span className="text-emerald-400 shrink-0 mt-0.5 text-xs">›</span>
                  <p className="text-xs text-[#7B8DB4] leading-relaxed">{w}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <SectionHead icon="⚠️" label="Risk Warnings" />
            <div className="space-y-2">
              {[
                { label: "Earnings ≤5 days", value: data.risk.earningsWithin5Days ? `Yes — ${data.risk.earningsDate ?? "check"}` : "No", warn: data.risk.earningsWithin5Days },
                { label: "Major event",      value: data.risk.majorEventThisWeek ? (data.risk.majorEvent ?? "Yes") : "None", warn: data.risk.majorEventThisWeek },
                { label: "IV elevated",      value: data.risk.ivElevated ? "Yes — caution on options" : "No", warn: data.risk.ivElevated },
                { label: "Low liquidity",    value: data.risk.lowLiquidity ? "Yes — wider spreads" : "No", warn: data.risk.lowLiquidity },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between text-xs">
                  <span className="text-[#4B5675]">{r.label}</span>
                  <span className={r.warn ? "text-rose-400 font-semibold" : "text-emerald-400"}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-[10px] text-[#333368] text-center border-t border-[#252345] pt-4">
          Institutional Smart Money analysis · Educational purposes only · Not financial advice
        </p>
      </div>
    </div>
  );
}
