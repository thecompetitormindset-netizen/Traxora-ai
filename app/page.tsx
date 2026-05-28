"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ── ICT SVG diagrams ─────────────────────────────────────────────────────── */
function OBDiagram() {
  return (
    <svg viewBox="0 0 160 90" fill="none" className="w-full h-full">
      {[0,1,2,3].map((i) => (
        <g key={i}>
          <line x1={18+i*22} y1={10+i*4} x2={18+i*22} y2={58+i*2} stroke="#F43F5E" strokeWidth="1"/>
          <rect x={13+i*22} y={22+i*5} width="10" height="14" fill="#F43F5E" rx="1"/>
        </g>
      ))}
      <rect x="75" y="36" width="16" height="20" fill="#A855F7" fillOpacity="0.25" rx="2" stroke="#A855F7" strokeWidth="1"/>
      <text x="76" y="33" fill="#A855F7" fontSize="7" fontWeight="bold">OB</text>
      {[0,1,2].map((i) => (
        <g key={i}>
          <line x1={101+i*20} y1={60-i*14} x2={101+i*20} y2={75} stroke="#10B981" strokeWidth="1"/>
          <rect x={96+i*20} y={60-i*13} width="10" height="13" fill="#10B981" rx="1"/>
        </g>
      ))}
      <line x1="83" y1="56" x2="160" y2="56" stroke="#A855F7" strokeWidth="0.5" strokeDasharray="3 2"/>
      <line x1="83" y1="42" x2="160" y2="42" stroke="#A855F7" strokeWidth="0.5" strokeDasharray="3 2"/>
    </svg>
  );
}
function FVGDiagram() {
  return (
    <svg viewBox="0 0 160 90" fill="none" className="w-full h-full">
      <line x1="25" y1="65" x2="25" y2="30" stroke="#10B981" strokeWidth="1"/>
      <rect x="19" y="45" width="12" height="15" fill="#10B981" rx="1"/>
      <line x1="60" y1="62" x2="60" y2="10" stroke="#10B981" strokeWidth="1"/>
      <rect x="54" y="18" width="12" height="38" fill="#10B981" rx="1"/>
      <rect x="43" y="30" width="70" height="18" fill="#3B82F6" fillOpacity="0.18" rx="2"/>
      <text x="55" y="41" fill="#60A5FA" fontSize="7" fontWeight="bold">FVG</text>
      <line x1="95" y1="28" x2="95" y2="10" stroke="#10B981" strokeWidth="1"/>
      <rect x="89" y="14" width="12" height="12" fill="#10B981" rx="1"/>
      <line x1="38" y1="30" x2="160" y2="30" stroke="#3B82F6" strokeWidth="0.6" strokeDasharray="3 2"/>
      <line x1="38" y1="48" x2="160" y2="48" stroke="#3B82F6" strokeWidth="0.6" strokeDasharray="3 2"/>
      <line x1="125" y1="20" x2="125" y2="8" stroke="#10B981" strokeWidth="1"/>
      <rect x="119" y="10" width="12" height="10" fill="#10B981" rx="1"/>
      <line x1="148" y1="14" x2="148" y2="5" stroke="#10B981" strokeWidth="1"/>
      <rect x="142" y="6" width="12" height="8" fill="#10B981" rx="1"/>
    </svg>
  );
}
function LiqDiagram() {
  return (
    <svg viewBox="0 0 160 90" fill="none" className="w-full h-full">
      <line x1="10" y1="28" x2="150" y2="28" stroke="#FBBF24" strokeWidth="0.8" strokeDasharray="4 3"/>
      <text x="10" y="24" fill="#FBBF24" fontSize="7" fontWeight="bold">BSL</text>
      <polyline points="10,70 35,58 55,48 75,36" stroke="#94A3B8" strokeWidth="1.5" fill="none"/>
      <polyline points="75,36 90,18 100,16 108,22" stroke="#F43F5E" strokeWidth="1.5" fill="none"/>
      <line x1="95" y1="28" x2="95" y2="16" stroke="#F43F5E" strokeWidth="0.8"/>
      <text x="98" y="20" fill="#F43F5E" fontSize="6">sweep</text>
      <polyline points="108,22 118,35 130,52 148,68" stroke="#10B981" strokeWidth="1.5" fill="none"/>
      <polyline points="126,46 130,52 124,51" fill="#10B981" stroke="#10B981" strokeWidth="0.8"/>
    </svg>
  );
}
function MssDiagram() {
  return (
    <svg viewBox="0 0 160 90" fill="none" className="w-full h-full">
      <polyline points="10,20 30,35 50,28 70,48 90,40 108,58" stroke="#F43F5E" strokeWidth="1.5" fill="none"/>
      <text x="47" y="25" fill="#F43F5E" fontSize="6">LH</text>
      <text x="87" y="37" fill="#F43F5E" fontSize="6">LH</text>
      <text x="67" y="56" fill="#F43F5E" fontSize="6">LL</text>
      <line x1="90" y1="40" x2="160" y2="40" stroke="#94A3B8" strokeWidth="0.6" strokeDasharray="3 2"/>
      <polyline points="108,58 120,45 132,30 148,18" stroke="#10B981" strokeWidth="2" fill="none"/>
      <text x="134" y="37" fill="#10B981" fontSize="7" fontWeight="bold">MSS</text>
    </svg>
  );
}
function OteDiagram() {
  return (
    <svg viewBox="0 0 160 90" fill="none" className="w-full h-full">
      <polyline points="15,78 55,10" stroke="#94A3B8" strokeWidth="1.5" fill="none"/>
      <line x1="55" y1="10" x2="140" y2="10" stroke="#94A3B8" strokeWidth="0.5" strokeDasharray="2 2"/>
      <line x1="55" y1="78" x2="140" y2="78" stroke="#94A3B8" strokeWidth="0.5" strokeDasharray="2 2"/>
      <rect x="55" y="38" width="85" height="8" fill="#6366F1" fillOpacity="0.2" rx="1"/>
      <line x1="55" y1="38" x2="140" y2="38" stroke="#6366F1" strokeWidth="0.6" strokeDasharray="2 2"/>
      <line x1="55" y1="46" x2="140" y2="46" stroke="#6366F1" strokeWidth="0.6" strokeDasharray="2 2"/>
      <text x="8" y="41" fill="#6366F1" fontSize="6.5">61.8</text>
      <text x="8" y="49" fill="#6366F1" fontSize="6.5">78.6</text>
      <text x="100" y="44" fill="#818CF8" fontSize="7" fontWeight="bold">OTE</text>
      <polyline points="55,10 80,42 95,42 130,5" stroke="#10B981" strokeWidth="1.5" fill="none"/>
    </svg>
  );
}
function KzDiagram() {
  return (
    <svg viewBox="0 0 160 90" fill="none" className="w-full h-full">
      <line x1="10" y1="75" x2="155" y2="75" stroke="#4B5675" strokeWidth="0.8"/>
      <rect x="38" y="20" width="30" height="55" fill="#6366F1" fillOpacity="0.12" rx="2"/>
      <text x="42" y="17" fill="#818CF8" fontSize="6.5" fontWeight="bold">London</text>
      <polyline points="38,53 46,40 52,28 62,35 68,22" stroke="#6366F1" strokeWidth="1.5" fill="none"/>
      <rect x="90" y="20" width="30" height="55" fill="#10B981" fillOpacity="0.12" rx="2"/>
      <text x="97" y="17" fill="#10B981" fontSize="6.5" fontWeight="bold">NY</text>
      <polyline points="90,45 98,30 106,20 112,28 118,15" stroke="#10B981" strokeWidth="1.5" fill="none"/>
      <polyline points="68,22 80,25 90,28" stroke="#94A3B8" strokeWidth="1" strokeDasharray="2 1" fill="none"/>
    </svg>
  );
}

const CONCEPTS = [
  { tag:"OB",  title:"Order Blocks",          diagram:<OBDiagram />,  gradient:"from-purple-950 to-indigo-950",  accent:"text-purple-400", border:"border-purple-500/20",  tagBg:"bg-purple-500/10 border-purple-500/25", desc:"The last opposing candle before a strong move. Smart money leaves orders here — price returns to this zone before continuing.", search:"ICT Order Blocks tutorial" },
  { tag:"FVG", title:"Fair Value Gap",         diagram:<FVGDiagram />, gradient:"from-emerald-950 to-cyan-950",      accent:"text-emerald-400",   border:"border-emerald-500/20",    tagBg:"bg-emerald-500/10 border-emerald-500/25",     desc:"A price imbalance where the market moved too fast. Institutions send price back to fill these gaps before the next leg.",   search:"ICT Fair Value Gap FVG explained" },
  { tag:"LIQ", title:"Liquidity Sweep",        diagram:<LiqDiagram />, gradient:"from-amber-950 to-orange-950",  accent:"text-amber-400",  border:"border-amber-500/20",   tagBg:"bg-amber-500/10 border-amber-500/25",   desc:"Stops cluster above highs and below lows. Smart money sweeps these levels to fill large orders, then reverses hard.",       search:"ICT Liquidity sweep stop hunt tutorial" },
  { tag:"MSS", title:"Market Structure Shift", diagram:<MssDiagram />, gradient:"from-cyan-950 to-teal-950",     accent:"text-cyan-400",   border:"border-cyan-500/20",    tagBg:"bg-cyan-500/10 border-cyan-500/25",     desc:"When a downtrend breaks above its last lower high — or an uptrend below its last higher low — the trend is changing.",      search:"ICT Market Structure Shift CHoCH BOS" },
  { tag:"OTE", title:"Optimal Trade Entry",    diagram:<OteDiagram />, gradient:"from-emerald-950 to-violet-950", accent:"text-emerald-400", border:"border-emerald-500/20",  tagBg:"bg-emerald-500/10 border-emerald-500/25", desc:"The 61.8%–78.6% Fibonacci retracement of a swing. Highest-probability zone to enter after a pullback before continuation.", search:"ICT Optimal Trade Entry OTE Fibonacci" },
  { tag:"KZ",  title:"Kill Zones",             diagram:<KzDiagram />,  gradient:"from-rose-950 to-pink-950",     accent:"text-rose-400",   border:"border-rose-500/20",    tagBg:"bg-rose-500/10 border-rose-500/25",     desc:"London (2–5 am ET) and NY (7–10 am ET) are when 80% of institutional moves happen. Outside these windows, price drifts.",   search:"ICT Kill Zones London New York session" },
];

/* ── Dynamic data ─────────────────────────────────────────────────────────── */
const HERO_LINES = [
  { top: "Trade like",      bottom: "smart money."        },
  { top: "Think like an",   bottom: "institution."         },
  { top: "Read the market's", bottom: "footprints."        },
  { top: "Never miss a",    bottom: "Kill Zone."           },
  { top: "See what hedge", bottom: "funds see."            },
];

const HERO_SUBS = [
  "AI that reads price action like institutions — one clear signal per setup.",
  "ICT Smart Money concepts automated. Plain English, every trade.",
  "Order Blocks, FVGs, Liquidity sweeps — the framework that moves billions, now free.",
  "6 ICT concepts checked in seconds. One clear BUY, HOLD, or SELL.",
  "Know which sessions matter, which levels count, and when institutions move.",
];

const TICKER_ITEMS = [
  { sym:"NVDA",  price:"$134.50",  chg:"+2.41%",  up:true  },
  { sym:"AAPL",  price:"$189.20",  chg:"-0.84%",  up:false },
  { sym:"ES",    price:"$5,920",   chg:"+0.62%",  up:true  },
  { sym:"GC",    price:"$2,340",   chg:"+1.12%",  up:true  },
  { sym:"TSLA",  price:"$178.40",  chg:"-3.22%",  up:false },
  { sym:"MSFT",  price:"$415.80",  chg:"+1.05%",  up:true  },
  { sym:"AMZN",  price:"$198.60",  chg:"+0.77%",  up:true  },
  { sym:"JPM",   price:"$214.30",  chg:"-0.33%",  up:false },
  { sym:"NQ",    price:"$21,340",  chg:"+0.95%",  up:true  },
  { sym:"CL",    price:"$78.40",   chg:"-0.88%",  up:false },
  { sym:"META",  price:"$559.70",  chg:"+1.62%",  up:true  },
  { sym:"BTC",   price:"$95,200",  chg:"+3.14%",  up:true  },
];

const LIVE_SIGNALS = [
  { sym:"NVDA", name:"NVIDIA Corp.",    price:"$134.50", sig:"BUY",  conf:"High",   ob:"Bullish OB at $131.20", fvg:"FVG $132–134", liq:"BSL at $135.80", kz:"NY session" },
  { sym:"AAPL", name:"Apple Inc.",      price:"$189.20", sig:"HOLD", conf:"Medium", ob:"Premium zone, no OB",   fvg:"FVG filled $188", liq:"SSL at $186",   kz:"Pre-London" },
  { sym:"TSLA", name:"Tesla Inc.",      price:"$178.40", sig:"SELL", conf:"High",   ob:"Bearish OB at $182",    fvg:"FVG $179–181",  liq:"BSL swept $183", kz:"NY AM session" },
  { sym:"GC",   name:"Gold Futures",   price:"$2,340",  sig:"BUY",  conf:"High",   ob:"Bullish OB $2,325",     fvg:"FVG $2,328–332", liq:"SSL at $2,318",  kz:"London open"  },
  { sym:"MSFT", name:"Microsoft Corp.", price:"$415.80", sig:"BUY",  conf:"Medium", ob:"Bullish OB at $411",    fvg:"FVG $412–415",  liq:"BSL at $420",    kz:"NY session"   },
];

const QUOTES = [
  { text: "The market doesn't move randomly.", highlight: "Smart money leaves footprints.", end: "Traxora reads them." },
  { text: "Institutions don't buy at random.", highlight: "They accumulate at Order Blocks.", end: "Now you can see them too." },
  { text: "Most traders react to price.", highlight: "Smart money creates the move.", end: "Know the difference." },
];

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function HomePage() {
  const [heroIdx,    setHeroIdx]    = useState(0);
  const [heroVisible, setHeroVisible] = useState(true);
  const [signalIdx,  setSignalIdx]  = useState(0);
  const [signalFade, setSignalFade] = useState(true);
  const [quoteIdx,   setQuoteIdx]   = useState(0);
  const [conceptIdx, setConceptIdx] = useState(0);
  const [tickOffset, setTickOffset] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hero text rotation
  useEffect(() => {
    const id = setInterval(() => {
      setHeroVisible(false);
      setTimeout(() => {
        setHeroIdx(i => (i + 1) % HERO_LINES.length);
        setHeroVisible(true);
      }, 400);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  // Live signal rotation
  useEffect(() => {
    const id = setInterval(() => {
      setSignalFade(false);
      setTimeout(() => {
        setSignalIdx(i => (i + 1) % LIVE_SIGNALS.length);
        setSignalFade(true);
      }, 350);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // Quote rotation
  useEffect(() => {
    const id = setInterval(() => setQuoteIdx(i => (i + 1) % QUOTES.length), 5000);
    return () => clearInterval(id);
  }, []);

  // ICT concept rotation (one at a time, wraps)
  useEffect(() => {
    const id = setInterval(() => setConceptIdx(i => (i + 1) % CONCEPTS.length), 4000);
    return () => clearInterval(id);
  }, []);

  // Ticker scroll
  useEffect(() => {
    tickRef.current = setInterval(() => setTickOffset(o => (o + 1) % (TICKER_ITEMS.length * 120)), 30);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  const hero   = HERO_LINES[heroIdx];
  const heroSub = HERO_SUBS[heroIdx];
  const signal = LIVE_SIGNALS[signalIdx];
  const quote  = QUOTES[quoteIdx];
  const sigColor = signal.sig === "BUY" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" : signal.sig === "SELL" ? "text-rose-400 bg-rose-500/10 border-rose-500/30" : "text-amber-400 bg-amber-500/10 border-amber-500/30";
  const sigBorder = signal.sig === "BUY" ? "border-emerald-500/25" : signal.sig === "SELL" ? "border-rose-500/25" : "border-amber-500/25";

  return (
    <div className="min-h-screen text-[#F1F5F9] flex flex-col overflow-hidden">

      {/* ══ NAV ══ */}
      <nav className="relative z-20 border-b border-[#1C2333]/60 px-6 sm:px-8 h-16 flex items-center justify-between backdrop-blur-sm bg-[#060A14]/80 sticky top-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight">Traxora AI</span>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/explore"   className="text-sm text-[#4B5675] hover:text-[#F1F5F9] transition-colors hidden md:block">Markets</Link>
          <Link href="/analysis"  className="text-sm text-[#4B5675] hover:text-[#F1F5F9] transition-colors hidden md:block">Signals</Link>
          <Link href="/guide"     className="text-sm text-[#4B5675] hover:text-[#F1F5F9] transition-colors hidden md:block">Guide</Link>
          <Link href="/dashboard" className="bg-emerald-600 hover:bg-emerald-500 transition-all px-4 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95">
            Launch App →
          </Link>
        </div>
      </nav>

      {/* ══ TICKER BAR ══ */}
      <div className="border-b border-[#1C2333]/60 bg-[#060A14]/60 overflow-hidden py-2 relative">
        <div
          className="flex gap-0 whitespace-nowrap"
          style={{ transform: `translateX(-${tickOffset}px)`, transition: "transform 0.03s linear" }}
        >
          {[...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS].map((t, i) => (
            <span key={i} className="inline-flex items-center gap-2 px-6 text-[11px] font-mono">
              <span className="text-[#7B8DB4] font-bold">{t.sym}</span>
              <span className="text-[#F1F5F9]">{t.price}</span>
              <span className={t.up ? "text-emerald-400" : "text-rose-400"}>{t.chg}</span>
              <span className="text-[#1C2333]">|</span>
            </span>
          ))}
        </div>
      </div>

      {/* ══ HERO ══ */}
      <section className="relative flex flex-col items-center justify-center text-center px-6 sm:px-8 pt-24 pb-20 overflow-hidden">
        {/* Background glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-600/8 rounded-full blur-3xl animate-pulse" />
          <div className="absolute top-1/3 left-1/3 w-[400px] h-[200px] bg-violet-600/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 right-1/4 w-[300px] h-[200px] bg-cyan-600/4 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto">
          {/* Live badge */}
          <div className="inline-flex items-center gap-2 bg-emerald-500/8 border border-emerald-500/20 rounded-full px-4 py-1.5 text-xs text-emerald-400 font-medium mb-10">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Powered by Claude Opus 4.7 · ICT Smart Money Methodology
          </div>

          {/* Rotating headline */}
          <h1 className="text-6xl sm:text-7xl font-black tracking-tight leading-[1.05] mb-6 min-h-[160px] sm:min-h-[150px] flex flex-col items-center justify-center">
            <span
              className="block transition-all duration-400"
              style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? "translateY(0)" : "translateY(8px)" }}
            >
              {hero.top}
            </span>
            <span
              className="block bg-gradient-to-r from-emerald-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent transition-all duration-400"
              style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? "translateY(0)" : "translateY(8px)" }}
            >
              {hero.bottom}
            </span>
          </h1>

          {/* Rotating sub */}
          <p
            className="text-[#7B8DB4] text-lg leading-relaxed mb-10 max-w-xl mx-auto transition-all duration-400 min-h-[56px]"
            style={{ opacity: heroVisible ? 1 : 0 }}
          >
            {heroSub}
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/dashboard" className="bg-emerald-600 hover:bg-emerald-500 transition-all px-8 py-3.5 rounded-xl text-sm font-bold shadow-xl shadow-emerald-500/25 hover:scale-105 active:scale-95">
              Open Dashboard →
            </Link>
            <Link href="/explore" className="border border-[#1C2333] bg-[#0C1017]/60 hover:border-[#2D3A50] backdrop-blur-sm transition-all px-7 py-3.5 rounded-xl text-sm font-semibold text-[#7B8DB4] hover:text-[#F1F5F9]">
              Browse Markets
            </Link>
          </div>
        </div>

        {/* Floating signal card — animates between different signals */}
        <div className="relative z-10 mt-16 w-full max-w-sm mx-auto">
          <div
            className={`bg-[#0C1017] border ${sigBorder} rounded-2xl overflow-hidden shadow-2xl transition-all duration-350`}
            style={{ opacity: signalFade ? 1 : 0, transform: signalFade ? "translateY(0) scale(1)" : "translateY(4px) scale(0.99)" }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1C2333]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <p className="font-bold text-sm text-[#F1F5F9]">{signal.sym}</p>
                <p className="text-[10px] text-[#4B5675]">{signal.name}</p>
              </div>
              <span className={`text-xs font-black px-2.5 py-1 rounded-lg border ${sigColor}`}>{signal.sig}</span>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 gap-2 text-[10px]">
              {[
                { icon:"🟣", l:"Order Block", v:signal.ob },
                { icon:"🔵", l:"FVG",          v:signal.fvg },
                { icon:"🟡", l:"Liquidity",    v:signal.liq },
                { icon:"🕐", l:"Kill Zone",    v:signal.kz },
              ].map(r => (
                <div key={r.l} className="flex gap-1.5 items-start">
                  <span className="shrink-0 mt-px">{r.icon}</span>
                  <div>
                    <p className="text-[#4B5675]">{r.l}</p>
                    <p className="text-[#CBD5E1] font-medium">{r.v}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 pb-3 flex items-center justify-between">
              <p className="text-[10px] text-[#4B5675]">Confidence: <span className={signal.conf === "High" ? "text-emerald-400" : "text-amber-400"}>{signal.conf}</span></p>
              <p className="text-[10px] font-mono text-[#F1F5F9]">{signal.price}</p>
            </div>
          </div>
          <p className="text-[10px] text-[#2D3A50] text-center mt-2">Live AI analysis · Updates every few seconds</p>
        </div>
      </section>

      {/* ══ WHAT IS TRAXORA ══ */}
      <section className="px-6 sm:px-8 py-20 max-w-6xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row gap-16 items-start">
          <div className="lg:w-[55%]">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400 mb-5">What is Traxora AI?</p>
            <h2 className="text-4xl font-black tracking-tight leading-tight mb-6">
              Your AI co-pilot for<br />every trade decision.
            </h2>
            <div className="space-y-4 text-[#7B8DB4] text-[15px] leading-relaxed">
              <p>
                <strong className="text-[#F1F5F9]">Traxora</strong> is an AI signal platform built on{" "}
                <strong className="text-[#F1F5F9]">ICT Smart Money methodology</strong> — the framework institutional traders use.
              </p>
              <p>
                Enter any ticker. Claude Opus 4.7 checks 6 Smart Money concepts and returns a clear{" "}
                <span className="text-emerald-400 font-semibold">BUY</span>,{" "}
                <span className="text-amber-400 font-semibold">HOLD</span>, or{" "}
                <span className="text-rose-400 font-semibold">SELL</span>{" "}
                in seconds.
              </p>
            </div>
            <div className="flex items-center gap-4 mt-8">
              <Link href="/dashboard" className="bg-emerald-600 hover:bg-emerald-500 transition-colors px-5 py-2.5 rounded-xl text-sm font-bold">
                Start Free →
              </Link>
              <Link href="/guide" className="text-sm text-[#7B8DB4] hover:text-[#F1F5F9] transition-colors underline underline-offset-4 decoration-[#2D3A50]">
                Read the Guide →
              </Link>
            </div>
          </div>

          <div className="lg:w-[45%] grid grid-cols-2 gap-3">
            {[
              { value:"6",        label:"ICT Smart Money concepts analyzed on every ticker",         color:"text-emerald-400",  glow:"shadow-emerald-500/20" },
              { value:"20+",      label:"Stocks and futures tracked live on your dashboard",         color:"text-cyan-400",    glow:"shadow-cyan-500/20"   },
              { value:"Opus 4.7", label:"Anthropic's most capable AI model powers every signal",     color:"text-violet-400",  glow:"shadow-violet-500/20" },
              { value:"Real-time",label:"Push alerts when signals fire during Kill Zones",           color:"text-emerald-400", glow:"shadow-emerald-500/20"},
              { value:"$10K",     label:"Paper trading simulator — practice risk-free",              color:"text-amber-400",   glow:"shadow-amber-500/20"  },
              { value:"Free",     label:"No subscription, no hidden fees",                          color:"text-rose-400",    glow:"shadow-rose-500/20"   },
            ].map((s) => (
              <div key={s.label} className={`bg-[#0C1017]/80 border border-[#1C2333] rounded-2xl p-4 hover:border-[#2D3A50] transition-all hover:shadow-lg ${s.glow}`}>
                <p className={`text-2xl font-black mb-1 ${s.color}`}>{s.value}</p>
                <p className="text-xs text-[#4B5675] leading-relaxed">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ ROTATING QUOTE ══ */}
      <section className="relative px-6 sm:px-8 py-20 overflow-hidden bg-[#060A14]/40">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/3 via-transparent to-violet-600/3" />
        </div>
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <div className="min-h-[100px] flex flex-col items-center justify-center">
            <p className="text-2xl sm:text-3xl font-black leading-snug text-[#F1F5F9] transition-all duration-700">
              &ldquo;{quote.text}<br />
              <span className="text-emerald-400">{quote.highlight}</span><br />
              <span className="text-[#4B5675]">{quote.end}&rdquo;</span>
            </p>
          </div>
          <div className="flex justify-center gap-2 mt-6">
            {QUOTES.map((_, i) => (
              <button key={i} onClick={() => setQuoteIdx(i)} className={`w-1.5 h-1.5 rounded-full transition-all ${i === quoteIdx ? "bg-emerald-400 w-4" : "bg-[#2D3A50]"}`} />
            ))}
          </div>
        </div>
      </section>

      {/* ══ HOW TO USE IT ══ */}
      <section className="px-6 sm:px-8 py-20 max-w-6xl mx-auto w-full space-y-24">
        <div className="text-center mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400 mb-3">Complete Guide</p>
          <h2 className="text-3xl font-black tracking-tight">How to use Traxora</h2>
        </div>

        {/* Step 1 */}
        <div className="flex flex-col md:flex-row gap-12 items-center">
          <div className="md:w-1/2">
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-3">Step 01 · Pick Your Market</p>
            <h3 className="text-2xl font-black mb-4">Search any stock or futures contract</h3>
            <p className="text-[#7B8DB4] leading-relaxed">
              Type any ticker — <strong className="text-[#F1F5F9]">AAPL, NVDA, TSLA</strong> for stocks, or <strong className="text-[#F1F5F9]">ES, NQ, GC</strong> for futures. Or browse the 20+ symbol watchlist on the Dashboard with live prices and color-coded signals.
            </p>
          </div>
          <div className="md:w-1/2 bg-[#0C1017]/80 border border-[#1C2333] rounded-2xl p-6">
            <p className="text-xs text-[#4B5675] mb-3 uppercase tracking-widest font-semibold">Live Watchlist Preview</p>
            <div className="space-y-2">
              {[
                { sym:"NVDA", name:"NVIDIA Corp.",   price:"$134.50", chg:"+2.4%", sig:"BUY",  sc:"text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                { sym:"AAPL", name:"Apple Inc.",     price:"$189.20", chg:"-0.8%", sig:"HOLD", sc:"text-amber-400 bg-amber-500/10 border-amber-500/20"   },
                { sym:"ES",   name:"E-mini S&P 500", price:"$5,920",  chg:"+0.6%", sig:"BUY",  sc:"text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                { sym:"GC",   name:"Gold Futures",   price:"$2,340",  chg:"+1.1%", sig:"BUY",  sc:"text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                { sym:"TSLA", name:"Tesla Inc.",     price:"$178.40", chg:"-3.2%", sig:"SELL", sc:"text-rose-400 bg-rose-500/10 border-rose-500/20"       },
              ].map((r) => (
                <div key={r.sym} className="flex items-center justify-between border-l-2 border-[#1C2333] pl-3 py-1 hover:border-emerald-500/40 transition-colors">
                  <div>
                    <p className="text-xs font-bold text-[#F1F5F9]">{r.sym}</p>
                    <p className="text-[10px] text-[#4B5675]">{r.name}</p>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <p className="text-xs font-mono text-[#F1F5F9]">{r.price}</p>
                      <p className={`text-[10px] font-mono ${r.chg.startsWith("+") ? "text-emerald-400" : "text-rose-400"}`}>{r.chg}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${r.sc}`}>{r.sig}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex flex-col md:flex-row-reverse gap-12 items-center">
          <div className="md:w-1/2">
            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest mb-3">Step 02 · Read Your Signal</p>
            <h3 className="text-2xl font-black mb-4">AI analyses 6 ICT concepts — one clear answer</h3>
            <p className="text-[#7B8DB4] leading-relaxed">
              Tap <strong className="text-[#F1F5F9]">&ldquo;Analyze&rdquo;</strong>. Claude Opus 4.7 checks Order Blocks, FVGs, Liquidity sweeps, Market Structure, OTE zones, and Kill Zone timing — then returns a BUY / HOLD / SELL with the full reasoning behind it.
            </p>
          </div>
          <div className="md:w-1/2">
            <div className={`bg-[#0C1017]/80 border ${sigBorder} rounded-2xl overflow-hidden transition-all duration-350 shadow-xl`} style={{ opacity: signalFade ? 1 : 0 }}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#1C2333]">
                <div>
                  <p className="font-bold text-[#F1F5F9]">{signal.sym}.US</p>
                  <p className="text-xs text-[#4B5675]">{signal.name}</p>
                </div>
                <span className={`text-sm font-black px-3 py-1.5 rounded-lg border ${sigColor}`}>{signal.sig}</span>
              </div>
              <div className="px-5 py-3 flex flex-wrap gap-2 border-b border-[#1C2333]">
                {[
                  { l:"Price",      v:signal.price,                                                      c:"text-[#F1F5F9] bg-[#111827] border-[#1C2333]"              },
                  { l:"Confidence", v:signal.conf,                                                       c:signal.conf === "High" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-amber-400 bg-amber-500/10 border-amber-500/20" },
                  { l:"Kill Zone",  v:signal.kz.includes("NY") ? "Active" : "Moderate",                  c:"text-emerald-400 bg-emerald-500/10 border-emerald-500/20"      },
                ].map((b) => (
                  <div key={b.l} className={`border rounded-lg px-2 py-1 ${b.c}`}>
                    <p className="text-[9px] text-[#4B5675]">{b.l}</p>
                    <p className="text-[11px] font-bold">{b.v}</p>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 space-y-2">
                {[
                  { icon:"🟣", l:"Order Block", v:signal.ob  },
                  { icon:"🔵", l:"Fair Value Gap", v:signal.fvg },
                  { icon:"🟡", l:"Liquidity",   v:signal.liq },
                  { icon:"🕐", l:"Kill Zone",   v:signal.kz  },
                ].map((r) => (
                  <div key={r.l} className="flex gap-2 text-xs">
                    <span className="w-4 text-center shrink-0">{r.icon}</span>
                    <span className="text-[#4B5675] w-[90px] shrink-0">{r.l}</span>
                    <span className="text-[#7B8DB4]">{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="flex flex-col md:flex-row gap-12 items-center">
          <div className="md:w-1/2">
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-3">Step 03 · Act on It</p>
            <h3 className="text-2xl font-black mb-4">Paper trade first, then go live</h3>
            <p className="text-[#7B8DB4] leading-relaxed mb-4">
              Start with the built-in <strong className="text-[#F1F5F9]">$10K paper simulator</strong>. Execute risk-free, track your equity curve, and journal every trade before going live.
            </p>
            <p className="text-[#7B8DB4] leading-relaxed">
              The Signals page gives step-by-step instructions — order type, stop-loss, and timing — for any broker.
            </p>
          </div>
          <div className="md:w-1/2 space-y-3">
            <div className="bg-[#0C1017]/80 border border-emerald-500/20 rounded-2xl p-5 hover:border-emerald-500/40 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">📊</span>
                <p className="text-sm font-bold text-[#F1F5F9]">Paper Simulator</p>
                <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-lg">$10K</span>
              </div>
              <p className="text-xs text-[#4B5675] leading-relaxed">Virtual portfolio with live-priced equity curve, full trade journal, and P&amp;L tracking. No risk.</p>
            </div>
            <div className="bg-[#0C1017]/80 border border-[#1C2333] rounded-2xl p-5 hover:border-[#2D3A50] transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">📱</span>
                <p className="text-sm font-bold text-[#F1F5F9]">Manual execution — any broker</p>
              </div>
              <p className="text-xs text-[#4B5675] leading-relaxed">The Signals page gives step-by-step execution instructions. Works with Robinhood, Webull, or any platform you prefer.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══ DAILY ROUTINE ══ */}
      <section className="px-6 sm:px-8 py-20 max-w-6xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row-reverse gap-16 items-start">
          <div className="lg:w-[55%]">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-400 mb-5">Daily Trading Routine</p>
            <h2 className="text-3xl font-black tracking-tight mb-8">What to do every single trading day</h2>
            <div className="space-y-6">
              {[
                { time:"Before 9:30 AM ET", icon:"🌅", title:"Check overnight futures", desc:"Look at ES, NQ, GC on the Dashboard. Up or down from yesterday's close tells you institutional bias for the day." },
                { time:"9:30 – 10:30 AM ET", icon:"🎯", title:"NY Kill Zone — your prime window", desc:"The majority of institutional moves happen here. High confidence BUY + active Kill Zone = best setup." },
                { time:"During the day", icon:"📡", title:"Let push alerts do the work", desc:"Enable notifications. When Traxora fires a signal during a Kill Zone, your phone buzzes. You decide." },
                { time:"After market close", icon:"📊", title:"Review your paper portfolio", desc:"Which signals worked? Study the ICT concept behind each trade. This builds intuition before real money." },
              ].map((r) => (
                <div key={r.title} className="flex gap-4">
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <span className="text-xl">{r.icon}</span>
                    <div className="w-px flex-1 bg-[#1C2333] min-h-[24px]" />
                  </div>
                  <div className="pb-2">
                    <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider mb-1">{r.time}</p>
                    <p className="font-bold text-[#F1F5F9] text-sm mb-1">{r.title}</p>
                    <p className="text-xs text-[#7B8DB4] leading-relaxed">{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:w-[45%] lg:sticky lg:top-24">
            <div className="bg-[#0C1017]/80 border border-[#1C2333] rounded-2xl p-6">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5675] mb-5">6 Risk Rules to Live By</p>
              <div className="space-y-4">
                {[
                  { n:"01", rule:"Never risk more than 1–2% of your account on one trade." },
                  { n:"02", rule:"Always set a stop-loss the moment your order fills." },
                  { n:"03", rule:"Only trade BUY signals during NY or London Kill Zones." },
                  { n:"04", rule:"If confidence is Low — skip the trade. Wait for High." },
                  { n:"05", rule:"Paper trade every strategy for 2 weeks before going live." },
                  { n:"06", rule:"This tool is for research only — not financial advice." },
                ].map((r) => (
                  <div key={r.n} className="flex gap-3">
                    <span className="text-[10px] font-black text-emerald-400/40 shrink-0 w-6 pt-0.5">{r.n}</span>
                    <p className="text-sm text-[#7B8DB4] leading-relaxed">{r.rule}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ ICT CONCEPTS — animated carousel ══ */}
      <section className="relative px-6 sm:px-8 py-24 overflow-hidden bg-[#060A14]/40">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-600/3 to-transparent pointer-events-none" />
        <div className="relative z-10 max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400 mb-3">Smart Money Concepts</p>
            <h2 className="text-3xl font-black tracking-tight mb-3">The 6 concepts powering every signal</h2>
            <p className="text-sm text-[#7B8DB4] max-w-md mx-auto">
              Click any card to watch a free tutorial. The spotlight rotates automatically.
            </p>
          </div>

          {/* Concept dot nav */}
          <div className="flex justify-center gap-2 mb-8">
            {CONCEPTS.map((c, i) => (
              <button key={c.tag} onClick={() => setConceptIdx(i)}
                className={`transition-all text-[9px] font-bold px-2.5 py-1 rounded-full border ${i === conceptIdx ? `${c.tagBg} ${c.accent} scale-110` : "border-[#1C2333] text-[#4B5675] bg-transparent"}`}>
                {c.tag}
              </button>
            ))}
          </div>

          {/* Featured concept (large) */}
          <div className="mb-6">
            {CONCEPTS.map((c, i) => (
              <div key={c.tag} className={`transition-all duration-500 ${i === conceptIdx ? "opacity-100 scale-100" : "opacity-0 scale-98 absolute pointer-events-none"}`}
                style={{ display: i === conceptIdx ? "block" : "none" }}>
                <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(c.search)}`} target="_blank" rel="noopener noreferrer"
                  className={`block bg-[#0C1017] border ${c.border} rounded-2xl overflow-hidden hover:border-opacity-60 transition-all max-w-2xl mx-auto`}>
                  <div className={`bg-gradient-to-br ${c.gradient} px-6 pt-6 pb-4 h-56 flex items-center`}>
                    {c.diagram}
                  </div>
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${c.tagBg} ${c.accent}`}>{c.tag}</span>
                      <p className="font-bold text-base text-[#F1F5F9]">{c.title}</p>
                    </div>
                    <p className="text-sm text-[#7B8DB4] leading-relaxed">{c.desc}</p>
                    <p className={`mt-4 text-xs font-semibold ${c.accent}`}>Watch tutorial on YouTube →</p>
                  </div>
                </a>
              </div>
            ))}
          </div>

          {/* All 6 in small grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {CONCEPTS.map((c, i) => (
              <button key={c.tag} onClick={() => setConceptIdx(i)}
                className={`bg-[#0C1017] border rounded-xl p-3 text-left transition-all hover:scale-105 ${i === conceptIdx ? `${c.border} ring-1 ring-inset` : "border-[#1C2333]"}`}
>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${c.tagBg} ${c.accent}`}>{c.tag}</span>
                <p className="text-[10px] text-[#7B8DB4] mt-1.5 leading-snug">{c.title}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ══ COMPETITOR COMPARISON ══ */}
      <section className="px-6 sm:px-8 py-24 max-w-5xl mx-auto w-full">
        <div className="text-center mb-12">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-rose-400 mb-3">Why Traxora?</p>
          <h2 className="text-3xl font-black tracking-tight">Other tools charge $29–$118/month.<br />Traxora is free.</h2>
          <p className="text-[#7B8DB4] text-sm mt-3 max-w-md mx-auto">And none of them use ICT Smart Money methodology or Claude Opus 4.7.</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-[#1C2333]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1C2333]">
                <th className="text-left py-4 pl-5 pr-6 text-[#4B5675] text-xs uppercase tracking-widest font-semibold">Feature</th>
                {[
                  { name:"Traxora",     price:"Free",    highlight:true  },
                  { name:"Trade Ideas", price:"$118/mo", highlight:false },
                  { name:"Signal Stack",price:"$49/mo",  highlight:false },
                  { name:"TrendSpider",price:"$33/mo",  highlight:false },
                ].map((col) => (
                  <th key={col.name} className={`py-4 px-4 text-center text-xs font-bold ${col.highlight ? "bg-emerald-600/10 border-x border-t border-emerald-500/20 text-emerald-300" : "text-[#4B5675]"}`}>
                    <p>{col.name}</p>
                    <p className={`text-base font-black mt-1 ${col.highlight ? "text-emerald-400" : "text-[#F1F5F9]"}`}>{col.price}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { feature:"ICT Smart Money signals", traxora:true,  ti:false, ss:false, ts:false },
                { feature:"Claude Opus 4.7 AI",      traxora:true,  ti:false, ss:false, ts:false },
                { feature:"Live BUY/SELL signals",   traxora:true,  ti:true,  ss:true,  ts:true  },
                { feature:"Paper trading simulator", traxora:true,  ti:false, ss:false, ts:true  },
                { feature:"Push notifications",      traxora:true,  ti:false, ss:true,  ts:false },
                { feature:"Morning briefing AI",     traxora:true,  ti:false, ss:false, ts:false },
                { feature:"Free to use",             traxora:true,  ti:false, ss:false, ts:false },
              ].map((row, i) => (
                <tr key={row.feature} className={`border-b border-[#1C2333] last:border-0 ${i % 2 === 0 ? "" : "bg-[#0C1017]/40"}`}>
                  <td className="py-3.5 pl-5 pr-6 text-[#CBD5E1] text-xs">{row.feature}</td>
                  {[
                    { val:row.traxora, highlight:true  },
                    { val:row.ti,      highlight:false },
                    { val:row.ss,      highlight:false },
                    { val:row.ts,      highlight:false },
                  ].map((cell, ci) => (
                    <td key={ci} className={`py-3.5 px-4 text-center text-base ${cell.highlight ? "bg-emerald-600/10 border-x border-emerald-500/20" : ""}`}>
                      {cell.val ? <span className="text-emerald-400 font-bold">✓</span> : <span className="text-[#2D3A50]">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-center mt-10">
          <Link href="/dashboard" className="bg-emerald-600 hover:bg-emerald-500 transition-all px-10 py-4 rounded-xl font-bold text-sm shadow-xl shadow-emerald-500/20 hover:scale-105 active:scale-95 inline-block">
            Start Free — No Credit Card →
          </Link>
        </div>
      </section>

      {/* ══ BUILT DIFFERENT ══ */}
      <section className="relative px-6 sm:px-8 py-20 overflow-hidden bg-[#060A14]/40">
        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400 mb-3">Built different</p>
            <h2 className="text-3xl font-black tracking-tight">The only free ICT signal platform powered by Claude Opus 4.7</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { icon:"🧠", title:"Institutional-grade analysis", desc:"Order Blocks, FVGs, Liquidity sweeps — what hedge funds use. Now free.", color:"border-emerald-500/20" },
              { icon:"⚡", title:"AI that explains itself", desc:"Every signal shows which Order Block was tapped, which FVG is in play, and whether you're in a Kill Zone.", color:"border-violet-500/20" },
              { icon:"🔒", title:"Practice before you risk money", desc:"$10K paper simulator — test every strategy risk-free before putting real money on the line.", color:"border-emerald-500/20" },
            ].map((c) => (
              <div key={c.title} className={`bg-[#0C1017]/80 border ${c.color} rounded-2xl p-6 hover:scale-[1.02] transition-transform`}>
                <span className="text-3xl block mb-4">{c.icon}</span>
                <h3 className="font-bold text-[#F1F5F9] mb-2">{c.title}</h3>
                <p className="text-xs text-[#7B8DB4] leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ══ */}
      <section className="relative px-6 sm:px-8 py-28 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[300px] bg-emerald-600/8 rounded-full blur-3xl animate-pulse" />
        </div>
        <div className="relative z-10 max-w-xl mx-auto text-center">
          <h2 className="text-4xl font-black tracking-tight mb-4">
            Ready to read the market<br />like smart money?
          </h2>
          <p className="text-[#7B8DB4] text-base leading-relaxed mb-10">
            Free forever. ICT signals, push alerts, morning briefing, $10K simulator.
          </p>
          <div className="flex items-center justify-center">
            <Link href="/dashboard" className="bg-emerald-600 hover:bg-emerald-500 transition-all px-10 py-4 rounded-xl font-bold text-sm shadow-2xl shadow-emerald-500/25 hover:scale-105 active:scale-95">
              Start Trading Free →
            </Link>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer className="border-t border-[#1C2333] px-6 sm:px-8 py-6 flex items-center justify-between gap-4 flex-wrap bg-[#060A14]/60">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
              </svg>
            </div>
            <span className="text-xs font-bold text-[#F1F5F9]">Traxora AI</span>
          </div>
          <p className="text-[11px] text-[#4B5675]">© 2026 · Not financial advice · For educational use only</p>
        </div>
        <div className="flex gap-6">
          <Link href="/dashboard"     className="text-xs text-[#4B5675] hover:text-[#7B8DB4] transition-colors">Dashboard</Link>
          <Link href="/explore"       className="text-xs text-[#4B5675] hover:text-[#7B8DB4] transition-colors">Markets</Link>
          <Link href="/analysis"      className="text-xs text-[#4B5675] hover:text-[#7B8DB4] transition-colors">Signals</Link>
          <Link href="/notifications" className="text-xs text-[#4B5675] hover:text-[#7B8DB4] transition-colors">Alerts</Link>
          <Link href="/settings"      className="text-xs text-[#4B5675] hover:text-[#7B8DB4] transition-colors">Settings</Link>
        </div>
      </footer>
    </div>
  );
}
