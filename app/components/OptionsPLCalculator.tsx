"use client";

import { useId, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Strategy = "long_call" | "long_put" | "csp" | "covered_call";

const STRATEGIES: { id: Strategy; label: string; emoji: string; desc: string }[] = [
  { id: "long_call",    label: "Long Call",           emoji: "📈", desc: "Buy a call option — unlimited upside, capped loss" },
  { id: "long_put",     label: "Long Put",            emoji: "📉", desc: "Buy a put option — profits as stock falls" },
  { id: "csp",          label: "Cash-Secured Put",    emoji: "🎯", desc: "Sell a put to collect premium, backed by cash" },
  { id: "covered_call", label: "Covered Call",        emoji: "🔒", desc: "Sell a call against shares you own" },
];

// ── Payoff math ───────────────────────────────────────────────────────────────

function calcPL(strategy: Strategy, price: number, strike: number, premium: number, contracts: number): number {
  const mult = contracts * 100;
  switch (strategy) {
    case "long_call":
      return (Math.max(0, price - strike) - premium) * mult;
    case "long_put":
      return (Math.max(0, strike - price) - premium) * mult;
    case "csp":
      // Sold put: max gain = premium, loss if stock below (strike - premium)
      return (premium - Math.max(0, strike - price)) * mult;
    case "covered_call":
      // Sold call: capped upside at strike, premium offsets downside
      return (premium - Math.max(0, price - strike)) * mult;
  }
}

function breakevens(strategy: Strategy, strike: number, premium: number): number[] {
  switch (strategy) {
    case "long_call":    return [strike + premium];
    case "long_put":     return [strike - premium];
    case "csp":          return [strike - premium];
    case "covered_call": return [strike + premium];
  }
}

function maxProfit(strategy: Strategy, strike: number, premium: number, contracts: number): string {
  const mult = contracts * 100;
  switch (strategy) {
    case "long_call":    return "Unlimited";
    case "long_put":     return `$${((strike - premium) * mult).toFixed(0)} (if stock → $0)`;
    case "csp":          return `$${(premium * mult).toFixed(0)} (keep full premium)`;
    case "covered_call": return `$${(premium * mult).toFixed(0)} (keep full premium)`;
  }
}

function maxLoss(strategy: Strategy, strike: number, premium: number, contracts: number): string {
  const mult = contracts * 100;
  switch (strategy) {
    case "long_call":    return `$${(premium * mult).toFixed(0)} (premium paid)`;
    case "long_put":     return `$${(premium * mult).toFixed(0)} (premium paid)`;
    case "csp":          return `$${((strike - premium) * mult).toFixed(0)} (stock → $0)`;
    case "covered_call": return "Unlimited downside (offset by premium)";
  }
}

// ── SVG Payoff Chart ──────────────────────────────────────────────────────────

function PayoffChart({
  strategy, currentPrice, strike, premium, contracts,
}: {
  strategy:     Strategy;
  currentPrice: number;
  strike:       number;
  premium:      number;
  contracts:    number;
}) {
  const uid = useId().replace(/:/g, "");
  const W   = 600;
  const H   = 220;
  const PAD = { top: 20, right: 20, bottom: 40, left: 64 };
  const IW  = W - PAD.left - PAD.right;
  const IH  = H - PAD.top  - PAD.bottom;

  // Price range: 55% – 145% of current price
  const priceMin = currentPrice * 0.55;
  const priceMax = currentPrice * 1.45;
  const steps    = 80;

  const prices = Array.from({ length: steps + 1 }, (_, i) =>
    priceMin + (i / steps) * (priceMax - priceMin),
  );
  const pls = prices.map(p => calcPL(strategy, p, strike, premium, contracts));

  const plMax = Math.max(...pls, 1);
  const plMin = Math.min(...pls, -1);
  const yRange = Math.max(Math.abs(plMax), Math.abs(plMin)) * 1.15 || 1;

  function xOf(price: number): number {
    return PAD.left + ((price - priceMin) / (priceMax - priceMin)) * IW;
  }
  function yOf(pl: number): number {
    return PAD.top + IH / 2 - (pl / yRange) * (IH / 2);
  }

  // Build SVG path
  const pts = prices.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p).toFixed(1)},${yOf(pls[i]).toFixed(1)}`).join(" ");

  // Split into above/below zero for fills
  const above: string[] = [];
  const below: string[] = [];
  const zeroY = yOf(0);

  const pushSeg = (seg: typeof prices, bucket: string[]) => {
    if (seg.length < 2) return;
    const path = seg.map((p, i) => {
      const x = xOf(p).toFixed(1);
      const y = yOf(calcPL(strategy, p, strike, premium, contracts)).toFixed(1);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    }).join(" ");
    bucket.push(path + ` L${xOf(seg[seg.length-1]).toFixed(1)},${zeroY.toFixed(1)} L${xOf(seg[0]).toFixed(1)},${zeroY.toFixed(1)} Z`);
  };

  let seg: number[] = [];
  let inAbove: boolean | null = null;
  for (let i = 0; i <= steps; i++) {
    const isAbove = pls[i] >= 0;
    if (inAbove === null) inAbove = isAbove;
    if (isAbove !== inAbove) {
      pushSeg(seg, inAbove ? above : below);
      seg = [prices[i - 1]];
      inAbove = isAbove;
    }
    seg.push(prices[i]);
  }
  if (seg.length > 1) pushSeg(seg, inAbove! ? above : below);

  const bes   = breakevens(strategy, strike, premium);
  const fmtPL = (v: number) => (v >= 0 ? "+" : "") + "$" + Math.abs(v).toFixed(0);
  const fmtY  = (v: number) => (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toFixed(0);

  const yTicks = [-yRange, -yRange / 2, 0, yRange / 2, yRange].map(v => ({
    v, y: yOf(v), label: fmtY(v),
  }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-label="Options P&L payoff chart"
    >
      <defs>
        <linearGradient id={`${uid}-up`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#10B981" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id={`${uid}-dn`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.3" />
        </linearGradient>
        <clipPath id={`${uid}-clip`}>
          <rect x={PAD.left} y={PAD.top} width={IW} height={IH} />
        </clipPath>
      </defs>

      {/* Grid lines */}
      {yTicks.map(t => (
        <g key={t.v}>
          <line
            x1={PAD.left} y1={t.y} x2={PAD.left + IW} y2={t.y}
            stroke={t.v === 0 ? "#7B8DB4" : "#1A1838"}
            strokeWidth={t.v === 0 ? 1.5 : 1}
            strokeDasharray={t.v === 0 ? "none" : "3 3"}
          />
          <text x={PAD.left - 6} y={t.y + 4} textAnchor="end" fontSize="9" fill="#4B5675" fontFamily="monospace">
            {t.label}
          </text>
        </g>
      ))}

      {/* Fill regions */}
      <g clipPath={`url(#${uid}-clip)`}>
        {above.map((d, i) => <path key={`a${i}`} d={d} fill={`url(#${uid}-up)`} />)}
        {below.map((d, i) => <path key={`b${i}`} d={d} fill={`url(#${uid}-dn)`} />)}

        {/* Current price vertical */}
        <line
          x1={xOf(currentPrice)} y1={PAD.top}
          x2={xOf(currentPrice)} y2={PAD.top + IH}
          stroke="#7B8DB4" strokeWidth="1" strokeDasharray="4 3"
        />

        {/* Strike vertical */}
        {strike >= priceMin && strike <= priceMax && (
          <line
            x1={xOf(strike)} y1={PAD.top}
            x2={xOf(strike)} y2={PAD.top + IH}
            stroke="#818CF8" strokeWidth="1" strokeDasharray="4 3"
          />
        )}

        {/* Breakeven verticals */}
        {bes.map(be => be >= priceMin && be <= priceMax && (
          <line key={be}
            x1={xOf(be)} y1={PAD.top}
            x2={xOf(be)} y2={PAD.top + IH}
            stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="none"
          />
        ))}

        {/* Main P&L line */}
        <path d={pts} fill="none" stroke="#34D399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Breakeven labels */}
        {bes.map(be => be >= priceMin && be <= priceMax && (
          <g key={`bel-${be}`}>
            <rect x={xOf(be) - 18} y={PAD.top + 1} width={36} height={13} rx="3" fill="#F59E0B" fillOpacity="0.15" />
            <text x={xOf(be)} y={PAD.top + 10} textAnchor="middle" fontSize="8.5" fill="#F59E0B" fontWeight="700" fontFamily="monospace">
              BE ${be.toFixed(1)}
            </text>
          </g>
        ))}
      </g>

      {/* x-axis labels */}
      {[0.65, 0.80, 1.00, 1.20, 1.35].map(pct => {
        const price = currentPrice * pct;
        const x = xOf(price);
        if (x < PAD.left || x > PAD.left + IW) return null;
        return (
          <text key={pct} x={x} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="9" fill="#4B5675" fontFamily="monospace">
            ${price.toFixed(0)}
          </text>
        );
      })}

      {/* Current price label */}
      {xOf(currentPrice) >= PAD.left && xOf(currentPrice) <= PAD.left + IW && (
        <g>
          <rect x={xOf(currentPrice) - 20} y={H - PAD.bottom + 22} width={40} height={13} rx="3" fill="#7B8DB4" fillOpacity="0.12" />
          <text x={xOf(currentPrice)} y={H - PAD.bottom + 31} textAnchor="middle" fontSize="8.5" fill="#7B8DB4" fontFamily="monospace">
            Now
          </text>
        </g>
      )}

      {/* Hover tooltip hint */}
      <text x={PAD.left + IW} y={PAD.top - 6} textAnchor="end" fontSize="9" fill="#333368">
        P&amp;L at expiry
      </text>

      {/* Current P&L at current price dot */}
      {(() => {
        const pl = calcPL(strategy, currentPrice, strike, premium, contracts);
        const cx = xOf(currentPrice);
        const cy = yOf(pl);
        if (cx < PAD.left || cx > PAD.left + IW) return null;
        const color = pl >= 0 ? "#34D399" : "#F87171";
        return (
          <g>
            <circle cx={cx} cy={cy} r={5} fill={color} stroke="#0D0B1A" strokeWidth={2} />
            <rect x={cx + 8} y={cy - 8} width={52} height={14} rx="3" fill="#0D0B1A" fillOpacity="0.85" />
            <text x={cx + 34} y={cy + 3} textAnchor="middle" fontSize="9.5" fill={color} fontWeight="700" fontFamily="monospace">
              {fmtPL(pl)}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

// ── Number input helper ───────────────────────────────────────────────────────

function Field({
  label, value, onChange, min, step, prefix, suffix,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; step?: number; prefix?: string; suffix?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] text-[#4B5675] uppercase tracking-widest">{label}</label>
      <div className="flex items-center gap-1 bg-[#0D0B1A] border border-[#252345] focus-within:border-emerald-500/40 rounded-xl px-3 py-2 transition-colors">
        {prefix && <span className="text-xs text-[#4B5675]">{prefix}</span>}
        <input
          type="number"
          min={min ?? 0}
          step={step ?? 1}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          className="flex-1 bg-transparent text-sm font-mono font-bold text-[#F1F5F9] outline-none min-w-0 w-0"
        />
        {suffix && <span className="text-[10px] text-[#4B5675]">{suffix}</span>}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function OptionsPLCalculator({ initialPrice }: { initialPrice?: number }) {
  const [strategy,  setStrategy]  = useState<Strategy>("long_call");
  const [currPrice, setCurrPrice] = useState(initialPrice ?? 175);
  const [strike,    setStrike]    = useState(initialPrice ? Math.round(initialPrice * 1.05) : 180);
  const [premium,   setPremium]   = useState(5);
  const [contracts, setContracts] = useState(1);

  const bes     = breakevens(strategy, strike, premium);
  const maxP    = maxProfit(strategy, strike, premium, contracts);
  const maxL    = maxLoss(strategy, strike, premium, contracts);
  const atPL    = calcPL(strategy, currPrice, strike, premium, contracts);
  const mult    = contracts * 100;
  const cost    = (strategy === "long_call" || strategy === "long_put")
    ? premium * mult
    : null;

  const strat = STRATEGIES.find(s => s.id === strategy)!;

  return (
    <div className="space-y-5">

      {/* Strategy tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {STRATEGIES.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStrategy(s.id)}
            className={`flex flex-col items-start gap-1 px-3 py-3 rounded-xl border text-left transition-all ${
              strategy === s.id
                ? "border-emerald-500/40 bg-emerald-500/[0.06]"
                : "border-[#252345] bg-[#13112A] hover:border-[#333368]"
            }`}
          >
            <span className="text-base leading-none">{s.emoji}</span>
            <p className={`text-[11px] font-bold leading-tight ${strategy === s.id ? "text-emerald-300" : "text-[#CBD5E1]"}`}>
              {s.label}
            </p>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-[#4B5675] -mt-2">{strat.desc}</p>

      {/* Inputs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Stock Price"  value={currPrice} onChange={setCurrPrice} min={0.01} step={0.5}  prefix="$" />
        <Field label="Strike Price" value={strike}    onChange={setStrike}    min={0.01} step={0.5}  prefix="$" />
        <Field
          label={strategy === "long_call" || strategy === "long_put" ? "Premium Paid" : "Premium Received"}
          value={premium}
          onChange={setPremium}
          min={0.01}
          step={0.05}
          prefix="$"
          suffix="/ share"
        />
        <Field label="Contracts"    value={contracts} onChange={setContracts} min={1}    step={1} suffix="× 100" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#13112A] border border-[#252345] rounded-xl px-4 py-3">
          <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Breakeven</p>
          <p className="text-sm font-black font-mono text-amber-400">
            {bes.map(b => `$${b.toFixed(2)}`).join(" / ")}
          </p>
        </div>
        <div className="bg-[#13112A] border border-[#252345] rounded-xl px-4 py-3">
          <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Max Profit</p>
          <p className="text-sm font-black font-mono text-emerald-400 leading-tight">{maxP}</p>
        </div>
        <div className="bg-[#13112A] border border-[#252345] rounded-xl px-4 py-3">
          <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">Max Loss</p>
          <p className="text-sm font-black font-mono text-rose-400 leading-tight">{maxL}</p>
        </div>
        <div className={`rounded-xl px-4 py-3 border ${atPL >= 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-rose-500/5 border-rose-500/20"}`}>
          <p className="text-[9px] text-[#4B5675] uppercase tracking-widest mb-1">P&L at Current Price</p>
          <p className={`text-sm font-black font-mono ${atPL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {atPL >= 0 ? "+" : ""}${Math.abs(atPL).toFixed(0)}
          </p>
        </div>
      </div>

      {cost !== null && (
        <p className="text-[11px] text-[#4B5675]">
          Total cost: <span className="text-[#CBD5E1] font-bold font-mono">${cost.toFixed(0)}</span> · {contracts} contract{contracts !== 1 ? "s" : ""} × 100 shares × ${premium}/share
        </p>
      )}

      {/* Chart */}
      <div className="bg-[#0A0815] border border-[#252345] rounded-2xl p-4 overflow-x-auto">
        <div className="min-w-[340px]">
          <PayoffChart
            strategy={strategy}
            currentPrice={currPrice}
            strike={strike}
            premium={premium}
            contracts={contracts}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 flex-wrap text-[9px] text-[#4B5675] uppercase tracking-widest">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#7B8DB4]" style={{ backgroundImage: "repeating-linear-gradient(90deg,#7B8DB4 0,#7B8DB4 4px,transparent 4px,transparent 7px)" }} />
          Current price
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-violet-400" style={{ backgroundImage: "repeating-linear-gradient(90deg,#818CF8 0,#818CF8 4px,transparent 4px,transparent 7px)" }} />
          Strike
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-amber-400" />
          Breakeven
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-emerald-400" />
          P&L line
        </span>
        <span className="ml-auto text-[#333368]">Payoff at expiry · Not financial advice</span>
      </div>
    </div>
  );
}
