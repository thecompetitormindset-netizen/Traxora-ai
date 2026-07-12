"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type CoinRow = {
  symbol:   string;  // e.g. "BTC-USD"
  ticker:   string;  // e.g. "BTC"
  name:     string;
  price:    number | null;
  change:   number | null;
  cap?:     number | null;
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
  { symbol: "MATIC-USD",ticker: "MATIC",name: "Polygon",        emoji: "⬟" },
  { symbol: "UNI7083-USD", ticker: "UNI", name: "Uniswap",      emoji: "🦄" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Coin card ─────────────────────────────────────────────────────────────────

function CoinCard({ coin, row }: { coin: typeof COINS[0]; row: CoinRow | undefined; loading: boolean }) {
  const up = (row?.change ?? 0) >= 0;

  return (
    <Link
      href={`/analysis?symbol=${encodeURIComponent(coin.symbol)}`}
      className="card-shine glass surface-sheen bg-[#13112A] rounded-2xl border border-[#252345] hover:border-emerald-500/20 transition-all p-4 block group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#1A1838] border border-[#252345] flex items-center justify-center text-sm font-black text-[#CBD5E1]">
            {coin.emoji}
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

      <p className="text-[9px] text-[#333368] mt-1">AI Analysis →</p>
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

  function rowFor(symbol: string): CoinRow | undefined {
    return rows.find(r => r.symbol === symbol);
  }

  // Market overview row
  const btc     = rowFor("BTC-USD");
  const eth     = rowFor("ETH-USD");
  const btcUp   = (btc?.change ?? 0) >= 0;
  const ethUp   = (eth?.change ?? 0) >= 0;
  const cryptoSentiment = btcUp && ethUp ? "Risk On" : !btcUp && !ethUp ? "Risk Off" : "Mixed";
  const sentimentColor  = cryptoSentiment === "Risk On" ? "text-emerald-400" : cryptoSentiment === "Risk Off" ? "text-rose-400" : "text-amber-400";

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
          <div className="w-px h-4 bg-[#252345]" />
          <div>
            <span className="text-[9px] text-[#4B5675] uppercase tracking-wider mr-2">Crypto Sentiment</span>
            <span className={`text-[11px] font-black ${sentimentColor}`}>{cryptoSentiment}</span>
          </div>
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
                  <span className="text-[9px] font-mono font-bold text-sky-400">{m.bbWidthPct}th pctl</span>
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
            <CoinCard key={coin.symbol} coin={coin} row={rowFor(coin.symbol)} loading={loading} />
          ))
        )}
      </div>

      <p className="text-center text-[10px] text-[#333368]">
        Live prices via Yahoo Finance (15-min delay) · Click any coin for AI analysis · Not financial advice
      </p>
    </div>
  );
}
