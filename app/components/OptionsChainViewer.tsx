"use client";

import { useEffect, useRef, useState } from "react";

type Greek = {
  bid:    number | null;
  ask:    number | null;
  last:   number | null;
  iv:     number | null;
  delta:  number | null;
  gamma:  number | null;
  theta:  number | null;
  oi:     number | null;
  volume: number | null;
};

type ChainRow = {
  strike: number;
  call:   Greek;
  put:    Greek;
};

type ChainData = {
  symbol:   string;
  price:    number;
  expiry:   string;
  expiries: string[];
  dte:      number;
  chain:    ChainRow[];
  maxOI:    number;
};

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(v: number | null, digits = 2): string {
  if (v === null || v === 0) return "—";
  return v.toFixed(digits);
}

function fmtK(v: number | null): string {
  if (v === null || v === 0) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

function fmtExpiry(iso: string): string {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return iso; }
}

// ── OI mini-bar ───────────────────────────────────────────────────────────────

function OIBar({ oi, maxOI, side }: { oi: number | null; maxOI: number; side: "call" | "put" }) {
  const pct = oi && maxOI > 0 ? Math.min(100, (oi / maxOI) * 100) : 0;
  if (pct < 1) return <span className="text-[#333368]">—</span>;
  return (
    <div className={`flex items-center gap-1 ${side === "call" ? "flex-row-reverse" : "flex-row"}`}>
      <span className="text-[9px] font-mono text-[#7B8DB4] tabular-nums w-7 text-right">{fmtK(oi)}</span>
      <div className="w-10 h-1.5 bg-[#1A1838] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${side === "call" ? "bg-emerald-500/50 ml-auto" : "bg-rose-500/50"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Header row ────────────────────────────────────────────────────────────────

function ColHeader({ label, side }: { label: string; side: "call" | "put" | "strike" }) {
  const cls =
    side === "strike"
      ? "text-center text-[8px] font-black uppercase tracking-widest text-[#4B5675] px-3"
      : "text-[8px] font-black uppercase tracking-widest text-[#4B5675]";
  return <th className={cls}>{label}</th>;
}

// ── Single chain row ──────────────────────────────────────────────────────────

function ChainRowEl({
  row, price, maxOI, isAtm,
}: {
  row:   ChainRow;
  price: number;
  maxOI: number;
  isAtm: boolean;
}) {
  const callItm = row.strike <  price;
  const putItm  = row.strike >  price;

  const callRowBg = callItm ? "bg-emerald-500/[0.04]" : "";
  const putRowBg  = putItm  ? "bg-rose-500/[0.04]"   : "";

  const callTxt = callItm
    ? "text-[#CBD5E1]"
    : "text-[#4B5675]";
  const putTxt = putItm
    ? "text-[#CBD5E1]"
    : "text-[#4B5675]";

  // delta color: calls positive, puts negative
  const callDeltaColor = (row.call.delta ?? 0) >= 0.4 ? "text-emerald-400" : callItm ? "text-[#94A3B8]" : "text-[#4B5675]";
  const putDeltaColor  = Math.abs(row.put.delta ?? 0) >= 0.4 ? "text-rose-400" : putItm  ? "text-[#94A3B8]" : "text-[#4B5675]";

  const cellBase = "py-1.5 px-1 text-[10px] font-mono tabular-nums";

  return (
    <tr className={`border-b border-white/[0.03] ${isAtm ? "relative" : ""}`}>

      {/* ── CALL SIDE ── */}
      <td className={`${cellBase} text-right ${callRowBg} ${callTxt}`}>
        {fmt(row.call.bid)}
      </td>
      <td className={`${cellBase} text-right ${callRowBg} ${callTxt}`}>
        {fmt(row.call.ask)}
      </td>
      <td className={`${cellBase} text-right ${callRowBg} ${callItm ? "text-violet-400" : "text-[#4B5675]"}`}>
        {row.call.iv !== null ? `${row.call.iv}%` : "—"}
      </td>
      <td className={`${cellBase} text-right ${callRowBg} ${callDeltaColor}`}>
        {fmt(row.call.delta, 2)}
      </td>
      <td className={`${cellBase} pr-2 ${callRowBg}`}>
        <div className="flex justify-end">
          <OIBar oi={row.call.oi} maxOI={maxOI} side="call" />
        </div>
      </td>
      <td className={`${cellBase} text-right pr-2 ${callRowBg} ${callItm ? "text-[#7B8DB4]" : "text-[#333368]"}`}>
        {fmtK(row.call.volume)}
      </td>

      {/* ── STRIKE ── */}
      <td className={`${cellBase} text-center px-3 font-black text-sm ${
        isAtm
          ? "text-amber-400 bg-amber-500/10 border-x border-amber-500/20"
          : "text-[#94A3B8] bg-[#0D0B1A] border-x border-[#1A1838]"
      }`}>
        {row.strike % 1 === 0 ? row.strike.toFixed(0) : row.strike.toFixed(1)}
        {isAtm && (
          <span className="block text-[7px] font-bold text-amber-500/70 leading-none -mt-0.5">ATM</span>
        )}
      </td>

      {/* ── PUT SIDE ── */}
      <td className={`${cellBase} pl-2 text-left ${putRowBg} ${putItm ? "text-[#7B8DB4]" : "text-[#333368]"}`}>
        {fmtK(row.put.volume)}
      </td>
      <td className={`${cellBase} pl-2 ${putRowBg}`}>
        <OIBar oi={row.put.oi} maxOI={maxOI} side="put" />
      </td>
      <td className={`${cellBase} text-left ${putRowBg} ${putDeltaColor}`}>
        {row.put.delta !== null ? fmt(Math.abs(row.put.delta), 2) : "—"}
      </td>
      <td className={`${cellBase} text-left ${putRowBg} ${putItm ? "text-violet-400" : "text-[#4B5675]"}`}>
        {row.put.iv !== null ? `${row.put.iv}%` : "—"}
      </td>
      <td className={`${cellBase} text-left ${putRowBg} ${putTxt}`}>
        {fmt(row.put.ask)}
      </td>
      <td className={`${cellBase} text-left ${putRowBg} ${putTxt}`}>
        {fmt(row.put.bid)}
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OptionsChainViewer({ initialSymbol }: { initialSymbol?: string }) {
  const [symbol,   setSymbol]   = useState(initialSymbol ?? "");
  const [loading,  setLoading]  = useState(false);
  const [data,     setData]     = useState<ChainData | null>(null);
  const [error,    setError]    = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (initialSymbol) load(initialSymbol, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(sym: string, expiry: string | null) {
    const s = sym.trim().toUpperCase();
    if (!s || loading) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ symbol: s });
      if (expiry) params.set("expiry", expiry);
      const res = await fetch(`/api/market/options-chain?${params}`, {
        cache: "no-store",
        signal: abortRef.current.signal,
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Failed");
      setData(json as ChainData);
      setSymbol(s);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load chain");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  // Find ATM row index (closest strike to current price)
  const atmIdx = data
    ? data.chain.reduce(
        (best, row, i) =>
          Math.abs(row.strike - data.price) < Math.abs(data.chain[best].strike - data.price) ? i : best,
        0,
      )
    : -1;

  return (
    <div className="space-y-4">

      {/* ── Search ── */}
      <div className="flex gap-2 max-w-xl">
        <input
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && load(symbol, null)}
          placeholder="Ticker — AAPL, NVDA, TSLA, SPY…"
          className="flex-1 bg-[#13112A] border border-[#252345] rounded-xl px-4 py-3 text-sm text-[#F1F5F9] placeholder-[#4B5675] focus:outline-none focus:border-emerald-500/50"
        />
        <button
          type="button"
          onClick={() => load(symbol, null)}
          disabled={loading || !symbol.trim()}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors px-5 py-3 rounded-xl text-sm font-bold whitespace-nowrap flex items-center gap-2"
        >
          {loading
            ? <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Loading…</>
            : "Load Chain"}
        </button>
      </div>

      {/* ── Quick picks ── */}
      {!data && !loading && (
        <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-6 py-12 text-center">
          <p className="text-3xl mb-3">⛓️</p>
          <p className="text-sm font-semibold text-[#F1F5F9] mb-1">Options Chain</p>
          <p className="text-xs text-[#4B5675] max-w-sm mx-auto leading-relaxed mb-5">
            Full strike table with Bid / Ask / IV / Delta / OI / Volume — color-coded by moneyness. Data from CBOE (15-min delayed).
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {["AAPL", "NVDA", "TSLA", "SPY", "QQQ", "AMD"].map(t => (
              <button key={t} type="button"
                onClick={() => { setSymbol(t); load(t, null); }}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#1A1838] border border-[#252345] text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/30 transition-all">
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && !data && (
        <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-6 py-10 flex flex-col items-center gap-3">
          <svg className="animate-spin w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          <p className="text-sm text-[#4B5675]">Fetching options chain from CBOE…</p>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl px-4 py-3">
          <p className="text-xs text-rose-400">{error}</p>
        </div>
      )}

      {/* ── Chain data ── */}
      {data && (
        <>
          {/* Price hero + DTE */}
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <p className="text-xl font-black text-[#F1F5F9]">{data.symbol}</p>
              <p className="text-xs text-[#4B5675]">Current price</p>
            </div>
            <p className="text-2xl font-black font-mono text-[#F1F5F9]">${data.price.toFixed(2)}</p>
            <div className="ml-auto flex items-center gap-2">
              {loading && (
                <svg className="animate-spin w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              )}
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                data.dte < 7  ? "bg-rose-500/10 text-rose-400 border-rose-500/25" :
                data.dte < 14 ? "bg-amber-500/10 text-amber-400 border-amber-500/25" :
                                "bg-sky-500/10 text-sky-400 border-sky-500/20"
              }`}>{data.dte}d DTE</span>
            </div>
          </div>

          {/* Expiry tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
            {data.expiries.map(exp => (
              <button
                key={exp}
                type="button"
                onClick={() => load(data.symbol, exp)}
                disabled={loading}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                  exp === data.expiry
                    ? "bg-violet-600 text-white"
                    : "bg-[#1A1838] text-[#4B5675] hover:text-[#F1F5F9] hover:bg-[#252345] border border-[#252345]"
                }`}
              >
                {fmtExpiry(exp)}
              </button>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-[9px] text-[#4B5675] uppercase tracking-widest flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/30" />
              Calls ITM
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/20 border border-rose-500/30" />
              Puts ITM
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/15 border border-amber-500/30" />
              ATM Strike
            </span>
            <span className="ml-auto text-[#333368]">15-min delayed · CBOE · Not financial advice</span>
          </div>

          {/* Chain table (scrollable) */}
          <div className="overflow-x-auto rounded-2xl border border-[#252345] bg-[#0A0815]">
            <table className="w-full border-collapse" style={{ minWidth: 620 }}>
              <thead>
                {/* Side labels */}
                <tr className="border-b border-[#252345]">
                  <th colSpan={6} className="py-2 text-center text-[9px] font-black uppercase tracking-widest text-emerald-500/70 bg-emerald-500/[0.03]">
                    CALLS
                  </th>
                  <th className="py-2 px-3 text-center text-[9px] font-black uppercase tracking-widest text-[#4B5675] bg-[#0D0B1A] border-x border-[#1A1838]">
                    STRIKE
                  </th>
                  <th colSpan={6} className="py-2 text-center text-[9px] font-black uppercase tracking-widest text-rose-500/70 bg-rose-500/[0.03]">
                    PUTS
                  </th>
                </tr>
                {/* Column headers */}
                <tr className="border-b border-[#1A1838]">
                  {/* Call columns — right-aligned */}
                  <ColHeader label="Bid"    side="call" />
                  <ColHeader label="Ask"    side="call" />
                  <ColHeader label="IV"     side="call" />
                  <ColHeader label="Δ"      side="call" />
                  <ColHeader label="OI"     side="call" />
                  <ColHeader label="Vol"    side="call" />
                  <ColHeader label=""       side="strike" />
                  {/* Put columns — left-aligned */}
                  <ColHeader label="Vol"    side="put" />
                  <ColHeader label="OI"     side="put" />
                  <ColHeader label="Δ"      side="put" />
                  <ColHeader label="IV"     side="put" />
                  <ColHeader label="Ask"    side="put" />
                  <ColHeader label="Bid"    side="put" />
                </tr>
              </thead>
              <tbody>
                {data.chain.map((row, i) => (
                  <ChainRowEl
                    key={row.strike}
                    row={row}
                    price={data.price}
                    maxOI={data.maxOI}
                    isAtm={i === atmIdx}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-center text-[10px] text-[#333368]">
            Options data from CBOE (15-min delay) · Greeks are model estimates · Not financial advice
          </p>
        </>
      )}
    </div>
  );
}
