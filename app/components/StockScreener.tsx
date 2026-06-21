"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  symbol:     string;
  name:       string;
  sector:     string;
  marketCapB: number;
  peRatio:    number | null;
  price:      number | null;
  change:     number | null;
  volume:     number | null;
  avgVolume:  number | null;
  volRatio:   number | null;
};

// ── Filter types ──────────────────────────────────────────────────────────────

type CapFilter  = "all" | "mega" | "large" | "mid" | "small";
type VolFilter  = "all" | "1m" | "5m" | "10m" | "50m";
type PEFilter   = "all" | "value" | "fair" | "growth" | "high" | "na";
type SortBy     = "change" | "volume" | "cap" | "pe";
type SortDir    = "desc" | "asc";

// ── Static helpers ────────────────────────────────────────────────────────────

const SECTORS = ["All", "Technology", "Communication", "Consumer", "Finance", "Healthcare", "Energy", "Industrials", "Materials", "ETF"] as const;

const CAP_LABELS: Record<CapFilter, string> = {
  all:   "All Caps",
  mega:  "Mega >$500B",
  large: "Large $100–500B",
  mid:   "Mid $10–100B",
  small: "Small <$10B",
};

const VOL_LABELS: Record<VolFilter, string> = {
  all:  "Any Volume",
  "1m": ">1M shares",
  "5m": ">5M shares",
  "10m":">10M shares",
  "50m":">50M shares",
};

const PE_LABELS: Record<PEFilter, string> = {
  all:    "Any P/E",
  value:  "Value <15",
  fair:   "Fair 15–30",
  growth: "Growth 30–60",
  high:   "High >60",
  na:     "N/A / Loss",
};

function matchesCap(row: Row, f: CapFilter): boolean {
  const c = row.marketCapB;
  if (f === "all")   return true;
  if (f === "mega")  return c >= 500;
  if (f === "large") return c >= 100 && c < 500;
  if (f === "mid")   return c >= 10  && c < 100;
  if (f === "small") return c < 10;
  return true;
}

function matchesVol(row: Row, f: VolFilter): boolean {
  const v = (row.volume ?? 0) / 1_000_000;
  if (f === "all")  return true;
  if (f === "1m")   return v >= 1;
  if (f === "5m")   return v >= 5;
  if (f === "10m")  return v >= 10;
  if (f === "50m")  return v >= 50;
  return true;
}

function matchesPE(row: Row, f: PEFilter): boolean {
  const pe = row.peRatio;
  if (f === "all")    return true;
  if (f === "na")     return pe === null;
  if (pe === null)    return false;
  if (f === "value")  return pe < 15;
  if (f === "fair")   return pe >= 15 && pe < 30;
  if (f === "growth") return pe >= 30 && pe < 60;
  if (f === "high")   return pe >= 60;
  return true;
}

function fmtB(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}T`;
  return `$${n.toFixed(0)}B`;
}

function fmtVol(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// ── Filter pill button ────────────────────────────────────────────────────────

function Pill<T extends string>({
  value, active, label, onClick,
}: {
  value: T; active: boolean; label: string; onClick: (v: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
        active
          ? "bg-violet-600 text-white"
          : "bg-[#1A1838] border border-[#252345] text-[#4B5675] hover:text-[#F1F5F9] hover:border-[#333368]"
      }`}
    >
      {label}
    </button>
  );
}

// ── Volume bar ────────────────────────────────────────────────────────────────

function VolBar({ ratio }: { ratio: number | null }) {
  if (!ratio) return null;
  const pct = Math.min(100, (ratio / 3) * 100); // 3x avg = full bar
  const color = ratio >= 2 ? "bg-emerald-500" : ratio >= 1.2 ? "bg-amber-500" : "bg-[#333368]";
  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      <div className="flex-1 h-1 bg-[#1A1838] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[9px] font-mono font-bold ${ratio >= 2 ? "text-emerald-400" : ratio >= 1.2 ? "text-amber-400" : "text-[#333368]"}`}>
        {ratio.toFixed(1)}x
      </span>
    </div>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────

const SECTOR_COLOR: Record<string, string> = {
  Technology:    "text-violet-400 bg-violet-500/10 border-violet-500/20",
  Communication: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  Consumer:      "text-amber-400 bg-amber-500/10 border-amber-500/20",
  Finance:       "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  Healthcare:    "text-pink-400 bg-pink-500/10 border-pink-500/20",
  Energy:        "text-orange-400 bg-orange-500/10 border-orange-500/20",
  Industrials:   "text-sky-400 bg-sky-500/10 border-sky-500/20",
  Materials:     "text-teal-400 bg-teal-500/10 border-teal-500/20",
  ETF:           "text-[#7B8DB4] bg-[#1A1838] border-[#252345]",
};

function ResultCard({ row }: { row: Row }) {
  const up      = (row.change ?? 0) >= 0;
  const noData  = row.price === null;
  const secCls  = SECTOR_COLOR[row.sector] ?? "text-[#4B5675] bg-[#1A1838] border-[#252345]";

  return (
    <div className="card-shine glass surface-sheen bg-[#13112A] rounded-2xl border border-[#252345] hover:border-[#333368] transition-all overflow-hidden">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="font-black text-[#F1F5F9] text-base leading-tight">{row.symbol}</p>
            <p className="text-[10px] text-[#4B5675] truncate mt-0.5">{row.name}</p>
          </div>
          <span className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-md border ${secCls}`}>
            {row.sector}
          </span>
        </div>

        {/* Price + change */}
        <div className="flex items-end gap-2 mb-3">
          {noData ? (
            <p className="text-xl font-black text-[#333368] animate-pulse">——</p>
          ) : (
            <>
              <p className="text-xl font-black font-mono text-[#F1F5F9]">${row.price!.toFixed(2)}</p>
              <span className={`text-xs font-bold font-mono mb-0.5 ${up ? "text-emerald-400" : "text-rose-400"}`}>
                {up ? "+" : ""}{row.change!.toFixed(2)}%
              </span>
            </>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-3">
          <div>
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">Market Cap</p>
            <p className="text-[11px] font-bold text-[#94A3B8]">{fmtB(row.marketCapB)}</p>
          </div>
          <div>
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">P/E Ratio</p>
            <p className="text-[11px] font-bold text-[#94A3B8]">
              {row.peRatio !== null ? row.peRatio : <span className="text-[#333368]">N/A</span>}
            </p>
          </div>
          <div>
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">Volume</p>
            <p className="text-[11px] font-mono font-bold text-[#94A3B8]">{fmtVol(row.volume)}</p>
          </div>
          <div>
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">Avg Vol</p>
            <p className="text-[11px] font-mono font-bold text-[#94A3B8]">{fmtVol(row.avgVolume)}</p>
          </div>
        </div>

        {/* Volume ratio bar */}
        <VolBar ratio={row.volRatio} />
      </div>

      {/* Action footer */}
      <div className="border-t border-[#1A1838] px-4 py-2.5 flex items-center justify-between">
        <Link
          href={`/analysis?symbol=${encodeURIComponent(row.symbol + ".US")}`}
          className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          AI Signal →
        </Link>
        <Link
          href={`/intelligence?section=chain&sym=${encodeURIComponent(row.symbol)}`}
          className="text-[11px] font-bold text-violet-400 hover:text-violet-300 transition-colors"
        >
          Options ⛓️
        </Link>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function StockScreener() {
  const [rows,       setRows]       = useState<Row[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [updatedAt,  setUpdatedAt]  = useState<string | null>(null);
  const [error,      setError]      = useState("");

  // Filters
  const [sector,  setSector]  = useState<string>("All");
  const [cap,     setCap]     = useState<CapFilter>("all");
  const [vol,     setVol]     = useState<VolFilter>("all");
  const [pe,      setPE]      = useState<PEFilter>("all");
  const [sortBy,  setSortBy]  = useState<SortBy>("change");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/market/screener", { cache: "no-store" });
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const data = await res.json();
        setRows(data.rows ?? []);
        setUpdatedAt(data.updatedAt ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const filtered = rows
    .filter(r => sector === "All" || r.sector === sector)
    .filter(r => matchesCap(r, cap))
    .filter(r => matchesVol(r, vol))
    .filter(r => matchesPE(r, pe))
    .sort((a, b) => {
      let diff = 0;
      if (sortBy === "change")  diff = (a.change  ?? -999) - (b.change  ?? -999);
      if (sortBy === "volume")  diff = (a.volume   ?? 0)   - (b.volume   ?? 0);
      if (sortBy === "cap")     diff = a.marketCapB - b.marketCapB;
      if (sortBy === "pe")      diff = (a.peRatio  ?? 9999) - (b.peRatio  ?? 9999);
      return sortDir === "desc" ? -diff : diff;
    });

  function toggleSort(by: SortBy) {
    if (sortBy === by) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(by); setSortDir("desc"); }
  }

  const sortIcon = (by: SortBy) =>
    sortBy === by ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  return (
    <div className="space-y-5">

      {/* ── Filter panel ── */}
      <div className="card-shine glass surface-sheen rounded-2xl border border-[#252345] p-4 space-y-3">

        {/* Sector */}
        <div>
          <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-2">Sector</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-wrap">
            {SECTORS.map(s => (
              <Pill key={s} value={s} active={sector === s} label={s} onClick={setSector} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Market Cap */}
          <div>
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-2">Market Cap</p>
            <div className="flex gap-1.5 flex-wrap">
              {(["all", "mega", "large", "mid", "small"] as CapFilter[]).map(f => (
                <Pill key={f} value={f} active={cap === f} label={CAP_LABELS[f]} onClick={setCap} />
              ))}
            </div>
          </div>

          {/* Volume */}
          <div>
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-2">Today&apos;s Volume</p>
            <div className="flex gap-1.5 flex-wrap">
              {(["all", "1m", "5m", "10m", "50m"] as VolFilter[]).map(f => (
                <Pill key={f} value={f} active={vol === f} label={VOL_LABELS[f]} onClick={setVol} />
              ))}
            </div>
          </div>

          {/* P/E */}
          <div>
            <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-2">P/E Ratio</p>
            <div className="flex gap-1.5 flex-wrap">
              {(["all", "value", "fair", "growth", "high", "na"] as PEFilter[]).map(f => (
                <Pill key={f} value={f} active={pe === f} label={PE_LABELS[f]} onClick={setPE} />
              ))}
            </div>
          </div>
        </div>

        {/* Sort row */}
        <div className="flex items-center gap-2 pt-1 border-t border-[#1A1838] flex-wrap">
          <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">Sort:</p>
          {([
            ["change", "Day %"],
            ["volume", "Volume"],
            ["cap",    "Mkt Cap"],
            ["pe",     "P/E"],
          ] as [SortBy, string][]).map(([by, label]) => (
            <button key={by} type="button"
              onClick={() => toggleSort(by)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                sortBy === by
                  ? "bg-violet-600 text-white"
                  : "text-[#4B5675] hover:text-[#F1F5F9]"
              }`}
            >
              {label}{sortIcon(by)}
            </button>
          ))}

          <span className="ml-auto text-[9px] text-[#333368]">
            {loading ? "Loading…" : `${filtered.length} of ${rows.length} stocks`}
            {updatedAt && !loading && (
              <span> · {new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            )}
          </span>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl px-4 py-3">
          <p className="text-xs text-rose-400">{error}</p>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="bg-[#13112A] border border-[#252345] rounded-2xl p-4 animate-pulse">
              <div className="h-4 bg-[#252345] rounded w-14 mb-2" />
              <div className="h-3 bg-[#252345] rounded w-32 mb-4" />
              <div className="h-6 bg-[#252345] rounded w-24 mb-3" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-8 bg-[#252345] rounded" />
                <div className="h-8 bg-[#252345] rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── No results ── */}
      {!loading && !error && filtered.length === 0 && (
        <div className="bg-[#13112A] border border-[#252345] rounded-2xl px-6 py-10 text-center">
          <p className="text-2xl mb-2">🔍</p>
          <p className="text-sm font-semibold text-[#F1F5F9] mb-1">No stocks match</p>
          <p className="text-xs text-[#4B5675]">Try relaxing the filters above.</p>
        </div>
      )}

      {/* ── Results grid ── */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(row => <ResultCard key={row.symbol} row={row} />)}
        </div>
      )}

      <p className="text-center text-[10px] text-[#333368]">
        Live prices from Yahoo Finance (15-min delay) · Market cap &amp; P/E are approximate · Not financial advice
      </p>
    </div>
  );
}
