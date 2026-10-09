"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Glyph } from "./Icon";

// ── Types ─────────────────────────────────────────────────────────────────────

type CoinRow = {
  symbol:   string;  // e.g. "BTC-USD"
  ticker:   string;  // e.g. "BTC"
  name:     string;
  price:    number | null;
  change:   number | null;
  cap?:     number | null;
};

type BacktestStats = {
  buyCount:      number;
  buyHitRate:    number | null;
  buyAvgReturn:  number | null;
  sellCount:     number;
  sellHitRate:   number | null;
  sellAvgReturn: number | null;
  baselineAvgReturn: number | null;
};

type CryptoMover = {
  symbol:     string;
  ticker:     string;
  name:       string;
  price:      number | null;
  changePct:  number | null;
  rsi14:      number | null;
  bbWidthPct: number | null;
  squeeze:    boolean;
  bigMove:    boolean;
  sparkline?: number[];
  signal:     "BUY" | "HOLD" | "SELL" | null;
  confidence: "High" | "Medium" | "Low" | null;
  score:      number | null;
  trend5dPct: number | null;
  dailyBias:  "Bullish" | "Bearish" | "Neutral" | null;
  overbought: boolean;
  oversold:   boolean;
  backtest:   BacktestStats | null;
};

// ── Static universe ───────────────────────────────────────────────────────────

const COINS: { symbol: string; ticker: string; name: string; emoji: string }[] = [
  { symbol: "BTC-USD",  ticker: "BTC",  name: "Bitcoin",        emoji: "₿" },
  { symbol: "ETH-USD",  ticker: "ETH",  name: "Ethereum",       emoji: "Ξ" },
  { symbol: "SOL-USD",  ticker: "SOL",  name: "Solana",         emoji: "◎" },
  { symbol: "BNB-USD",  ticker: "BNB",  name: "BNB",            emoji: "⬡" },
  { symbol: "XRP-USD",  ticker: "XRP",  name: "XRP",            emoji: "✕" },
  { symbol: "ADA-USD",  ticker: "ADA",  name: "Cardano",        emoji: "₳" },
  { symbol: "AVAX-USD", ticker: "AVAX", name: "Avalanche",      emoji: "▲" },
  { symbol: "DOGE-USD", ticker: "DOGE", name: "Dogecoin",       emoji: "Ð" },
  { symbol: "LINK-USD", ticker: "LINK", name: "Chainlink",      emoji: "⬡" },
  { symbol: "DOT-USD",  ticker: "DOT",  name: "Polkadot",       emoji: "●" },
  // MATIC/POL both return stale data on Yahoo since the Polygon migration — TRX is live
  { symbol: "TRX-USD",  ticker: "TRX",  name: "Tron",           emoji: "⬟" },
  { symbol: "UNI7083-USD", ticker: "UNI", name: "Uniswap",      emoji: "🦄" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function fmtPrice(p: number | null): string {
  if (p === null) return "—";
  if (p >= 10_000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (p >= 1)      return `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (p >= 0.01)   return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

function fmtCap(n: number | null): string {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

// Same weighted engine as the stock "AI Signals" feature (app/lib/smartMoney.ts),
// fed real crypto price/volume/trend data — BUY reads as "expect up," SELL as
// "expect down." No LLM involved; this is deterministic math, not a guarantee.
function directionLabel(signal: CryptoMover["signal"]): { label: string; cls: string; arrow: string } {
  if (signal === "BUY")  return { label: "Bullish", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25", arrow: "▲" };
  if (signal === "SELL") return { label: "Bearish", cls: "text-rose-400 bg-rose-500/10 border-rose-500/25",         arrow: "▼" };
  if (signal === "HOLD") return { label: "Neutral", cls: "text-amber-400 bg-amber-500/10 border-amber-500/25",      arrow: "—" };
  return { label: "—", cls: "text-[#4B5675] bg-[#1A1838] border-[#252345]", arrow: "" };
}

// Walk-forward backtest of THIS signal type on THIS coin's own price history —
// shown next to the badge so a "Bullish" call isn't taken on faith. Compares
// against the unconditional baseline return so a good-looking hit rate during
// a broad decline (where almost any SELL "works") doesn't read as skill it
// doesn't have.
function backtestReadout(signal: CryptoMover["signal"], bt: BacktestStats | null | undefined): { text: string; cls: string } | null {
  if (!bt || (signal !== "BUY" && signal !== "SELL")) return null;
  const count    = signal === "BUY" ? bt.buyCount     : bt.sellCount;
  const hitRate  = signal === "BUY" ? bt.buyHitRate   : bt.sellHitRate;
  const avgRet   = signal === "BUY" ? bt.buyAvgReturn : bt.sellAvgReturn;
  if (count < 10 || hitRate === null || avgRet === null || bt.baselineAvgReturn === null) return null;
  // For SELL, "beating baseline" means falling MORE than the unconditional average.
  const edge = signal === "BUY" ? avgRet - bt.baselineAvgReturn : bt.baselineAvgReturn - avgRet;
  const cls  = edge > 0.15 ? "text-emerald-400/80" : edge < -0.15 ? "text-rose-400/80" : "text-[#4B5675]";
  return { text: `History: ${hitRate}% right · ${count} signals`, cls };
}

// ── Coin card ─────────────────────────────────────────────────────────────────

function MiniSparkline({ closes, up }: { closes: number[]; up: boolean }) {
  if (closes.length < 2) return null;
  const W = 100, H = 26;
  const min = Math.min(...closes), max = Math.max(...closes), range = max - min || 1;
  const pts = closes
    .map((c, i) => `${((i / (closes.length - 1)) * W).toFixed(1)},${(H - 2 - ((c - min) / range) * (H - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[26px] mt-2 opacity-70" aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={up ? "#10B981" : "#F43F5E"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function CoinCard({ coin, row, mover }: { coin: typeof COINS[0]; row: CoinRow | undefined; loading: boolean; mover?: CryptoMover }) {
  const up  = (row?.change ?? 0) >= 0;
  const dir = directionLabel(mover?.signal ?? null);
  const bt  = backtestReadout(mover?.signal ?? null, mover?.backtest);
  const extended = mover?.overbought ? "Overbought" : mover?.oversold ? "Oversold" : null;

  return (
    <Link
      href={`/analysis?symbol=${encodeURIComponent(coin.symbol)}`}
      className="card-shine glass surface-sheen bg-[#13112A] rounded-2xl border border-[#252345] hover:border-emerald-500/20 transition-all p-4 block group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#1A1838] border border-[#252345] flex items-center justify-center text-sm font-black text-[#CBD5E1]">
            <Glyph e={coin.emoji} />
          </div>
          <div>
            <p className="font-black text-sm text-[#F1F5F9] leading-tight">{coin.ticker}</p>
            <p className="text-[9px] text-[#4B5675]">{coin.name}</p>
          </div>
        </div>
        {row?.change !== null && row?.change !== undefined && (
          <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${
            up ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border-rose-500/20"
          }`}>
            {up ? "+" : ""}{row.change.toFixed(2)}%
          </span>
        )}
      </div>

      {row?.price !== null && row?.price !== undefined ? (
        <p className="text-xl font-black font-mono text-[#F1F5F9] group-hover:text-emerald-300 transition-colors">
          {fmtPrice(row.price)}
        </p>
      ) : (
        <p className="text-xl font-black font-mono text-[#252345] animate-pulse">——</p>
      )}

      {mover?.sparkline && mover.sparkline.length > 1 && <MiniSparkline closes={mover.sparkline} up={up} />}

      {mover?.signal && (
        <div className="mt-2.5 pt-2.5 border-t border-[#1A1838] space-y-1">
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] font-black px-1.5 py-px rounded border ${dir.cls}`}>{dir.arrow} {dir.label}</span>
            {mover.confidence && <span className="text-[8px] text-[#4B5675] font-semibold">{mover.confidence} conf</span>}
            {extended && <span className="text-[8px] text-amber-400/80 font-semibold">{extended}</span>}
            {mover.trend5dPct !== null && (
              <span className={`ml-auto text-[8px] font-mono font-bold ${mover.trend5dPct >= 0 ? "text-emerald-400/70" : "text-rose-400/70"}`}>
                5d {mover.trend5dPct >= 0 ? "+" : ""}{mover.trend5dPct.toFixed(1)}%
              </span>
            )}
          </div>
          {bt && <p className={`text-[8px] font-semibold ${bt.cls}`}>{bt.text}</p>}
        </div>
      )}

      <p className="text-[9px] text-[#333368] mt-1.5">Full analysis →</p>
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CryptoDashboard() {
  const [rows,    setRows]    = useState<CoinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [movers,  setMovers]  = useState<CryptoMover[]>([]);

  useEffect(() => {
    const symbols = COINS.map(c => c.symbol).join(",");
    fetch(`/api/market/heatmap?symbols=${encodeURIComponent(symbols)}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: { symbol: string; price: number | null; change: number | null }[]) => {
        setRows(data.map(d => ({ symbol: d.symbol, ticker: d.symbol.replace("-USD", ""), name: "", price: d.price, change: d.change })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/market/crypto-movers", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { coins?: CryptoMover[] } | null) => setMovers(d?.coins ?? []))
      .catch(() => {});
  }, []);

  const bigMovers = movers.filter(m => m.bigMove).sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));
  const squeezes  = movers.filter(m => m.squeeze).sort((a, b) => (a.bbWidthPct ?? 100) - (b.bbWidthPct ?? 100));
  const bullish   = movers.filter(m => m.signal === "BUY");
  const bearish   = movers.filter(m => m.signal === "SELL");
  const neutral   = movers.filter(m => m.signal === "HOLD");

  function rowFor(symbol: string): CoinRow | undefined {
    return rows.find(r => r.symbol === symbol);
  }
  function moverFor(symbol: string): CryptoMover | undefined {
    return movers.find(m => m.symbol === symbol);
  }

  // Market overview row
  const btc     = rowFor("BTC-USD");
  const eth     = rowFor("ETH-USD");
  const btcUp   = (btc?.change ?? 0) >= 0;
  const ethUp   = (eth?.change ?? 0) >= 0;

  return (
    <div className="space-y-5">

      {/* Overview strip */}
      {!loading && (btc?.price || eth?.price) && (
        <div className="flex flex-wrap gap-4 items-center px-5 py-3.5 bg-[#13112A] border border-[#252345] rounded-2xl">
          {btc?.price && (
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-black text-[#4B5675]">BTC</span>
              <span className="font-mono font-black text-[#F1F5F9]">{fmtPrice(btc.price)}</span>
              <span className={`text-[11px] font-bold ${btcUp ? "text-emerald-400" : "text-rose-400"}`}>
                {btcUp ? "+" : ""}{btc.change?.toFixed(2)}%
              </span>
            </div>
          )}
          <div className="w-px h-4 bg-[#252345]" />
          {eth?.price && (
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-black text-[#4B5675]">ETH</span>
              <span className="font-mono font-black text-[#F1F5F9]">{fmtPrice(eth.price)}</span>
              <span className={`text-[11px] font-bold ${ethUp ? "text-emerald-400" : "text-rose-400"}`}>
                {ethUp ? "+" : ""}{eth.change?.toFixed(2)}%
              </span>
            </div>
          )}
          {movers.length > 0 && (
            <>
              <div className="w-px h-4 bg-[#252345]" />
              <div className="flex items-center gap-2.5">
                <span className="text-[9px] text-[#4B5675] uppercase tracking-wider">Signals</span>
                <span className="text-[11px] font-black text-emerald-400">{bullish.length} Bullish</span>
                <span className="text-[11px] font-black text-amber-400">{neutral.length} Neutral</span>
                <span className="text-[11px] font-black text-rose-400">{bearish.length} Bearish</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Moving Now — already underway, so you don't miss it */}
      {bigMovers.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-bold uppercase tracking-widest text-amber-400">Moving Now</h2>
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">{bigMovers.length}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {bigMovers.map(m => (
              <Link key={m.symbol} href={`/analysis?symbol=${encodeURIComponent(m.symbol)}`}
                className="bg-[#0D0B1A] rounded-xl border border-l-2 border-amber-500/20 border-l-amber-400 p-3.5 flex flex-col gap-1.5 hover:border-[#333368] transition-colors">
                <div className="flex items-center justify-between">
                  <span className="font-black font-mono text-sm text-[var(--text-primary,#F1F5F9)]">{m.ticker}</span>
                  <span className={`text-[10px] font-mono font-black ${(m.changePct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {(m.changePct ?? 0) >= 0 ? "+" : ""}{m.changePct?.toFixed(2)}%
                  </span>
                </div>
                <span className="text-sm font-black font-mono text-[var(--text-primary,#F1F5F9)]">{fmtPrice(m.price)}</span>
              </Link>
            ))}
          </div>
          <p className="text-[9px] text-[#333368] mt-2">≥5% move over the last ~24h — the move is already happening, not a forecast.</p>
        </div>
      )}

      {/* Coiled — Bollinger squeeze relative to the coin's own recent range */}
      {squeezes.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-bold uppercase tracking-widest text-sky-400">Coiled — Watch List</h2>
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">{squeezes.length}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {squeezes.map(m => (
              <Link key={m.symbol} href={`/analysis?symbol=${encodeURIComponent(m.symbol)}`}
                className="bg-[#0D0B1A] rounded-xl border border-l-2 border-sky-500/20 border-l-sky-400 p-3.5 flex flex-col gap-1.5 hover:border-[#333368] transition-colors">
                <div className="flex items-center justify-between">
                  <span className="font-black font-mono text-sm text-[var(--text-primary,#F1F5F9)]">{m.ticker}</span>
                  <span className="text-[9px] font-mono font-bold text-sky-400">{ordinal(m.bbWidthPct ?? 0)} pctl</span>
                </div>
                <span className="text-sm font-black font-mono text-[var(--text-primary,#F1F5F9)]">{fmtPrice(m.price)}</span>
              </Link>
            ))}
          </div>
          <p className="text-[9px] text-[#333368] mt-2">
            Bollinger Bands unusually tight vs. this coin&rsquo;s own recent range — historically often precedes a bigger move, but not a signal of direction or timing. Squeezes can sit like this for weeks before anything happens.
          </p>
        </div>
      )}

      {/* Grid */}
      <div>
        {!loading && movers.length > 0 && (
          <p className="text-[10px] text-[#4B5675] mb-2.5">
            Each coin&rsquo;s Bullish/Neutral/Bearish read comes from the same weighted engine behind the stock AI Signals — 5-day trend, volume, moving-average alignment — computed off the last fully closed day, off real crypto price data. The &ldquo;History&rdquo; line under each pick is a walk-forward backtest of that exact logic against the coin&rsquo;s own past year, checked without hindsight. Read it before the badge: several coins show weak or negative edge once compared to simply doing nothing over the same stretch — this engine was tuned on stock behavior, and crypto doesn&rsquo;t reliably follow the same patterns. Not a guarantee.
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {loading ? (
            Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-[#13112A] border border-[#252345] rounded-2xl p-4 animate-pulse">
                <div className="flex gap-2 mb-3">
                  <div className="w-8 h-8 bg-[#252345] rounded-xl" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-[#252345] rounded w-12" />
                    <div className="h-2 bg-[#252345] rounded w-16" />
                  </div>
                </div>
                <div className="h-6 bg-[#252345] rounded w-24" />
              </div>
            ))
          ) : (
            COINS.map(coin => (
              <CoinCard key={coin.symbol} coin={coin} row={rowFor(coin.symbol)} loading={loading} mover={moverFor(coin.symbol)} />
            ))
          )}
        </div>
      </div>

      <p className="text-center text-[10px] text-[#333368]">
        Live prices via Yahoo Finance (15-min delay) · Click any coin for AI analysis · Not financial advice
      </p>
    </div>
  );
}
