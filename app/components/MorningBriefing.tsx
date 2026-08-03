"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getPortfolio } from "../lib/trading";
import { scopedKey } from "../lib/userState";

// ─── Types ───────────────────────────────────────────────────────────────────

type RawData = {
  vix: number | null;
  spy: number | null; spyChg: number | null;
  qqq: number | null; qqqChg: number | null;
  iwm: number | null; iwmChg: number | null;
  es:  number | null; esChg:  number | null;
  gold:   number | null; goldChg:   number | null;
  silver: number | null; silverChg: number | null;
  oil:    number | null; oilChg:    number | null;
  btc:    number | null; btcChg:    number | null;
  tnx:    number | null; tnxChg:    number | null;
  dxy:    number | null; dxyChg:    number | null;
  eurusd: number | null; eurChg:    number | null;
  xlk: number | null; xlf: number | null;
  xle: number | null; xlv: number | null;
};

type Opportunity = {
  rank:       number;
  asset:      string;
  name:       string;
  type:       string;
  sector:     string;
  trend:      "Bullish" | "Bearish" | "Ranging";
  timeHorizon: string;
  thesis:     string;
  bullCase:   string;
  bearCase:   string;
  catalyst:   string;
  setupNote:   string;
  entryZone:  string;
  stopLoss:   string;
  target1:    string;
  target2:    string | null;
  rrRatio:    string;
  riskLevel:  "Low" | "Medium" | "High" | "Very High";
  confidence: number;
  optionsPlay: string | null;
  expectedVolatility: string;
  keyRisk:    string;
  facts:        string[];
  probabilities: string[];
  speculative:  string | null;
};

type CalEvent = {
  time:           string;
  event:          string;
  importance:     "High" | "Medium" | "Low";
  expectedImpact: string;
};

type KeyLevels = {
  SPY:  { support: string[]; resistance: string[]; fvg: string | null; orderBlock: string | null };
  QQQ:  { support: string[]; resistance: string[]; fvg: string | null; orderBlock: string | null };
  Gold: { support: string[]; resistance: string[]; notes: string };
};

type OptionsPlay = {
  rank:          number;
  symbol:        string;
  name:          string;
  direction:     "Calls" | "Puts";
  strike:        string;
  expiry:        string;
  dte:           number;
  entryTrigger:  string;
  entryPrice:    string;
  stopCondition: string;
  target:        string;
  maxRisk:       string;
  riskRating:    "Low" | "Medium" | "High" | "Extreme";
  dteRisk:       string;
  ivContext:     string;
  confidence:    number;
  thesis:        string;
  hardGates:     string;
};

type FuturesPlay = {
  rank:             number;
  contract:         string;
  name:             string;
  direction:        "Long" | "Short";
  entryZone:        string;
  stopLoss:         string;
  target1:          string;
  target2:          string | null;
  rrRatio:          string;
  sessionTiming:    string;
  pointValue:       string;
  riskPerContract:  string;
  microContract:    string;
  leverageWarning:  string;
  riskRating:       "Low" | "Medium" | "High" | "Extreme";
  confidence:       number;
  thesis:           string;
  keyLevel:         string;
};

type BriefingData = {
  session:      string;
  regime:       string;
  regimeColor:  "bullish" | "bearish" | "mixed";
  regimeDetail: string;
  vixReading:   string;
  marketOutlook: {
    summary:        string;
    bullishFactors: string[];
    bearishFactors: string[];
    keyRisks:       string[];
  };
  marketAnalysis: {
    bias:            string;
    killZone:        string;
    priceZone:       string;
    liquidityAbove:  string;
    liquidityBelow:  string;
    keyFVG:          string | null;
    keyOrderBlock:   string | null;
    sectorLeaders:   string[];
    sectorLaggers:   string[];
    smtDivergence:   string | null;
    marketMakerModel: string;
  };
  opportunities:     Opportunity[];
  topOptionsPlays:   OptionsPlay[];
  topFuturesPlays:   FuturesPlay[];
  economicCalendar:  CalEvent[];
  keyLevels:         KeyLevels;
  riskWarnings:      string[];
  positionSizingNote: string;
  overallConfidence:  number;
  _raw: { session: string; regime: string; data: RawData };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DATE_KEY_BASE  = "traxora-briefing-date";
const CACHE_KEY_BASE = "traxora-briefing-cache-v3"; // v3: options/futures plays now included (max_tokens 8000)
const CACHE_TTL      = 4 * 60 * 60 * 1000; // 4 hours

function loadCache(): BriefingData | null {
  try {
    const raw = localStorage.getItem(scopedKey(CACHE_KEY_BASE));
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: BriefingData };
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(scopedKey(CACHE_KEY_BASE)); return null; }
    return data;
  } catch { return null; }
}
function saveCache(data: BriefingData) {
  try { localStorage.setItem(scopedKey(CACHE_KEY_BASE), JSON.stringify({ ts: Date.now(), data })); } catch { /* quota full */ }
}

function getETHour() {
  const now = new Date();
  const y   = now.getUTCFullYear();
  // US DST: 2nd Sunday of March at 07:00 UTC → 1st Sunday of November at 06:00 UTC
  const march1    = new Date(Date.UTC(y, 2, 1));
  const dstStart  = new Date(Date.UTC(y, 2, 1 + ((7 - march1.getUTCDay()) % 7) + 7, 7));
  const nov1      = new Date(Date.UTC(y, 10, 1));
  const dstEnd    = new Date(Date.UTC(y, 10, 1 + ((7 - nov1.getUTCDay()) % 7), 6));
  const off       = (now >= dstStart && now < dstEnd) ? -4 : -5;
  const et        = new Date(now.getTime() + off * 3_600_000);
  return { hour: et.getUTCHours(), minute: et.getUTCMinutes(), day: et.getUTCDay() };
}

function pct(n: number | null) {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function px(n: number | null, dp = 2) {
  return n != null ? `$${n.toFixed(dp)}` : "—";
}
function chgCls(n: number | null) {
  if (n == null) return "text-[#4B5675]";
  return n >= 0 ? "text-emerald-400" : "text-rose-400";
}
function confCls(n: number) {
  if (n >= 75) return "text-emerald-400";
  if (n >= 55) return "text-amber-400";
  return "text-rose-400";
}
function riskCls(r: string) {
  if (r === "Low")      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (r === "Medium")   return "bg-amber-500/10  text-amber-400  border-amber-500/20";
  if (r === "High")     return "bg-rose-500/10   text-rose-400   border-rose-500/20";
  return "bg-teal-500/10 text-teal-400 border-teal-500/20";
}
function trendIcon(t: string) {
  if (t === "Bullish") return "↑";
  if (t === "Bearish") return "↓";
  return "↔";
}
function impCls(imp: string) {
  if (imp === "High")   return "bg-rose-500/10 text-rose-400 border-rose-500/20";
  if (imp === "Medium") return "bg-amber-500/10 text-amber-400 border-amber-500/20";
  return "bg-[#252345] text-[#4B5675] border-[#252345]";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Tile({ label, value, chg, sub }: { label: string; value: string; chg: number | null; sub?: string }) {
  return (
    <div className="bg-[#0D0B1A] border border-[#252345] rounded-xl p-2.5 text-center min-w-0">
      <p className="text-[7px] text-[#4B5675] uppercase tracking-widest mb-1 truncate">{label}</p>
      <p className={`text-[11px] font-black font-mono leading-tight truncate ${chgCls(chg)}`}>{value}</p>
      {sub && <p className={`text-[9px] font-mono mt-0.5 truncate ${chgCls(chg)}`}>{sub}</p>}
    </div>
  );
}

function SectionHead({ label, icon }: { label: string; icon: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-base">{icon}</span>
      <span className="text-[10px] font-black text-[#7B8DB4] uppercase tracking-widest">{label}</span>
      <div className="flex-1 h-px bg-[#252345]" />
    </div>
  );
}

function ConfBar({ pct: p }: { pct: number }) {
  const w = Math.round(p / 5) * 5;
  const cls = p >= 75 ? "bg-emerald-500" : p >= 55 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1 bg-[#252345] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${cls} w-pct-${w}`} />
      </div>
      <span className={`text-[9px] font-black ${confCls(p)}`}>{p}%</span>
    </div>
  );
}

function OppCard({ opp }: { opp: Opportunity }) {
  const [open, setOpen] = useState(false);
  const trendCls = opp.trend === "Bullish" ? "text-emerald-400" : opp.trend === "Bearish" ? "text-rose-400" : "text-amber-400";

  return (
    <div className="border border-[#252345] rounded-2xl overflow-hidden bg-[#0D0B1A]">
      {/* Card header — always visible */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-[#0D1420] transition-colors"
      >
        {/* Rank badge */}
        <span className="w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[10px] font-black text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
          {opp.rank}
        </span>

        <div className="flex-1 min-w-0">
          {/* Row 1: ticker + name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black text-[#F1F5F9]">{opp.asset}</span>
            <span className="text-[10px] text-[#4B5675] truncate max-w-[140px]">{opp.name}</span>
            <span className={`text-[9px] font-bold ${trendCls}`}>{trendIcon(opp.trend)} {opp.trend}</span>
            <span className={`text-[8px] px-1.5 py-0.5 rounded border ${riskCls(opp.riskLevel)}`}>{opp.riskLevel} risk</span>
            <span className="text-[8px] text-[#4B5675] bg-[#252345] px-1.5 py-0.5 rounded">{opp.timeHorizon}</span>
          </div>

          {/* Row 2: thesis preview */}
          <p className={`text-xs text-[#7B8DB4] mt-1 ${open ? "" : "line-clamp-1"}`}>{opp.thesis}</p>

          {/* Row 3: entry / R:R / confidence */}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-[9px] text-[#4B5675]">Entry: <span className="text-[#CBD5E1] font-mono">{opp.entryZone}</span></span>
            <span className="text-[9px] text-[#4B5675]">R:R <span className="text-emerald-400 font-black">{opp.rrRatio}</span></span>
            <ConfBar pct={opp.confidence} />
          </div>
        </div>

        {/* Expand toggle */}
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 mt-1 text-[#4B5675] transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="px-4 pb-4 border-t border-[#252345] space-y-4 pt-3">

          {/* Setup */}
          <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3">
            <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1">Setup</p>
            <p className="text-xs text-[#CBD5E1] leading-relaxed">{opp.setupNote}</p>
          </div>

          {/* Levels grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-[#13112A] border border-[#252345] rounded-xl p-2.5">
              <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-1">Entry Zone</p>
              <p className="text-xs font-black font-mono text-[#F1F5F9]">{opp.entryZone}</p>
            </div>
            <div className="bg-[#13112A] border border-rose-500/20 rounded-xl p-2.5">
              <p className="text-[8px] text-rose-400 uppercase tracking-widest mb-1">Stop Loss</p>
              <p className="text-xs font-black font-mono text-rose-400">{opp.stopLoss}</p>
            </div>
            <div className="bg-[#13112A] border border-emerald-500/20 rounded-xl p-2.5">
              <p className="text-[8px] text-emerald-400 uppercase tracking-widest mb-1">Target 1</p>
              <p className="text-xs font-black font-mono text-emerald-400">{opp.target1}</p>
            </div>
            {opp.target2 && (
              <div className="bg-[#13112A] border border-emerald-500/20 rounded-xl p-2.5">
                <p className="text-[8px] text-emerald-400 uppercase tracking-widest mb-1">Target 2</p>
                <p className="text-xs font-black font-mono text-emerald-400">{opp.target2}</p>
              </div>
            )}
          </div>

          {/* Bull / Bear */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-2.5">
              <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1">Bull Case</p>
              <p className="text-[10px] text-[#CBD5E1] leading-relaxed">{opp.bullCase}</p>
            </div>
            <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl p-2.5">
              <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest mb-1">Bear Case</p>
              <p className="text-[10px] text-[#CBD5E1] leading-relaxed">{opp.bearCase}</p>
            </div>
          </div>

          {/* Options play */}
          {opp.optionsPlay && (
            <div className="bg-teal-500/5 border border-teal-500/15 rounded-xl p-3">
              <p className="text-[8px] font-black text-teal-400 uppercase tracking-widest mb-1">Options Play</p>
              <p className="text-xs text-[#CBD5E1] leading-relaxed">{opp.optionsPlay}</p>
            </div>
          )}

          {/* Catalyst + Key Risk */}
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-1">Catalyst</p>
              <p className="text-[#CBD5E1]">{opp.catalyst}</p>
            </div>
            <div>
              <p className="text-[8px] text-rose-400 uppercase tracking-widest mb-1">Key Risk</p>
              <p className="text-[#CBD5E1]">{opp.keyRisk}</p>
            </div>
          </div>

          {/* Facts / Probabilities */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[8px] font-black text-[#F1F5F9] uppercase tracking-widest mb-1.5">Facts</p>
              <ul className="space-y-1">
                {(opp.facts ?? []).map((f, i) => (
                  <li key={i} className="text-[9px] text-[#7B8DB4] leading-relaxed flex gap-1.5">
                    <span className="text-emerald-400 shrink-0">•</span>{f}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[8px] font-black text-amber-400 uppercase tracking-widest mb-1.5">Probabilities</p>
              <ul className="space-y-1">
                {(opp.probabilities ?? []).map((p, i) => (
                  <li key={i} className="text-[9px] text-[#7B8DB4] leading-relaxed flex gap-1.5">
                    <span className="text-amber-400 shrink-0">~</span>{p}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Speculative */}
          {opp.speculative && (
            <div className="bg-[#252345] border border-[#333368] rounded-xl p-2.5">
              <p className="text-[8px] font-black text-[#4B5675] uppercase tracking-widest mb-1">Speculative</p>
              <p className="text-[9px] text-[#4B5675] italic">{opp.speculative}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = "overview" | "opportunities" | "options" | "futures" | "levels";

const LOAD_STEPS = [
  { label: "Fetching live market prices…",         duration: 4000 },
  { label: "Scanning 35+ instruments…",            duration: 6000 },
  { label: "Running AI analysis…",                 duration: 10000 },
  { label: "Building your brief…",                 duration: 8000 },
  { label: "Almost ready…",                        duration: 99999 },
];

export default function MorningBriefing() {
  const [visible,    setVisible]    = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [loadStep,   setLoadStep]   = useState(0);
  const [error,      setError]      = useState<string | null>(null);
  const [briefing,   setBriefing]   = useState<BriefingData | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [tab,        setTab]        = useState<Tab>("overview");
  const loadingRef = useRef(false);
  const stepTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Mounted in the root layout — close when the user navigates so the modal
  // doesn't follow them onto a page they deliberately clicked into.
  const pathname = usePathname();
  const pathRef  = useRef(pathname);
  useEffect(() => {
    if (pathname !== pathRef.current) {
      pathRef.current = pathname;
      setVisible(false);
      setManualOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!loading) { setLoadStep(0); stepTimers.current.forEach(clearTimeout); stepTimers.current = []; return; }
    let elapsed = 0;
    LOAD_STEPS.forEach((s, i) => {
      if (i === 0) return;
      elapsed += LOAD_STEPS[i - 1].duration;
      const t = setTimeout(() => setLoadStep(i), elapsed);
      stepTimers.current.push(t);
    });
    return () => { stepTimers.current.forEach(clearTimeout); stepTimers.current = []; };
  }, [loading]);

  function close() {
    setVisible(false);
    setManualOpen(false);
  }

  async function fetchBriefing(forceRefresh = false) {
    if (loadingRef.current) return;

    // Serve from cache unless the user explicitly hit Refresh
    if (!forceRefresh) {
      const cached = loadCache();
      if (cached) {
        setBriefing(cached);
        setVisible(true);
        setLoading(false);
        return;
      }
    }

    loadingRef.current = true;
    setLoading(true);
    setError(null);
    setBriefing(null);
    setTab("overview");
    try {
      const portfolio = getPortfolio();
      const totalValue = portfolio.holdings.reduce((s, h) => s + h.quantity * h.avgPrice, portfolio.cash);
      const portfolioSnapshot = {
        cash: portfolio.cash,
        holdingsCount: portfolio.holdings.length,
        totalValue,
        holdings: portfolio.holdings.map(h => ({ symbol: h.symbol.replace(".US","").replace(".COMM",""), quantity: h.quantity, avgPrice: h.avgPrice })),
        recentTradeCount: portfolio.trades.slice(0, 5).length,
      };
      const res = await fetch("/api/ai/briefing", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ portfolio: portfolioSnapshot }),
        cache:   "no-store",
      });
      let data: { ok?: boolean; reason?: string; error?: string; opportunities?: unknown[] };
      try {
        data = await res.json();
      } catch {
        setError("Briefing timed out — the server took too long. Please try again in a moment.");
        return;
      }
      if (data.reason === "OUTSIDE_WINDOW") {
        setError("Briefing unavailable — please try again in a moment.");
      } else if (data.reason === "AI_UNAVAILABLE") {
        setError("AI unavailable — no AI provider configured.");
      } else if (data.error) {
        setError(data.error);
      } else if (data.opportunities?.length) {
        setBriefing(data as BriefingData);
        saveCache(data as BriefingData);
        setVisible(true);
      } else {
        setError("Briefing returned empty — check your Anthropic API key.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error — could not reach server.");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    const { hour, minute, day } = getETHour();
    const totalMins  = hour * 60 + minute;
    const isWeekday  = day >= 1 && day <= 5;
    const isMorning  = totalMins >= 6 * 60 && totalMins < 7 * 60;
    const today      = new Date().toDateString();
    const alreadySeen = localStorage.getItem(scopedKey(DATE_KEY_BASE)) === today;

    if (isWeekday && isMorning && !alreadySeen) {
      localStorage.setItem(scopedKey(DATE_KEY_BASE), today);
      fetchBriefing();
    }

    function onManual() {
      setManualOpen(true);
      fetchBriefing();
    }
    window.addEventListener("traxora-show-briefing", onManual);
    return () => window.removeEventListener("traxora-show-briefing", onManual);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const show = visible || manualOpen;
  if (!show && !loading) return null;

  const d   = briefing?._raw?.data;
  const ma = briefing?.marketAnalysis;

  // 14-tile grid from _raw
  const tiles = d ? [
    { label: "VIX",     value: d.vix   != null ? d.vix.toFixed(2)  : "—", chg: null,       sub: d.vix != null ? (d.vix > 25 ? "High fear" : d.vix > 15 ? "Moderate" : "Complacent") : "" },
    { label: "SPY",     value: px(d.spy),                                  chg: d.spyChg,   sub: pct(d.spyChg)   },
    { label: "QQQ",     value: px(d.qqq),                                  chg: d.qqqChg,   sub: pct(d.qqqChg)   },
    { label: "IWM",     value: px(d.iwm),                                  chg: d.iwmChg,   sub: pct(d.iwmChg)   },
    { label: "ES/F",    value: px(d.es, 0),                                chg: d.esChg,    sub: pct(d.esChg)    },
    { label: "Gold",    value: px(d.gold, 0),                              chg: d.goldChg,  sub: pct(d.goldChg)  },
    { label: "Oil",     value: px(d.oil),                                  chg: d.oilChg,   sub: pct(d.oilChg)   },
    { label: "BTC",     value: px(d.btc, 0),                               chg: d.btcChg,   sub: pct(d.btcChg)   },
    { label: "10Y%",    value: d.tnx != null ? `${d.tnx.toFixed(3)}%` : "—", chg: d.tnxChg, sub: pct(d.tnxChg)  },
    { label: "DXY",     value: d.dxy != null ? d.dxy.toFixed(2) : "—",    chg: d.dxyChg,   sub: pct(d.dxyChg)   },
    { label: "EUR/USD", value: d.eurusd != null ? d.eurusd.toFixed(4) : "—", chg: d.eurChg, sub: pct(d.eurChg)  },
    { label: "Silver",  value: px(d.silver),                               chg: d.silverChg,sub: pct(d.silverChg)},
    { label: "XLK",     value: pct(d.xlk),                                 chg: d.xlk,      sub: "Tech"          },
    { label: "XLF",     value: pct(d.xlf),                                 chg: d.xlf,      sub: "Financials"    },
  ] : [];

  const regimeBg =
    briefing?.regimeColor === "bullish" ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" :
    briefing?.regimeColor === "bearish" ? "bg-rose-500/5 border-rose-500/20 text-rose-400" :
    "bg-amber-500/5 border-amber-500/20 text-amber-400";
  const regimeDot =
    briefing?.regimeColor === "bullish" ? "bg-emerald-400 shadow-[0_0_6px_#10B981]" :
    briefing?.regimeColor === "bearish" ? "bg-rose-400" : "bg-amber-400";

  const biasCls =
    ma?.bias === "Bullish" ? "text-emerald-400" :
    ma?.bias === "Bearish" ? "text-rose-400" : "text-amber-400";

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview",      label: "Overview" },
    { id: "opportunities", label: `Opportunities (${briefing?.opportunities?.length ?? 0})` },
    { id: "options",       label: `Options (${briefing?.topOptionsPlays?.length ?? 0})` },
    { id: "futures",       label: `Futures (${briefing?.topFuturesPlays?.length ?? 0})` },
    { id: "levels",        label: "Levels & Calendar" },
  ];

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-[#13112A] border border-[#252345] rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95dvh] sm:max-h-[92vh]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#252345] bg-gradient-to-r from-amber-500/8 to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🌅</span>
            <div>
              <p className="font-bold text-[#F1F5F9]">Morning Briefing</p>
              <p className="text-[10px] text-[#4B5675]">
                {briefing?._raw?.session ?? briefing?.session ?? "Loading market data…"} · Traxora AI
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {briefing && (
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-[#252345] rounded-lg">
                <span className="text-[8px] text-[#4B5675] uppercase tracking-widest">Confidence</span>
                <span className={`text-[10px] font-black ${confCls(briefing.overallConfidence)}`}>{briefing.overallConfidence}%</span>
              </div>
            )}
            {!loading && briefing && (
              <button
                type="button"
                id="discord-brief-btn"
                title="Copy Discord post"
                onClick={() => {
                  const opps = (briefing.opportunities ?? []).slice(0, 5);
                  const lines: string[] = [];
                  lines.push(`🌅 **Morning Brief** — ${briefing._raw?.session ?? briefing.session} | Traxora AI`);
                  lines.push(`📊 Market: **${briefing.marketAnalysis?.bias ?? briefing.regime}** · ${briefing.vixReading}`);
                  lines.push("");
                  if (opps.length > 0) {
                    lines.push("**Top Plays:**");
                    opps.forEach(o => {
                      const dir = o.trend === "Bullish" ? "🟢" : o.trend === "Bearish" ? "🔴" : "🟡";
                      lines.push(`${dir} **${o.asset}** — Entry ${o.entryZone} · Stop ${o.stopLoss} · T1 ${o.target1} · R:R ${o.rrRatio}`);
                    });
                  }
                  const optPlay = briefing.topOptionsPlays?.[0];
                  if (optPlay) {
                    lines.push("");
                    lines.push(`⚡ **Options:** ${optPlay.symbol} ${optPlay.direction} $${optPlay.strike} exp ${optPlay.expiry}`);
                  }
                  lines.push("");
                  lines.push("📈 **traxora.ai**");
                  navigator.clipboard.writeText(lines.join("\n")).then(() => {
                    const btn = document.getElementById("discord-brief-btn");
                    if (btn) { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = ""; btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>`; }, 2000); }
                  });
                }}
                className="w-8 h-8 rounded-xl bg-[#5865F2]/20 hover:bg-[#5865F2]/40 border border-[#5865F2]/30 flex items-center justify-center text-[#7B8DB4] hover:text-white transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                </svg>
              </button>
            )}
            {!loading && (
              <button
                type="button"
                onClick={() => fetchBriefing(true)}
                title="Refresh briefing (bypasses cache)"
                aria-label="Refresh briefing"
                className="w-8 h-8 rounded-xl bg-[#252345] hover:bg-[#333368] flex items-center justify-center text-[#7B8DB4] hover:text-[#F1F5F9] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={close}
              aria-label="Close morning briefing"
              className="w-8 h-8 rounded-xl bg-[#252345] hover:bg-[#333368] flex items-center justify-center text-[#7B8DB4] hover:text-[#F1F5F9] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Loading — step progress ── */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 gap-8">
            {/* Animated bars */}
            <div className="flex items-end gap-[3px] h-14">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="w-1.5 rounded-sm"
                  style={{
                    height: `${18 + Math.abs(Math.sin(i * 0.72)) * 32}px`,
                    background: i % 3 === 2 ? "#F23645" + "35" : "#00D17A" + "30",
                    animation: "pulse 1.6s ease-in-out infinite",
                    animationDelay: `${i * 65}ms`,
                  }} />
              ))}
            </div>

            {/* Step list */}
            <div className="w-full max-w-xs space-y-3">
              {LOAD_STEPS.slice(0, -1).map((step, i) => {
                const done    = i < loadStep;
                const current = i === loadStep;
                return (
                  <div key={i} className="flex items-center gap-3">
                    {/* Icon */}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 ${
                      done    ? "bg-emerald-500/20 border border-emerald-500/40" :
                      current ? "bg-emerald-500/10 border border-emerald-500/30 animate-pulse" :
                                "bg-[#1C1933] border border-[#252345]"
                    }`}>
                      {done ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      ) : current ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      ) : (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#252345]" />
                      )}
                    </div>
                    {/* Label */}
                    <span className={`text-xs font-medium transition-all duration-500 ${
                      done    ? "text-emerald-500/60 line-through" :
                      current ? "text-[#CBD5E1]" :
                                "text-[#2D3A52]"
                    }`}>{step.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div className="w-full max-w-xs h-0.5 rounded-full bg-[#1C1933] overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500/50 transition-all duration-1000 ease-out"
                style={{ width: `${Math.min(((loadStep) / (LOAD_STEPS.length - 1)) * 100, 90)}%` }} />
            </div>

            <p className="text-[10px] text-[#2D3A52] font-mono tracking-wider">TRAXORA AI · ANALYZING MARKETS</p>
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="flex-1 overflow-y-auto px-6 py-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-rose-400">Briefing Failed</p>
              <p className="text-xs text-[#4B5675] mt-1 max-w-sm mx-auto leading-relaxed">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => fetchBriefing(true)}
              className="bg-emerald-600 hover:bg-emerald-500 transition-colors px-5 py-2 rounded-xl text-xs font-bold mx-auto block"
            >
              Retry →
            </button>
          </div>
        )}

        {/* ── Full briefing ── */}
        {!loading && briefing && (
          <>
            {/* Tabs */}
            <div className="flex border-b border-[#252345] shrink-0">
              {tabs.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                    tab === t.id
                      ? "text-emerald-400 border-b-2 border-emerald-500"
                      : "text-[#4B5675] hover:text-[#7B8DB4]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── TAB: Overview ── */}
            {tab === "overview" && (
              <div className="flex-1 overflow-y-auto">
                {/* Regime banner */}
                <div className={`mx-6 mt-5 px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${regimeBg}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${regimeDot}`} />
                  <span className="font-black">{briefing.regime}</span>
                  <span className="font-normal opacity-80">— {briefing.regimeDetail}</span>
                </div>

                {/* VIX reading */}
                <div className="mx-6 mt-2 px-4 py-2 bg-[#0D0B1A] border border-[#252345] rounded-xl">
                  <span className="text-[8px] font-black text-[#4B5675] uppercase tracking-widest">VIX Reading · </span>
                  <span className="text-[10px] text-[#CBD5E1]">{briefing.vixReading}</span>
                </div>

                {/* 14-tile grid */}
                <div className="grid grid-cols-7 gap-1.5 px-6 pt-4">
                  {tiles.map(t => (
                    <Tile key={t.label} label={t.label} value={t.value} chg={t.chg} sub={t.sub} />
                  ))}
                </div>

                {/* Market Analysis */}
                <div className="px-6 pt-5">
                  <SectionHead label="Market Analysis" icon="🎯" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                    <div className="bg-[#0D0B1A] border border-emerald-500/20 rounded-xl p-3">
                      <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-1">Market Bias</p>
                      <p className={`text-sm font-black ${biasCls}`}>{ma?.bias}</p>
                    </div>
                    <div className="bg-[#0D0B1A] border border-[#252345] rounded-xl p-3">
                      <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-1">Price Zone</p>
                      <p className="text-xs font-bold text-[#F1F5F9]">{ma?.priceZone}</p>
                    </div>
                    <div className="bg-[#0D0B1A] border border-[#252345] rounded-xl p-3">
                      <p className="text-[8px] text-[#4B5675] uppercase tracking-widest mb-1">MM Phase</p>
                      <p className="text-xs font-bold text-teal-400">{ma?.marketMakerModel}</p>
                    </div>
                    <div className="bg-[#0D0B1A] border border-emerald-500/20 rounded-xl p-3">
                      <p className="text-[8px] text-emerald-400 uppercase tracking-widest mb-1">BSL (Liq. Above)</p>
                      <p className="text-xs font-mono text-[#F1F5F9]">{ma?.liquidityAbove}</p>
                    </div>
                    <div className="bg-[#0D0B1A] border border-rose-500/20 rounded-xl p-3">
                      <p className="text-[8px] text-rose-400 uppercase tracking-widest mb-1">SSL (Liq. Below)</p>
                      <p className="text-xs font-mono text-[#F1F5F9]">{ma?.liquidityBelow}</p>
                    </div>
                    <div className="bg-[#0D0B1A] border border-amber-500/20 rounded-xl p-3">
                      <p className="text-[8px] text-amber-400 uppercase tracking-widest mb-1">Kill Zone</p>
                      <p className="text-[10px] text-[#CBD5E1] leading-snug">{ma?.killZone}</p>
                    </div>
                  </div>

                  {/* FVG / OB / SMT */}
                  <div className="space-y-2">
                    {ma?.keyFVG && (
                      <div className="flex items-start gap-2 bg-[#0D0B1A] border border-[#252345] rounded-xl px-3 py-2">
                        <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest shrink-0 mt-0.5 w-8">FVG</span>
                        <p className="text-[10px] text-[#CBD5E1]">{ma.keyFVG}</p>
                      </div>
                    )}
                    {ma?.keyOrderBlock && (
                      <div className="flex items-start gap-2 bg-[#0D0B1A] border border-[#252345] rounded-xl px-3 py-2">
                        <span className="text-[8px] font-black text-amber-400 uppercase tracking-widest shrink-0 mt-0.5 w-8">OB</span>
                        <p className="text-[10px] text-[#CBD5E1]">{ma.keyOrderBlock}</p>
                      </div>
                    )}
                    {ma?.smtDivergence && (
                      <div className="flex items-start gap-2 bg-[#0D0B1A] border border-teal-500/20 rounded-xl px-3 py-2">
                        <span className="text-[8px] font-black text-teal-400 uppercase tracking-widest shrink-0 mt-0.5 w-8">SMT</span>
                        <p className="text-[10px] text-[#CBD5E1]">{ma.smtDivergence}</p>
                      </div>
                    )}
                  </div>

                  {/* Sector leaders / laggers */}
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-2.5">
                      <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1.5">Sector Leaders</p>
                      {(ma?.sectorLeaders ?? []).map((s, i) => (
                        <p key={i} className="text-[10px] text-[#CBD5E1]">↑ {s}</p>
                      ))}
                    </div>
                    <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl p-2.5">
                      <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest mb-1.5">Sector Laggers</p>
                      {(ma?.sectorLaggers ?? []).map((s, i) => (
                        <p key={i} className="text-[10px] text-[#CBD5E1]">↓ {s}</p>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Market Outlook */}
                <div className="px-6 pt-5 pb-2">
                  <SectionHead label="Market Outlook" icon="📊" />
                  <p className="text-xs text-[#CBD5E1] leading-relaxed mb-3">{briefing.marketOutlook.summary}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Bullish Factors</p>
                      {(briefing.marketOutlook?.bullishFactors ?? []).map((f, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <span className="text-emerald-400 text-[10px] shrink-0">+</span>
                          <p className="text-[10px] text-[#7B8DB4]">{f}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest">Bearish Factors</p>
                      {(briefing.marketOutlook?.bearishFactors ?? []).map((f, i) => (
                        <div key={i} className="flex gap-2 items-start">
                          <span className="text-rose-400 text-[10px] shrink-0">−</span>
                          <p className="text-[10px] text-[#7B8DB4]">{f}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {briefing.marketOutlook.keyRisks?.length > 0 && (
                    <div className="mt-3 bg-rose-500/5 border border-rose-500/15 rounded-xl p-3">
                      <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest mb-1.5">Key Risks Today</p>
                      {briefing.marketOutlook.keyRisks.map((r, i) => (
                        <p key={i} className="text-[10px] text-[#CBD5E1] mb-0.5">⚠ {r}</p>
                      ))}
                    </div>
                  )}
                </div>

                {/* Risk Warnings */}
                <div className="px-6 pt-4 pb-5">
                  <SectionHead label="Risk Warnings" icon="⚠️" />
                  <div className="space-y-2">
                    {(briefing.riskWarnings ?? []).map((w, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-rose-400 shrink-0 text-[10px] mt-0.5">!</span>
                        <p className="text-xs text-[#7B8DB4]">{w}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 bg-amber-500/5 border border-amber-500/15 rounded-xl px-3 py-2">
                    <span className="text-[8px] font-black text-amber-400 uppercase tracking-widest">Position Sizing · </span>
                    <span className="text-[10px] text-[#CBD5E1]">{briefing.positionSizingNote}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB: Opportunities ── */}
            {tab === "opportunities" && (
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
                <SectionHead label="Top 10 Ranked Opportunities" icon="🎯" />
                {(briefing.opportunities ?? []).map(opp => (
                  <OppCard key={opp.rank} opp={opp} />
                ))}
              </div>
            )}

            {/* ── TAB: Options Plays ── */}
            {tab === "options" && (
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
                <SectionHead label="Top 5 Options Plays" icon="📊" />
                {(briefing.topOptionsPlays ?? []).length === 0 ? (
                  <p className="text-xs text-[#4B5675] text-center py-8">Refresh the briefing to load options plays.</p>
                ) : (briefing.topOptionsPlays ?? []).map(p => {
                  const isFail    = p.hardGates?.toLowerCase().startsWith("fail");
                  const riskColor = p.riskRating === "Low" ? "text-emerald-400" : p.riskRating === "Medium" ? "text-amber-400" : "text-rose-400";
                  const dirColor  = p.direction === "Calls" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" : "bg-rose-500/10 text-rose-400 border-rose-500/25";
                  return (
                    <div key={p.rank} className={`bg-[#13112A] border rounded-2xl overflow-hidden ${isFail ? "border-rose-500/30" : "border-[#252345]"}`}>
                      <div className="flex items-center justify-between px-4 py-3 border-b border-[#252345]">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-[#4B5675]">#{p.rank}</span>
                          <p className="font-bold text-sm">{p.symbol}</p>
                          <p className="text-[10px] text-[#4B5675] truncate max-w-[120px]">{p.name}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${dirColor}`}>{p.direction}</span>
                          <span className={`text-[9px] font-bold ${riskColor}`}>{p.riskRating}</span>
                          <span className="text-[9px] font-mono text-[#4B5675]">{p.confidence}%</span>
                        </div>
                      </div>
                      <div className="px-4 py-3 space-y-2">
                        {isFail && (
                          <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-1.5">
                            <span className="text-rose-400 text-xs font-black">⛔</span>
                            <p className="text-[10px] text-rose-300 font-semibold">{p.hardGates}</p>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                          {[
                            { l: "Strike",  v: p.strike },
                            { l: "Expiry",  v: p.expiry },
                            { l: "Entry trigger", v: p.entryTrigger },
                            { l: "Stop condition",v: p.stopCondition },
                            { l: "Target",  v: p.target },
                            { l: "Max risk/contract", v: p.maxRisk },
                          ].map(r => (
                            <div key={r.l}>
                              <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">{r.l}</p>
                              <p className="text-[#CBD5E1] font-medium mt-0.5">{r.v}</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-[#7B8DB4] leading-relaxed border-t border-[#252345] pt-2">{p.thesis}</p>
                        <div className="flex gap-3 text-[9px] flex-wrap">
                          <span className="text-amber-400/80">📅 {p.dteRisk}</span>
                          <span className="text-sky-400/80">📈 {p.ivContext}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── TAB: Futures Plays ── */}
            {tab === "futures" && (
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
                <SectionHead label="Top 5 Futures Plays" icon="⚡" />
                {(briefing.topFuturesPlays ?? []).length === 0 ? (
                  <p className="text-xs text-[#4B5675] text-center py-8">Refresh the briefing to load futures plays.</p>
                ) : (briefing.topFuturesPlays ?? []).map(p => {
                  const isLong   = p.direction === "Long";
                  const dirColor = isLong ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" : "bg-rose-500/10 text-rose-400 border-rose-500/25";
                  const riskColor= p.riskRating === "Low" ? "text-emerald-400" : p.riskRating === "Medium" ? "text-amber-400" : "text-rose-400";
                  return (
                    <div key={p.rank} className="bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-[#252345]">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-[#4B5675]">#{p.rank}</span>
                          <p className="font-bold text-sm">{p.contract}</p>
                          <p className="text-[10px] text-[#4B5675]">{p.name}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${dirColor}`}>{p.direction}</span>
                          <span className={`text-[9px] font-bold ${riskColor}`}>{p.riskRating}</span>
                          <span className="text-[9px] font-mono text-emerald-400">{p.rrRatio}</span>
                        </div>
                      </div>
                      <div className="px-4 py-3 space-y-2">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
                          {[
                            { l: "Entry Zone",  v: p.entryZone },
                            { l: "Stop Loss",   v: p.stopLoss },
                            { l: "Target 1",    v: p.target1 },
                            { l: "Target 2",    v: p.target2 ?? "—" },
                            { l: "Point Value", v: p.pointValue },
                            { l: "Risk/Contract",v: p.riskPerContract },
                          ].map(r => (
                            <div key={r.l}>
                              <p className="text-[8px] text-[#4B5675] uppercase tracking-widest">{r.l}</p>
                              <p className="text-[#CBD5E1] font-medium mt-0.5">{r.v}</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-[#7B8DB4] leading-relaxed border-t border-[#252345] pt-2">{p.thesis}</p>
                        <div className="space-y-1">
                          <p className="text-[9px] text-amber-400/80">🕐 {p.sessionTiming}</p>
                          <p className="text-[9px] text-[#4B5675]">🔑 Key level: {p.keyLevel}</p>
                          <p className="text-[9px] text-sky-400/80">📦 Micro: {p.microContract}</p>
                          <p className="text-[9px] text-rose-400/70">⚠ {p.leverageWarning}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── TAB: Levels & Calendar ── */}
            {tab === "levels" && (
              <div className="flex-1 overflow-y-auto px-6 py-5">

                {/* Key Levels */}
                <SectionHead label="Key Price Levels" icon="📐" />
                <div className="space-y-3 mb-5">
                  {(["SPY", "QQQ", "Gold"] as const).map(sym => {
                    const lv = briefing.keyLevels[sym];
                    return (
                      <div key={sym} className="bg-[#0D0B1A] border border-[#252345] rounded-xl p-3">
                        <p className="text-xs font-black text-[#F1F5F9] mb-2">{sym}</p>
                        <div className="grid grid-cols-2 gap-3 text-[10px]">
                          <div>
                            <p className="text-[8px] text-emerald-400 uppercase tracking-widest mb-1">Support</p>
                            {lv.support.map((s, i) => <p key={i} className="font-mono text-[#CBD5E1]">▸ {s}</p>)}
                          </div>
                          <div>
                            <p className="text-[8px] text-rose-400 uppercase tracking-widest mb-1">Resistance</p>
                            {lv.resistance.map((r, i) => <p key={i} className="font-mono text-[#CBD5E1]">▸ {r}</p>)}
                          </div>
                          {"fvg" in lv && lv.fvg && (
                            <div className="col-span-2">
                              <span className="text-[8px] text-emerald-400 uppercase tracking-widest">FVG · </span>
                              <span className="text-[9px] text-[#7B8DB4]">{lv.fvg}</span>
                            </div>
                          )}
                          {"fvg" in lv && lv.orderBlock && (
                            <div className="col-span-2">
                              <span className="text-[8px] text-amber-400 uppercase tracking-widest">OB · </span>
                              <span className="text-[9px] text-[#7B8DB4]">{lv.orderBlock}</span>
                            </div>
                          )}
                          {"notes" in lv && lv.notes && (
                            <div className="col-span-2">
                              <span className="text-[8px] text-[#4B5675] uppercase tracking-widest">Notes · </span>
                              <span className="text-[9px] text-[#7B8DB4]">{lv.notes}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Economic Calendar */}
                <SectionHead label="Economic Calendar" icon="📅" />
                {briefing.economicCalendar?.length > 0 ? (
                  <div className="space-y-2">
                    {briefing.economicCalendar.map((ev, i) => (
                      <div key={i} className="flex items-start gap-3 bg-[#0D0B1A] border border-[#252345] rounded-xl px-3 py-2.5">
                        <div className="shrink-0">
                          <p className="text-[8px] font-black text-[#7B8DB4] font-mono">{ev.time}</p>
                          <span className={`text-[7px] px-1.5 py-0.5 rounded border font-bold uppercase ${impCls(ev.importance)}`}>
                            {ev.importance}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-[#F1F5F9]">{ev.event}</p>
                          <p className="text-[9px] text-[#4B5675] mt-0.5">{ev.expectedImpact}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#4B5675]">No major economic events scheduled.</p>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-[#252345] flex items-center justify-between shrink-0">
          <p className="text-[10px] text-[#333368]">Educational use only · Not financial advice</p>
          <button
            type="button"
            onClick={close}
            className="bg-emerald-600 hover:bg-emerald-500 transition-colors px-5 py-2 rounded-xl text-xs font-bold"
          >
            Start Trading →
          </button>
        </div>
      </div>
    </div>
  );
}
