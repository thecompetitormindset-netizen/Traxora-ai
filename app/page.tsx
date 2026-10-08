"use client";

import { useEffect, useRef, useState } from "react";
import { useAppSession } from "@/app/lib/useAppSession";
import { useRouter } from "next/navigation";
import Link from "next/link";

const LIVE_SIGNALS = [
  { sym:"NVDA", name:"NVIDIA Corp.",    price:"$134.50", chg:"+2.4%", sig:"BUY",  conf:"High",   ob:"Bullish OB at $131.20", fvg:"FVG $132–134",   liq:"BSL at $135.80", kz:"NY session",    spark:[ 8,14,12,18,16,22,20,28,26,34] },
  { sym:"AAPL", name:"Apple Inc.",      price:"$189.20", chg:"+0.3%", sig:"HOLD", conf:"Medium", ob:"Premium zone, no OB",   fvg:"FVG filled $188", liq:"SSL at $186",    kz:"Pre-London",    spark:[20,22,19,21,20,23,21,20,22,21] },
  { sym:"TSLA", name:"Tesla Inc.",      price:"$178.40", chg:"-1.8%", sig:"SELL", conf:"High",   ob:"Bearish OB at $182",    fvg:"FVG $179–181",   liq:"BSL swept $183", kz:"NY AM session", spark:[32,28,30,24,26,20,22,16,18,12] },
  { sym:"GC",   name:"Gold Futures",   price:"$2,340",  chg:"+1.1%", sig:"BUY",  conf:"High",   ob:"Bullish OB $2,325",     fvg:"FVG $2,328–332", liq:"SSL at $2,318",  kz:"London open",   spark:[10,14,13,18,17,21,24,22,27,30] },
  { sym:"MSFT", name:"Microsoft Corp.", price:"$415.80", chg:"+0.9%", sig:"BUY",  conf:"Medium", ob:"Bullish OB at $411",    fvg:"FVG $412–415",   liq:"BSL at $420",    kz:"NY session",    spark:[12,16,14,19,18,17,21,24,23,27] },
];

// Demo ticker tape — stocks, futures, crypto, plus the non-stock feeds
const TICKER = [
  { sym:"NVDA",  chg:"+2.4%", sig:"BUY"  },
  { sym:"ES",    chg:"+0.6%", sig:"BUY"  },
  { sym:"BTC",   chg:"+3.1%", sig:"BUY"  },
  { sym:"TSLA",  chg:"-1.8%", sig:"SELL" },
  { sym:"GC",    chg:"+1.1%", sig:"BUY"  },
  { sym:"AAPL",  chg:"+0.3%", sig:"HOLD" },
  { sym:"ETH",   chg:"+2.2%", sig:"BUY"  },
  { sym:"MSFT",  chg:"+0.9%", sig:"BUY"  },
  { sym:"NQ",    chg:"-0.4%", sig:"HOLD" },
  { sym:"SOL",   chg:"+5.7%", sig:"BUY"  },
  { sym:"CL",    chg:"-0.9%", sig:"SELL" },
  { sym:"SPY",   chg:"+0.5%", sig:"BUY"  },
];

export default function HomePage() {
  const { data: session } = useAppSession();
  const router = useRouter();

  function handleLaunch() {
    router.push("/dashboard");
  }

  const [signalIdx, setSignalIdx] = useState(0);
  const [signalFade, setSignalFade] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const [showSticky, setShowSticky] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setSignalFade(false);
      setTimeout(() => { setSignalIdx(i => (i + 1) % LIVE_SIGNALS.length); setSignalFade(true); }, 350);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = () => {
      setNavScrolled(window.scrollY > 20);
      setShowSticky(window.scrollY > 600);
      if (progressRef.current) {
        const doc = document.documentElement;
        const max = doc.scrollHeight - doc.clientHeight;
        progressRef.current.style.width = max > 0 ? `${(window.scrollY / max) * 100}%` : "0%";
      }
    };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Mouse-follow 3D tilt for the hero signal card stack
  function tiltMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const r  = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width  - 0.5;
    const py = (e.clientY - r.top)  / r.height - 0.5;
    el.style.setProperty("--tilt-y", `${(px * 8).toFixed(2)}deg`);
    el.style.setProperty("--tilt-x", `${(-py * 6).toFixed(2)}deg`);
  }
  function tiltReset(e: React.MouseEvent<HTMLDivElement>) {
    e.currentTarget.style.setProperty("--tilt-x", "0deg");
    e.currentTarget.style.setProperty("--tilt-y", "0deg");
  }

  function ripple(e: React.MouseEvent) {
    const btn = e.currentTarget as HTMLElement;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const el = document.createElement("span");
    el.className = "ripple-wave";
    el.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    btn.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }

  const signal = LIVE_SIGNALS[signalIdx];
  const sigColor  = signal.sig === "BUY"  ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                  : signal.sig === "SELL" ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
                  :                         "text-amber-400 bg-amber-500/10 border-amber-500/30";
  const sigBorder = signal.sig === "BUY"  ? "border-emerald-500/20"
                  : signal.sig === "SELL" ? "border-rose-500/20"
                  :                         "border-amber-500/20";
  const sparkStroke = signal.sig === "BUY" ? "var(--buy)" : signal.sig === "SELL" ? "var(--sell)" : "var(--hold)";
  const sparkPoints = signal.spark.map((v, i) => `${(i * (112 / (signal.spark.length - 1))).toFixed(1)},${40 - v}`).join(" ");
  const sparkLast   = { x: 112, y: 40 - signal.spark[signal.spark.length - 1] };
  const confBar     = signal.conf === "High" ? "w-pct-85 bg-emerald-400" : "w-pct-55 bg-amber-400";
  const confText    = signal.conf === "High" ? "text-emerald-400" : "text-amber-400";
  const chgColor    = signal.chg.startsWith("-") ? "text-rose-400" : "text-emerald-400";

  const NAV_LINKS = [
    { href:"/intelligence", label:"Scanner" },
    { href:"/analysis",     label:"Signals" },
    { href:"/guide",        label:"Guide"   },
  ];

  return (
    <div className="min-h-screen text-[#F1F5F9] flex flex-col">

      {/* ══ SCROLL PROGRESS ══ */}
      <div ref={progressRef} className="scroll-progress" aria-hidden />

      {/* ══ NAV ══ */}
      <nav className={`relative z-20 border-b border-[#252345]/60 px-6 sm:px-10 h-16 flex items-center justify-between backdrop-blur-sm bg-[#0D0B1A]/90 sticky top-0 transition-all duration-300 ${navScrolled ? "shadow-lg shadow-black/20" : ""}`}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 logo-icon-bg flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight">Traxora AI</span>
        </div>
        <div className="flex items-center gap-6">
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} className="text-sm text-[#4B5675] hover:text-[#F1F5F9] transition-colors hidden md:block">{l.label}</Link>
          ))}
          <button type="button" onClick={handleLaunch} className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors px-4 py-2 rounded-lg text-sm font-semibold">
            {session ? "Dashboard →" : "Get started →"}
          </button>
          <button type="button" aria-label="Menu" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(o => !o)} className="md:hidden w-8 h-8 flex flex-col items-center justify-center gap-1.5 rounded-lg hover:bg-[#1A1838] transition-colors">
            <span className={`block w-5 h-0.5 bg-[#7B8DB4] transition-all ${mobileMenuOpen ? "rotate-45 translate-y-2" : ""}`} />
            <span className={`block w-5 h-0.5 bg-[#7B8DB4] transition-all ${mobileMenuOpen ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-0.5 bg-[#7B8DB4] transition-all ${mobileMenuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
          </button>
        </div>
      </nav>

      {/* ══ MOBILE MENU ══ */}
      <div className={`md:hidden overflow-hidden transition-all duration-300 bg-[#0D0B1A]/98 backdrop-blur-xl border-b border-[#252345]/60 ${mobileMenuOpen ? "max-h-64" : "max-h-0"}`} aria-hidden={!mobileMenuOpen}>
        <div className="px-6 py-4 flex flex-col gap-1">
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setMobileMenuOpen(false)} className="text-sm text-[#CBD5E1] hover:text-[#F1F5F9] py-3 border-b border-[#252345]/40 last:border-0 transition-colors">{l.label}</Link>
          ))}
          <button type="button" onClick={() => { setMobileMenuOpen(false); handleLaunch(); }} className="mt-3 w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors py-3 rounded-xl text-sm font-bold">
            {session ? "Open Dashboard →" : "Get started →"}
          </button>
        </div>
      </div>

      {/* ══ HERO — split layout: text left, signal cards right ══ */}
      <section data-hero className="relative px-6 sm:px-10 pt-20 pb-20 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[700px] h-[600px] bg-emerald-600/8 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-600/5 rounded-full blur-3xl" />
          <div className="absolute inset-0 bg-dot-grid opacity-[0.10]" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          {/* Left: Text & CTAs — left aligned */}
          <div>
            <div className="hero-enter hero-enter-1 inline-flex items-center gap-2 bg-[#13112A] border border-[#252345] rounded-full px-4 py-1.5 text-xs text-[#7B8DB4] font-medium mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Powered by Claude Sonnet 4.6 · Live market data
            </div>

            <h1 className="hero-enter hero-enter-2 text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.04] mb-6">
              <span className="block text-[#F1F5F9]">Know exactly</span>
              <span className="block text-gradient-animate">when to trade.</span>
            </h1>

            <p className="hero-enter hero-enter-3 text-lg text-[#7B8DB4] leading-relaxed mb-8 max-w-lg">
              AI-powered signals built on Smart Money methodology. Enter any ticker — get a clear BUY, HOLD, or SELL with a full trade plan in seconds. No trading experience required.
            </p>

            <div className="hero-enter hero-enter-4 flex items-center gap-4 flex-wrap mb-4">
              <button type="button" onMouseDown={ripple} onClick={handleLaunch} className="btn-shimmer ripple-container bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-all px-7 py-3.5 rounded-xl text-base font-bold shadow-lg shadow-[var(--glow-accent)] hover:scale-[1.02] active:scale-95">
                {session ? "Open Dashboard →" : "Get started →"}
              </button>
              <Link href="/guide" className="border border-[#252345] hover:border-[#333368] transition-colors px-7 py-3.5 rounded-xl text-base font-medium text-[#7B8DB4] hover:text-[#F1F5F9]">
                See how it works →
              </Link>
            </div>

            {!session && <p className="text-sm text-[#4B5675] mb-8">100% free · No sign-up · No credit card</p>}

            <div className="hero-enter hero-enter-4 flex items-center gap-6 flex-wrap mt-2">
              {[
                { label:"Under 5 seconds per analysis" },
                { label:"6 Smart Money concepts" },
                { label:"Kill Zone timing included" },
              ].map(t => (
                <div key={t.label} className="flex items-center gap-1.5 text-xs text-[#4B5675]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {t.label}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Signal card stack */}
          <div className="relative flex items-center justify-center lg:justify-end pt-10 lg:pt-0">
            <div className="tilt-card relative w-full max-w-[400px]" onMouseMove={tiltMove} onMouseLeave={tiltReset}>
              {/* Ghost card 2 */}
              <div className="absolute inset-x-6 top-8 rotate-3 opacity-20 pointer-events-none">
                <div className="bg-[#13112A] border border-rose-500/20 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#252345]">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                      <span className="font-bold text-sm">TSLA</span>
                      <span className="text-[11px] text-[#4B5675]">Tesla Inc.</span>
                    </div>
                    <span className="text-xs font-black px-2.5 py-1 rounded-md border text-rose-400 bg-rose-500/10 border-rose-500/30">SELL</span>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2">
                    {[{l:"Order Block",v:"Bearish OB $182"},{l:"Fair Value Gap",v:"FVG $179–181"},{l:"Liquidity",v:"BSL swept $183"},{l:"Kill Zone",v:"NY AM session"}].map(r=>(
                      <div key={r.l}><p className="text-[9px] text-[#4B5675] uppercase tracking-wider">{r.l}</p><p className="text-[11px] text-[#CBD5E1] mt-0.5">{r.v}</p></div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Ghost card 1 */}
              <div className="absolute inset-x-3 top-4 -rotate-1 opacity-45 pointer-events-none">
                <div className="bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#252345]">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <span className="font-bold text-sm">NVDA</span>
                      <span className="text-[11px] text-[#4B5675]">NVIDIA Corp.</span>
                    </div>
                    <span className="text-xs font-black px-2.5 py-1 rounded-md border text-emerald-400 bg-emerald-500/10 border-emerald-500/30">BUY</span>
                  </div>
                  <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2">
                    {[{l:"Order Block",v:"Bullish OB $131.20"},{l:"Fair Value Gap",v:"FVG $132–134"},{l:"Liquidity",v:"BSL at $135.80"},{l:"Kill Zone",v:"NY session"}].map(r=>(
                      <div key={r.l}><p className="text-[9px] text-[#4B5675] uppercase tracking-wider">{r.l}</p><p className="text-[11px] text-[#CBD5E1] mt-0.5">{r.v}</p></div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Main live card */}
              <div className={`animate-signal-float scanline relative z-10 bg-[#13112A] border ${sigBorder} rounded-2xl overflow-hidden shadow-2xl shadow-black/40 ${signalFade ? "signal-fade-in" : "signal-fade-out"}`}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#252345]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="font-bold">{signal.sym}</span>
                    <span className="text-[11px] text-[#4B5675]">{signal.name}</span>
                  </div>
                  <span className={`text-xs font-black px-2.5 py-1 rounded-md border ${sigColor}`}>{signal.sig}</span>
                </div>
                <div className="px-5 pt-4 flex items-end justify-between gap-4">
                  <div className="text-left">
                    <p className="text-2xl font-mono font-black text-[#F1F5F9] leading-none">{signal.price}</p>
                    <p className={`text-[11px] font-bold mt-1 ${chgColor}`}>{signal.chg} today</p>
                  </div>
                  <svg className="w-28 h-10 shrink-0" viewBox="0 0 116 40" fill="none" aria-hidden="true">
                    <polyline points={sparkPoints} stroke={sparkStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx={sparkLast.x} cy={sparkLast.y} r="2.5" fill={sparkStroke} className="animate-pulse" />
                  </svg>
                </div>
                <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-3 text-left">
                  {[
                    { label:"Order Block",    value:signal.ob  },
                    { label:"Fair Value Gap", value:signal.fvg },
                    { label:"Liquidity",      value:signal.liq },
                    { label:"Kill Zone",      value:signal.kz  },
                  ].map(r => (
                    <div key={r.label}>
                      <p className="text-[9px] text-[#4B5675] uppercase tracking-wider font-semibold mb-0.5">{r.label}</p>
                      <p className="text-sm text-[#CBD5E1] font-medium">{r.value}</p>
                    </div>
                  ))}
                </div>
                <div className="px-5 pb-4 flex items-center gap-3 border-t border-[#252345] pt-3">
                  <span className="text-[9px] text-[#4B5675] uppercase tracking-wider font-semibold">Confidence</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#252345] overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${confBar}`} />
                  </div>
                  <span className={`text-xs font-bold ${confText}`}>{signal.conf}</span>
                </div>
              </div>
              <p className="text-[10px] text-[#333368] mt-3 text-center">Demo signal · Not financial advice</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══ TICKER TAPE — scrolling demo signals across markets ══ */}
      <div className="border-y border-[#252345]/60 bg-[#0D0B1A]/60 py-4">
        <div className="ticker-mask">
          <div className="ticker-track">
            {[0, 1].map(copy => (
              <div key={copy} className="flex items-center gap-3" aria-hidden={copy === 1}>
                {TICKER.map(t => {
                  const up = !t.chg.startsWith("-");
                  const sigCls = t.sig === "BUY"  ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
                               : t.sig === "SELL" ? "text-rose-400 bg-rose-500/10 border-rose-500/25"
                               :                    "text-amber-400 bg-amber-500/10 border-amber-500/25";
                  return (
                    <div key={`${copy}-${t.sym}`} className="flex items-center gap-2 bg-[#13112A] border border-[#252345] rounded-xl px-3.5 py-2 shrink-0">
                      <span className="text-xs font-black font-mono text-[#F1F5F9]">{t.sym}</span>
                      <span className={`text-[11px] font-mono font-bold ${up ? "text-emerald-400" : "text-rose-400"}`}>{t.chg}</span>
                      <span className={`text-[9px] font-black px-1.5 py-px rounded-md border ${sigCls}`}>{t.sig}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="text-center text-[9px] text-[#333368] mt-2.5">Demo signals · stocks, futures &amp; crypto in one scanner · not financial advice</p>
      </div>

      {/* ══ FEATURES — left-aligned header, colored icon cards ══ */}
      <section className="px-6 sm:px-10 pt-24 pb-24 max-w-5xl mx-auto w-full">
        <div className="mb-12">
          <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400 mb-3 reveal">Platform</p>
          <h2 className="reveal heading-underline text-4xl sm:text-5xl font-black tracking-tight mb-4">Everything you need<br className="hidden sm:block" /> to trade smarter.</h2>
          <p className="text-lg text-[#7B8DB4] max-w-xl leading-relaxed reveal">Signals, briefings, a scanner, options analysis, journaling, and a practice account — all in one place, built on institutional methodology.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              title:"AI Signal Analysis",
              desc:"Enter any ticker. Claude Sonnet 4.6 checks Order Blocks, FVGs, liquidity, and Kill Zone timing — returns BUY, HOLD, or SELL with entry zone, stop, and target.",
              topColor:"border-t-emerald-500", iconColor:"text-emerald-400",
              icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
            },
            {
              title:"Morning Briefing",
              desc:"Full AI market brief at 8:30am ET. Macro regime, top options plays, futures setups, VIX context, and the day's key levels — before the open.",
              topColor:"border-t-amber-500", iconColor:"text-amber-400",
              icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>,
            },
            {
              title:"Deep Market Scanner",
              desc:"Scan 50+ tickers at once. Ranked by smart money conviction score. The highest-probability setups surface automatically — no manual searching.",
              topColor:"border-t-cyan-500", iconColor:"text-cyan-400",
              icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
            },
            {
              title:"Options Analysis",
              desc:"Implied volatility, expected move, Greeks, and strike selection in one report. Know whether IV is cheap or rich before committing premium.",
              topColor:"border-t-violet-500", iconColor:"text-violet-400",
              icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
            },
            {
              title:"AI Trade Journal",
              desc:"Every closed trade is auto-reviewed — market structure, risk management, psychology, and a lesson written by AI. No manual logging required.",
              topColor:"border-t-indigo-500", iconColor:"text-indigo-400",
              icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
            },
            {
              title:"Paper Trading Sim",
              desc:"Practice with a $100,000 simulated account. Test every strategy risk-free before real capital. Track win rate, R-multiple, and expectancy.",
              topColor:"border-t-rose-500", iconColor:"text-rose-400",
              icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
            },
          ].map((f, i) => (
            <div key={f.title} className={`reveal reveal-d${(i % 3) + 1} bg-[#13112A] border border-[#252345] border-t-2 ${f.topColor} rounded-2xl p-7 hover:border-[#333368] hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/30 transition-all duration-300 group`}>
              <div className={`${f.iconColor} mb-4 opacity-70 group-hover:opacity-100 group-hover:scale-125 group-hover:-rotate-6 origin-bottom-left transition-all duration-300 w-fit`}>{f.icon}</div>
              <h3 className="text-base font-bold text-[#F1F5F9] mb-2">{f.title}</h3>
              <p className="text-sm text-[#7B8DB4] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══ BEYOND STOCKS — sports, crypto & IPOs ══ */}
      <section className="px-6 sm:px-10 pb-24 max-w-5xl mx-auto w-full">
        <div className="mb-12">
          <p className="text-[11px] font-bold uppercase tracking-widest text-violet-400 mb-3 reveal">More markets</p>
          <h2 className="reveal heading-underline text-4xl sm:text-5xl font-black tracking-tight mb-4">Not just stocks.</h2>
          <p className="text-lg text-[#7B8DB4] max-w-xl leading-relaxed reveal">Sports predictions, a 24/7 crypto radar, and an AI-rated IPO calendar — included in the same flat price. No other tool bundles all four.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Sports */}
          <div className="reveal reveal-d1 group bg-[#13112A] border border-[#252345] rounded-2xl p-7 hover:border-[#333368] hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/30 transition-all duration-300">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl mb-4 group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-300">🏆</div>
            <h3 className="text-base font-bold text-[#F1F5F9] mb-2">Sports Predictions</h3>
            <p className="text-sm text-[#7B8DB4] leading-relaxed mb-4">NFL, NBA, MLB, NHL, college football &amp; basketball, WNBA and top-flight soccer — free win probability from real season records, ranked by confidence.</p>
            <div className="rounded-xl bg-[#0D0B1A] border border-[#252345] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[10px] font-semibold text-[#CBD5E1]">Eagles @ Cowboys</span>
                <span className="text-[8px] font-bold px-1.5 py-px rounded-md bg-[#1A1838] text-[#7B8DB4] border border-[#252345]">NFL</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-amber-300">Eagles</span>
                <div className="flex-1 h-1 rounded-full bg-[#252345] overflow-hidden">
                  <div className="h-full w-[68%] rounded-full bg-emerald-400 group-hover:w-[72%] transition-all duration-700" />
                </div>
                <span className="text-[10px] font-mono font-bold text-[#F1F5F9]">68%</span>
              </div>
            </div>
          </div>
          {/* Crypto */}
          <div className="reveal reveal-d2 group bg-[#13112A] border border-[#252345] rounded-2xl p-7 hover:border-[#333368] hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/30 transition-all duration-300">
            <div className="w-11 h-11 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-xl mb-4 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-300">₿</div>
            <h3 className="text-base font-bold text-[#F1F5F9] mb-2">Crypto Radar</h3>
            <p className="text-sm text-[#7B8DB4] leading-relaxed mb-4">Twelve major coins scanned around the clock. &ldquo;Moving Now&rdquo; flags 5%+ breakouts; &ldquo;Coiled&rdquo; spots Bollinger squeezes before they pop.</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { sym:"SOL", tag:"+5.7% · MOVING", cls:"text-emerald-400 bg-emerald-500/10 border-emerald-500/25" },
                { sym:"BTC", tag:"+3.1%",          cls:"text-emerald-400 bg-emerald-500/10 border-emerald-500/25" },
                { sym:"DOT", tag:"COILED",         cls:"text-sky-400 bg-sky-500/10 border-sky-500/25" },
              ].map(c => (
                <span key={c.sym} className={`text-[9px] font-bold font-mono px-2 py-1 rounded-lg border ${c.cls}`}>{c.sym} {c.tag}</span>
              ))}
            </div>
          </div>
          {/* IPO */}
          <div className="reveal reveal-d3 group bg-[#13112A] border border-[#252345] rounded-2xl p-7 hover:border-[#333368] hover:-translate-y-1.5 hover:shadow-xl hover:shadow-black/30 transition-all duration-300">
            <div className="w-11 h-11 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-xl mb-4 group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-300">🚀</div>
            <h3 className="text-base font-bold text-[#F1F5F9] mb-2">IPO Calendar</h3>
            <p className="text-sm text-[#7B8DB4] leading-relaxed mb-4">Every upcoming listing rated before it prices — exchange, raise size and SPAC risk baked into a simple verdict you can act on.</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { tag:"STRONG",      cls:"text-emerald-400 bg-emerald-500/10 border-emerald-500/25" },
                { tag:"WATCH",       cls:"text-amber-400 bg-amber-500/10 border-amber-500/25" },
                { tag:"SPECULATIVE", cls:"text-rose-400 bg-rose-500/10 border-rose-500/25" },
              ].map(r => (
                <span key={r.tag} className={`text-[9px] font-black px-2 py-1 rounded-lg border ${r.cls}`}>{r.tag}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ KILL ZONE TIMING — split: left text, right timeline cards ══ */}
      <section className="px-6 sm:px-10 py-24 landing-stripe">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            {/* Left: explanation */}
            <div className="lg:pt-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400 mb-4 reveal-left">When to trade</p>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight mb-5 reveal-left">
                The market moves big<br />at <span className="text-amber-400">specific times only.</span>
              </h2>
              <p className="text-base text-[#7B8DB4] leading-relaxed mb-5 reveal">
                Professional traders don&apos;t trade 8 hours a day. They trade 2–3 hour windows called <strong className="text-[#CBD5E1]">Kill Zones</strong> — when institutional banks open, place massive orders, and drive price in one direction.
              </p>
              <p className="text-base text-[#7B8DB4] leading-relaxed mb-5 reveal">
                Outside these windows, the market chops sideways. Retail traders lose money trying to trade dead sessions. Every Traxora signal includes Kill Zone context — so you know whether the timing is right.
              </p>
              <p className="text-sm text-[#4B5675] leading-relaxed mb-6 reveal">
                Based on ICT methodology by Michael Huddleston — the same framework used to analyze where JP Morgan, Goldman Sachs, and HSBC actually place orders.
              </p>
              <div className="reveal">
                <Link href="/guide" className="inline-flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300 transition-colors font-semibold">
                  Learn the Kill Zone methodology →
                </Link>
              </div>
            </div>

            {/* Right: Kill Zone cards */}
            <div className="space-y-3">
              {[
                {
                  name:"London Kill Zone",
                  time:"2:00 AM – 5:00 AM ET",
                  desc:"London banks open and clear out stop-losses before the real directional move. Most reliable high-probability setups of the day.",
                  badge:"High probability",
                  border:"border-amber-500/25", badgeBg:"bg-amber-500/15 text-amber-400", dot:"bg-amber-400", timeTxt:"text-amber-400/80",
                },
                {
                  name:"New York AM Kill Zone",
                  time:"8:30 AM – 11:00 AM ET",
                  desc:"Highest liquidity and institutional order flow of the day. Best window for day trades and continuation moves from the London session.",
                  badge:"Highest probability",
                  border:"border-emerald-500/25", badgeBg:"bg-emerald-500/15 text-emerald-400", dot:"bg-emerald-400", timeTxt:"text-emerald-400/80",
                },
                {
                  name:"New York PM Kill Zone",
                  time:"1:30 PM – 3:00 PM ET",
                  desc:"End-of-day reversals and positioning. Lower probability than AM session. Traxora flags these with a caution tag.",
                  badge:"Lower probability",
                  border:"border-rose-500/20", badgeBg:"bg-rose-500/15 text-rose-400", dot:"bg-rose-400", timeTxt:"text-rose-400/70",
                },
                {
                  name:"Dead Zone — Do Not Trade",
                  time:"11:00 AM – 1:30 PM ET",
                  desc:"Choppy, low volume, no institutional interest. The AI will tell you to wait when price enters this window — saving you from bad trades.",
                  badge:"Avoid",
                  border:"border-[#252345]", badgeBg:"bg-[#1C1933] text-[#4B5675]", dot:"bg-[#252345]", timeTxt:"text-[#4B5675]",
                },
              ].map((kz, i) => (
                <div key={kz.name} className={`reveal-right reveal-d${i + 1} bg-[#0D0B1A] border ${kz.border} rounded-xl px-5 py-4 flex gap-4 items-start hover:brightness-110 hover:translate-x-1 transition-all duration-300`}>
                  <span className={`w-2 h-2 rounded-full ${kz.dot} shrink-0 mt-2`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-bold text-[#F1F5F9]">{kz.name}</p>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${kz.badgeBg}`}>{kz.badge}</span>
                    </div>
                    <p className={`text-[11px] font-mono font-semibold mb-1.5 ${kz.timeTxt}`}>{kz.time}</p>
                    <p className="text-xs text-[#4B5675] leading-relaxed">{kz.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS — 3 horizontal step cards ══ */}
      <section className="px-6 sm:px-10 py-24 max-w-5xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row gap-4 mb-12 items-start">
          <div className="lg:w-64 shrink-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-cyan-400 mb-3 reveal">How it works</p>
            <h2 className="reveal heading-underline text-4xl font-black tracking-tight">Three steps to your next trade.</h2>
          </div>
          <div className="flex-1 lg:pt-12">
            <p className="text-lg text-[#7B8DB4] leading-relaxed reveal">No setup, no configuration. Open the app and start getting signals in seconds — no account needed — even if you&apos;ve never traded before.</p>
          </div>
        </div>
        <div className="space-y-5">
          {[
            {
              n:"01",
              title:"Open the app",
              desc:"No sign-up. No forms. Just open the dashboard and start — your watchlist and journal stay private to your browser.",
              detail:"Everything is free for everyone — full AI signals, Deep Scanner, options analysis, journal, and the Trade Planner.",
              numColor:"text-cyan-500/25", accentColor:"text-cyan-400/70",
            },
            {
              n:"02",
              title:"Enter any stock or futures ticker",
              desc:"Type AAPL, NVDA, TSLA, ES (S&P 500 futures), NQ (Nasdaq futures), GC (gold) — any symbol. The AI runs a full institutional analysis.",
              detail:"The AI checks all 6 Smart Money concepts simultaneously: Order Blocks, FVGs, liquidity, market structure, OTE zones, and Kill Zone timing.",
              numColor:"text-emerald-500/25", accentColor:"text-emerald-400/70",
            },
            {
              n:"03",
              title:"Act on the signal",
              desc:"Get a clear BUY, HOLD, or SELL with a specific entry zone, stop-loss level, and price target. No chart reading experience needed.",
              detail:"Every signal explains the reasoning in plain English. If the setup is risky or outside a Kill Zone, the AI explicitly tells you to wait.",
              numColor:"text-violet-500/25", accentColor:"text-violet-400/70",
            },
          ].map((s, i) => (
            <div key={s.n} className={`reveal reveal-d${i + 1} flex gap-6 items-start bg-[#13112A] border border-[#252345] rounded-2xl p-7 hover:border-[#333368] hover:-translate-y-0.5 transition-all`}>
              <span className={`text-5xl font-black leading-none shrink-0 ${s.numColor} select-none`}>{s.n}</span>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-black text-[#F1F5F9] mb-2">{s.title}</h3>
                <p className="text-base text-[#7B8DB4] leading-relaxed mb-3">{s.desc}</p>
                <p className={`text-sm leading-relaxed ${s.accentColor}`}>{s.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ SMART MONEY CONCEPTS — left description, right 2-col grid ══ */}
      <section className="px-6 sm:px-10 py-24 landing-stripe">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-start">
            {/* Left: description */}
            <div className="lg:col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-violet-400 mb-4 reveal">Methodology</p>
              <h2 className="reveal heading-underline text-4xl font-black tracking-tight mb-5">Built on 6 Smart Money concepts.</h2>
              <p className="text-base text-[#7B8DB4] leading-relaxed mb-5 reveal">
                Smart Money (ICT methodology) is how institutional banks — JPMorgan, Goldman Sachs, HSBC — actually move markets. They don&apos;t buy at obvious support. They engineer liquidity grabs first, then reverse.
              </p>
              <p className="text-base text-[#7B8DB4] leading-relaxed mb-6 reveal">
                Traxora decodes all six signals simultaneously. The AI only fires a BUY or SELL when multiple concepts align — reducing noise and false signals significantly.
              </p>
              <Link href="/guide" className="reveal inline-flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 transition-colors font-semibold">
                Learn the full methodology →
              </Link>
            </div>

            {/* Right: concept cards */}
            <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { tag:"OB",  name:"Order Blocks",       desc:"Last opposing candle before an impulse move. Smart money leaves orders here — price returns to fill them before continuing." },
                { tag:"FVG", name:"Fair Value Gap",      desc:"Price imbalance where the market moved too fast. Institutions send price back to close these gaps." },
                { tag:"LIQ", name:"Liquidity Sweep",     desc:"Stop clusters above highs and below lows. Smart money sweeps these levels to fill large orders, then reverses hard." },
                { tag:"MSS", name:"Market Structure",    desc:"Higher highs and higher lows define a trend. The AI tracks structure across multiple timeframes simultaneously." },
                { tag:"OTE", name:"Optimal Trade Entry", desc:"61.8–78.6% Fibonacci retracement of a swing — the highest-probability zone to enter before continuation." },
                { tag:"KZ",  name:"Kill Zones",          desc:"London (2–5am ET) and NY AM (8:30–11am ET) sessions — when 80% of all institutional moves occur." },
              ].map((c, i) => (
                <div key={c.tag} className={`reveal reveal-d${(i % 2) + 1} bg-[#0D0B1A] border border-[#252345] rounded-xl p-5 hover:border-violet-500/30 transition-colors`}>
                  <span className="text-[10px] font-black text-violet-400 bg-violet-500/8 border border-violet-500/20 px-2.5 py-1 rounded-lg inline-block mb-3">{c.tag}</span>
                  <p className="text-sm font-bold text-[#F1F5F9] mb-1.5">{c.name}</p>
                  <p className="text-xs text-[#4B5675] leading-relaxed">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ TESTIMONIALS — wide card top + two below ══ */}
      <section className="px-6 sm:px-10 py-24 max-w-5xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400 mb-3 reveal">Traders love it</p>
            <h2 className="reveal heading-underline text-4xl sm:text-5xl font-black tracking-tight">What traders are saying.</h2>
          </div>
          <p className="text-base text-[#7B8DB4] max-w-xs leading-relaxed sm:text-right reveal">Real feedback from the early beta community.</p>
        </div>

        {/* Wide card */}
        <div className="reveal mb-5">
          <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-8 flex flex-col sm:flex-row gap-6 items-start hover:border-[#333368] transition-colors">
            <div className="text-6xl font-black text-emerald-500/10 leading-none shrink-0 select-none">&ldquo;</div>
            <div className="flex-1">
              <p className="text-lg text-[#CBD5E1] leading-relaxed mb-6">The morning briefing alone is worth it. I know exactly what to watch before the open — macro, key levels, top setups. Used to spend 45 minutes doing this manually every day. Traxora does it in seconds, and honestly it&apos;s better than what I was producing myself.</p>
              <div className="flex items-center gap-3">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <svg key={j} width="13" height="13" viewBox="0 0 24 24" fill="#F59E0B"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  ))}
                </div>
                <p className="text-sm font-bold text-[#E2E8F0]">Marcus D.</p>
                <p className="text-xs text-[#4B5675]">Day trader</p>
              </div>
            </div>
          </div>
        </div>

        {/* Two smaller cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {[
            { quote:"Finally an app that explains WHY it's a BUY — not just a candle pattern. The AI reasoning cites specific Order Blocks and FVGs and I can verify it myself on the chart. That builds real trust.", name:"rangepk3r", role:"Community admin" },
            { quote:"I'm new to trading. The Kill Zone timing stopped me from making dumb trades at 2pm when nothing is moving. That one lesson alone saved me money in week one.", name:"Dev R.", role:"Beginner trader, 3 months in" },
          ].map((t, i) => (
            <div key={i} className={`reveal reveal-d${i + 1} bg-[#13112A] border border-[#252345] rounded-2xl p-7 flex flex-col hover:border-[#333368] transition-colors`}>
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: 5 }).map((_, j) => (
                  <svg key={j} width="12" height="12" viewBox="0 0 24 24" fill="#F59E0B"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                ))}
              </div>
              <p className="text-base text-[#94A3B8] leading-relaxed flex-1 mb-5">&ldquo;{t.quote}&rdquo;</p>
              <div className="border-t border-[#252345] pt-4">
                <p className="text-sm font-bold text-[#E2E8F0]">{t.name}</p>
                <p className="text-xs text-[#4B5675] mt-0.5">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ COMPARISON — left-aligned header ══ */}
      <section className="px-6 sm:px-10 py-24 max-w-5xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row gap-4 mb-12 items-start">
          <div className="lg:w-72 shrink-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#4B5675] mb-3 reveal">Comparison</p>
            <h2 className="text-4xl font-black tracking-tight reveal">No competitor offers all of this.</h2>
          </div>
          <div className="flex-1 lg:pt-10">
            <p className="text-lg text-[#7B8DB4] leading-relaxed reveal">Smart Money signals + Claude AI + a $0 price tag. None of them have all three.</p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-[#252345]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#252345]">
                <th className="text-left py-4 pl-6 pr-4 text-[#4B5675] text-xs uppercase tracking-widest font-medium">Feature</th>
                {[
                  { name:"Traxora",     price:"Free",    highlight:true  },
                  { name:"Trade Ideas", price:"$118/mo", highlight:false },
                  { name:"Signal Stack",price:"$49/mo",  highlight:false },
                  { name:"TrendSpider", price:"$33/mo",  highlight:false },
                ].map(col => (
                  <th key={col.name} className={`py-4 px-4 text-center text-xs font-semibold ${col.highlight ? "bg-emerald-600/8 border-x border-emerald-500/15 text-emerald-300" : "text-[#4B5675]"}`}>
                    <p>{col.name}</p>
                    <p className={`text-sm font-black mt-1 ${col.highlight ? "text-emerald-400" : "text-[#CBD5E1]"}`}>{col.price}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { feature:"Smart Money signals",   t:true,  ti:false, ss:false, ts:false },
                { feature:"Claude AI analysis",    t:true,  ti:false, ss:false, ts:false },
                { feature:"Live BUY/SELL signals", t:true,  ti:true,  ss:true,  ts:true  },
                { feature:"Trade simulator",       t:true,  ti:false, ss:false, ts:true  },
                { feature:"Push notifications",    t:true,  ti:false, ss:true,  ts:false },
                { feature:"AI morning briefing",   t:true,  ti:false, ss:false, ts:false },
                { feature:"Sports, crypto & IPO coverage", t:true, ti:false, ss:false, ts:false },
                { feature:"Under $10/mo",          t:true,  ti:false, ss:false, ts:false },
              ].map((row, i) => (
                <tr key={row.feature} className={`border-b border-[#252345] last:border-0 ${i % 2 !== 0 ? "bg-[#13112A]/30" : ""}`}>
                  <td className="py-3.5 pl-6 pr-4 text-[#CBD5E1] text-xs">{row.feature}</td>
                  {[
                    { val:row.t,  h:true  },
                    { val:row.ti, h:false },
                    { val:row.ss, h:false },
                    { val:row.ts, h:false },
                  ].map((cell, ci) => (
                    <td key={ci} className={`py-3.5 px-4 text-center ${cell.h ? "bg-emerald-600/8 border-x border-emerald-500/15" : ""}`}>
                      {cell.val
                        ? <svg className="inline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        : <svg className="inline opacity-30" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ══ FAQ — left heading + right accordion ══ */}
      <section className="px-6 sm:px-10 py-24 landing-stripe">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-12">
          <div className="lg:col-span-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400 mb-4 reveal">FAQ</p>
            <h2 className="reveal heading-underline text-4xl font-black tracking-tight mb-5">Common questions.</h2>
            <p className="text-base text-[#7B8DB4] leading-relaxed reveal">Everything you need to know before getting started.</p>
          </div>
          <div className="lg:col-span-3 space-y-2">
            {[
              { q:"Do I need trading experience?",       a:"No. Every signal includes plain-English reasoning — what the Order Block means, why this is a Kill Zone, what the entry level represents. Beginners learn as they use it; experienced traders get institutional confirmation they can trust." },
              { q:"What exactly does the AI analyze?",   a:"Six Smart Money concepts per ticker: Order Blocks, Fair Value Gaps, Liquidity Sweeps, Market Structure Shifts, Optimal Trade Entry zones, and Kill Zone timing — synthesized into a single verdict with entry zone, stop-loss, and target." },
              { q:"Is it really free?",                  a:"Yes. Every feature is free for everyone — no subscription, no credit card, no paywall." },
              { q:"Do I need to sign up?",               a:"No. There is no account to create. Open the dashboard and start. Your watchlist, journal and portfolio are saved to your browser, so use the same browser to keep them." },
              { q:"Is this financial advice?",           a:"No. Traxora is an educational research tool. All signals are generated by AI analyzing public market data. Always do your own research and consult a licensed financial advisor before making investment decisions." },
            ].map(item => (
              <details key={item.q} className="group bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden hover:border-[#333368] transition-colors">
                <summary className="flex items-center justify-between px-6 py-5 cursor-pointer">
                  <p className="font-bold text-base text-[#F1F5F9] pr-6">{item.q}</p>
                  <svg className="shrink-0 text-[#4B5675] transition-transform duration-200 group-open:rotate-180" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </summary>
                <p className="px-6 pb-6 text-base text-[#7B8DB4] leading-relaxed border-t border-[#252345] pt-5">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA — full-width card, text left, buttons right ══ */}
      <section className="px-6 sm:px-10 py-24 max-w-5xl mx-auto w-full">
        <div className="bg-[#13112A] border border-emerald-500/20 rounded-3xl overflow-hidden relative">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-emerald-600/8 rounded-full blur-3xl" />
            <div className="absolute top-0 left-20 w-[300px] h-[200px] bg-cyan-600/5 rounded-full blur-3xl" />
          </div>
          <div className="relative z-10 px-8 sm:px-12 py-14 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400 mb-4">Get started today</p>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">
                Institutional-grade analysis.<br /><span className="text-emerald-400">Free for everyone.</span>
              </h2>
              <p className="text-lg text-[#7B8DB4] leading-relaxed">No sign-up, no credit card, no paywall. Open the app and start.</p>
            </div>
            <div className="flex flex-col gap-4 lg:items-end">
              <button type="button" onMouseDown={ripple} onClick={handleLaunch} className="btn-shimmer ripple-container bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-all px-9 py-4 rounded-xl text-base font-bold shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 w-full lg:w-auto">
                {session ? "Open Dashboard →" : "Get started →"}
              </button>
              <Link href="/guide" className="border border-[#252345] hover:border-[#333368] transition-colors px-9 py-4 rounded-xl text-base font-medium text-[#7B8DB4] hover:text-[#F1F5F9] text-center w-full lg:w-auto">
                Read the guide →
              </Link>
              <p className="text-xs text-[#4B5675] lg:text-right">Powered by Claude · No account needed</p>
            </div>
          </div>
        </div>
      </section>

      {/* ══ STICKY MOBILE CTA ══ */}
      {!session && (
        <div className={`md:hidden fixed bottom-0 left-0 right-0 z-30 px-4 pb-5 pt-3 bg-gradient-to-t from-[#0D0B1A] to-[#0D0B1A]/0 transition-all duration-300 ${showSticky ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
          <button type="button" onMouseDown={ripple} onClick={handleLaunch} className="btn-shimmer ripple-container w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-all py-4 rounded-xl text-sm font-bold shadow-2xl shadow-emerald-500/30">
            Open the app — free →
          </button>
        </div>
      )}

      {/* ══ FOOTER ══ */}
      <footer className="border-t border-[#252345] px-6 sm:px-10 py-8 bg-[#0D0B1A]/60">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded bg-emerald-600 logo-icon-bg flex items-center justify-center">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
                </svg>
              </div>
              <span className="text-xs font-bold">Traxora AI</span>
            </div>
            <p className="text-[11px] text-[#4B5675]">© 2026 Traxora · Not financial advice · For educational use only</p>
          </div>
          <div className="flex gap-5 flex-wrap">
            {[
              { href:"/dashboard",    label:"Dashboard" },
              { href:"/intelligence", label:"Scanner"   },
              { href:"/analysis",     label:"Signals"   },
              { href:"/guide",        label:"Guide"     },
              { href:"/privacy",      label:"Privacy"   },
              { href:"/terms",        label:"Terms"     },
            ].map(l => (
              <Link key={l.href} href={l.href} className="text-xs text-[#4B5675] hover:text-[#7B8DB4] transition-colors">{l.label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
