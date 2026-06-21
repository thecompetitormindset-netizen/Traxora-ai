"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const LIVE_SIGNALS = [
  { sym:"NVDA", name:"NVIDIA Corp.",    price:"$134.50", sig:"BUY",  conf:"High",   ob:"Bullish OB at $131.20", fvg:"FVG $132–134",   liq:"BSL at $135.80", kz:"NY session"   },
  { sym:"AAPL", name:"Apple Inc.",      price:"$189.20", sig:"HOLD", conf:"Medium", ob:"Premium zone, no OB",   fvg:"FVG filled $188", liq:"SSL at $186",    kz:"Pre-London"   },
  { sym:"TSLA", name:"Tesla Inc.",      price:"$178.40", sig:"SELL", conf:"High",   ob:"Bearish OB at $182",    fvg:"FVG $179–181",   liq:"BSL swept $183", kz:"NY AM session"},
  { sym:"GC",   name:"Gold Futures",   price:"$2,340",  sig:"BUY",  conf:"High",   ob:"Bullish OB $2,325",     fvg:"FVG $2,328–332", liq:"SSL at $2,318",  kz:"London open"  },
  { sym:"MSFT", name:"Microsoft Corp.", price:"$415.80", sig:"BUY",  conf:"Medium", ob:"Bullish OB at $411",    fvg:"FVG $412–415",   liq:"BSL at $420",    kz:"NY session"   },
];

const PLAN_CACHE_KEY = "traxora_plan_cache";

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  function handleLaunch() {
    if (session) { router.push("/dashboard"); }
    else { signIn("google", { callbackUrl: "/dashboard" }); }
  }

  useEffect(() => {
    if (status !== "authenticated") return;
    try {
      if (sessionStorage.getItem(PLAN_CACHE_KEY) === "pro") { router.replace("/dashboard"); return; }
    } catch { /* ignore */ }
    fetch("/api/user/plan")
      .then(r => r.json())
      .then(({ plan }) => {
        if (plan === "pro") {
          try { sessionStorage.setItem(PLAN_CACHE_KEY, "pro"); } catch { /* ignore */ }
          router.replace("/dashboard");
        }
      })
      .catch(() => {});
  }, [status, router]);

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

  useEffect(() => {
    const fn = () => { setNavScrolled(window.scrollY > 20); setShowSticky(window.scrollY > 600); };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

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

  const NAV_LINKS = [
    { href:"/intelligence", label:"Scanner" },
    { href:"/analysis",     label:"Signals" },
    { href:"/pricing",      label:"Pricing" },
    { href:"/guide",        label:"Guide"   },
  ];

  return (
    <div className="min-h-screen text-[#F1F5F9] flex flex-col">

      {/* ══ NAV ══ */}
      <nav className={`relative z-20 border-b border-[#252345]/60 px-6 sm:px-10 h-16 flex items-center justify-between backdrop-blur-sm bg-[#0D0B1A]/90 sticky top-0 transition-all duration-300 ${navScrolled ? "shadow-lg shadow-black/20" : ""}`}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
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
          <button type="button" onClick={handleLaunch} className="bg-emerald-600 hover:bg-emerald-500 transition-colors px-4 py-2 rounded-lg text-sm font-semibold">
            {session ? "Dashboard →" : "Get started →"}
          </button>
          <button type="button" aria-label="Menu" aria-expanded={mobileMenuOpen ? "true" : "false"} onClick={() => setMobileMenuOpen(o => !o)} className="md:hidden w-8 h-8 flex flex-col items-center justify-center gap-1.5 rounded-lg hover:bg-[#1A1838] transition-colors">
            <span className={`block w-5 h-0.5 bg-[#7B8DB4] transition-all ${mobileMenuOpen ? "rotate-45 translate-y-2" : ""}`} />
            <span className={`block w-5 h-0.5 bg-[#7B8DB4] transition-all ${mobileMenuOpen ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-0.5 bg-[#7B8DB4] transition-all ${mobileMenuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
          </button>
        </div>
      </nav>

      {/* ══ MOBILE MENU ══ */}
      <div className={`md:hidden overflow-hidden transition-all duration-300 bg-[#0D0B1A]/98 backdrop-blur-xl border-b border-[#252345]/60 ${mobileMenuOpen ? "max-h-64" : "max-h-0"}`} aria-hidden={mobileMenuOpen ? "false" : "true"}>
        <div className="px-6 py-4 flex flex-col gap-1">
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setMobileMenuOpen(false)} className="text-sm text-[#CBD5E1] hover:text-[#F1F5F9] py-3 border-b border-[#252345]/40 last:border-0 transition-colors">{l.label}</Link>
          ))}
          <button type="button" onClick={() => { setMobileMenuOpen(false); handleLaunch(); }} className="mt-3 w-full bg-emerald-600 hover:bg-emerald-500 transition-colors py-3 rounded-xl text-sm font-bold">
            {session ? "Open Dashboard →" : "Sign in with Google →"}
          </button>
        </div>
      </div>

      {/* ══ HERO ══ */}
      <section data-hero className="relative flex flex-col items-center justify-center text-center px-6 sm:px-10 pt-20 pb-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-emerald-600/6 rounded-full blur-3xl" />
          <div className="absolute inset-0 bg-dot-grid opacity-[0.12]" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="hero-enter hero-enter-1 inline-flex items-center gap-2 bg-[#13112A] border border-[#252345] rounded-full px-4 py-1.5 text-xs text-[#7B8DB4] font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Powered by Claude Sonnet 4.6 · Live market data
          </div>

          <h1 className="hero-enter hero-enter-2 text-5xl sm:text-7xl font-black tracking-tight leading-[1.05] mb-5">
            <span className="block">Know exactly</span>
            <span className="block text-gradient-animate">when to trade.</span>
          </h1>

          <p className="hero-enter hero-enter-3 text-[#7B8DB4] text-lg leading-relaxed mb-8 max-w-xl mx-auto">
            AI-powered signals built on Smart Money methodology. Enter any ticker — get a clear BUY, HOLD, or SELL with a full trade plan in seconds.
          </p>

          <div className="hero-enter hero-enter-4 flex items-center justify-center mb-4">
            <button type="button" onMouseDown={ripple} onClick={handleLaunch} className="btn-shimmer ripple-container bg-emerald-600 hover:bg-emerald-500 transition-all px-8 py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-95 flex items-center gap-2.5">
              {!session && (
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="white"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white"/>
                </svg>
              )}
              {session ? "Open Dashboard →" : "Sign in with Google — free"}
            </button>
          </div>
          {!session && <p className="text-xs text-[#4B5675]">No credit card required · Pro plan $5/mo · Cancel anytime</p>}
          <p className="text-xs text-[#4B5675] mt-2">
            Not sure yet?{" "}
            <Link href="/guide" className="text-emerald-500 hover:text-emerald-400 transition-colors underline underline-offset-2">See how it works →</Link>
          </p>
        </div>

        {/* Live signal card */}
        <div className="animate-signal-float relative z-10 mt-14 w-full max-w-sm mx-auto">
          <div className={`bg-[#13112A] border ${sigBorder} rounded-2xl overflow-hidden shadow-2xl ${signalFade ? "signal-fade-in" : "signal-fade-out"}`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#252345]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="font-bold text-sm">{signal.sym}</span>
                <span className="text-[11px] text-[#4B5675]">{signal.name}</span>
              </div>
              <span className={`text-xs font-black px-2.5 py-1 rounded-md border ${sigColor}`}>{signal.sig}</span>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
              {[
                { label:"Order Block",  value:signal.ob  },
                { label:"Fair Value Gap", value:signal.fvg },
                { label:"Liquidity",    value:signal.liq },
                { label:"Kill Zone",    value:signal.kz  },
              ].map(r => (
                <div key={r.label}>
                  <p className="text-[9px] text-[#4B5675] uppercase tracking-wider font-medium">{r.label}</p>
                  <p className="text-[11px] text-[#CBD5E1] font-medium mt-0.5">{r.value}</p>
                </div>
              ))}
            </div>
            <div className="px-4 pb-3 flex items-center justify-between border-t border-[#252345] pt-2.5">
              <span className="text-[10px] text-[#4B5675]">Confidence: <span className={signal.conf === "High" ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>{signal.conf}</span></span>
              <span className="text-[10px] font-mono text-[#CBD5E1]">{signal.price}</span>
            </div>
          </div>
          <p className="text-center text-[10px] text-[#333368] mt-2">Demo signal · Not financial advice</p>
        </div>
      </section>

      {/* ══ METRICS STRIP ══ */}
      <div className="border-y border-[#252345]/60 bg-[#0D0B1A]/60 py-6 px-6 sm:px-10">
        <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { value:"< 5s", label:"AI analysis per ticker" },
            { value:"6",    label:"Smart Money concepts per signal" },
            { value:"8:30", label:"AM ET daily market briefing" },
            { value:"$5",   label:"Per month, full Pro access" },
          ].map(s => (
            <div key={s.label}>
              <p className="text-2xl font-black text-[#F1F5F9]">{s.value}</p>
              <p className="text-xs text-[#4B5675] mt-1 leading-snug">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ══ FEATURES ══ */}
      <section className="px-6 sm:px-10 py-24 max-w-5xl mx-auto w-full">
        <div className="text-center mb-14">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400 mb-3">Platform</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">Everything you need to trade smarter.</h2>
          <p className="text-[#7B8DB4] text-sm max-w-md mx-auto">One platform for signals, analysis, journaling, options, and futures — built on institutional-grade methodology.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { n:"01", title:"AI Signal Analysis",   desc:"Enter any ticker. Claude Sonnet 4.6 checks Order Blocks, FVGs, liquidity, and Kill Zone timing — returns BUY, HOLD, or SELL with entry zone, stop, and target." },
            { n:"02", title:"Morning Briefing",     desc:"Full AI market brief at 8:30am ET. Macro regime, top options plays, futures setups, VIX context, and the day's key levels — before the open." },
            { n:"03", title:"Deep Market Scanner",  desc:"Scan 50+ tickers at once. Ranked by smart money conviction score. The highest-probability setups surface automatically." },
            { n:"04", title:"Options Analysis",     desc:"Implied volatility, expected move, Greeks, and strike selection in one report. Know whether IV is cheap or rich before committing premium." },
            { n:"05", title:"AI Trade Journal",     desc:"Every closed trade is auto-reviewed — market structure, risk management, psychology, and a lesson. No manual logging required." },
            { n:"06", title:"Paper Trading Sim",    desc:"Practice with a $10,000 simulated account. Test every strategy risk-free before deploying real capital. Track win rate and R-multiple." },
          ].map((f, i) => (
            <div key={f.title} className={`reveal reveal-d${(i % 3) + 1} bg-[#13112A] border border-[#252345] rounded-2xl p-6 hover:border-[#333368] transition-colors`}>
              <p className="text-[11px] font-black text-emerald-500/40 mb-3 tracking-widest">{f.n}</p>
              <h3 className="font-bold text-[#F1F5F9] mb-2">{f.title}</h3>
              <p className="text-sm text-[#7B8DB4] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══ HOW IT WORKS ══ */}
      <section className="px-6 sm:px-10 py-20 bg-[#0A0818]/60 border-y border-[#252345]/40">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400 mb-3">How it works</p>
            <h2 className="text-3xl font-black tracking-tight">Three steps to your next trade.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { n:"01", title:"Sign in",            desc:"Create your account with Google in one click. Free tier is available immediately — no credit card required." },
              { n:"02", title:"Enter any ticker",   desc:"Type AAPL, NVDA, ES, GC, or any stock or futures symbol. The AI runs a full institutional analysis in seconds." },
              { n:"03", title:"Act on the signal",  desc:"Get a clear verdict with a specific entry zone, stop-loss, and price target based on live Smart Money market structure." },
            ].map(s => (
              <div key={s.n} className="reveal flex gap-5">
                <span className="text-4xl font-black text-[#1C1A3A] shrink-0 leading-none mt-0.5">{s.n}</span>
                <div>
                  <h3 className="font-bold text-[#F1F5F9] mb-2">{s.title}</h3>
                  <p className="text-sm text-[#7B8DB4] leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ SMART MONEY CONCEPTS ══ */}
      <section className="px-6 sm:px-10 py-24 max-w-5xl mx-auto w-full">
        <div className="flex flex-col lg:flex-row gap-14 items-start">
          <div className="lg:w-[38%]">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400 mb-4">Methodology</p>
            <h2 className="text-3xl font-black tracking-tight mb-4">Built on 6 core Smart Money concepts.</h2>
            <p className="text-[#7B8DB4] text-sm leading-relaxed mb-4">Smart Money (or ICT) is how institutional banks and funds — JP Morgan, Goldman Sachs — actually move markets. They hunt retail stop-losses, fill orders at specific price levels, and only act during specific sessions.</p>
            <p className="text-[#7B8DB4] text-sm leading-relaxed mb-6">Traxora decodes these six signals for you automatically. Every analysis checks all six — the AI only fires when multiple concepts align, reducing noise and increasing precision.</p>
            <Link href="/guide" className="inline-flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors font-semibold">
              Learn the methodology →
            </Link>
          </div>
          <div className="lg:w-[62%] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { tag:"OB",  name:"Order Blocks",       desc:"Last opposing candle before an impulse move. Smart money leaves orders here — price returns to fill them." },
              { tag:"FVG", name:"Fair Value Gap",      desc:"Price imbalance where the market moved too fast. Institutions send price back to close these gaps." },
              { tag:"LIQ", name:"Liquidity Sweep",     desc:"Stop clusters above highs and below lows. Smart money sweeps these levels to fill large orders, then reverses." },
              { tag:"MSS", name:"Market Structure",    desc:"Higher highs and higher lows define a trend. The AI tracks structure across multiple timeframes simultaneously." },
              { tag:"OTE", name:"Optimal Trade Entry", desc:"61.8–78.6% Fibonacci retracement of a swing — the highest-probability zone to enter before continuation." },
              { tag:"KZ",  name:"Kill Zones",          desc:"London (2–5am ET) and NY (9:30–11am ET) sessions — when 80% of institutional moves occur." },
            ].map(c => (
              <div key={c.tag} className="reveal bg-[#13112A] border border-[#252345] rounded-xl p-4 hover:border-[#333368] transition-colors">
                <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/8 border border-emerald-500/20 px-2 py-0.5 rounded inline-block mb-2">{c.tag}</span>
                <p className="text-xs font-bold text-[#F1F5F9] mb-1">{c.name}</p>
                <p className="text-[11px] text-[#4B5675] leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ TESTIMONIALS ══ */}
      <section className="px-6 sm:px-10 py-20 bg-[#0A0818]/60 border-y border-[#252345]/40">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-[#4B5675] mb-10">What traders are saying</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { quote:"The morning briefing alone is worth it. I know exactly what to watch before the open.", name:"Austin L.", role:"Swing trader" },
              { quote:"Finally an app that explains WHY it's a BUY — not just a candle pattern. The AI reasoning is solid.", name:"rangepk3r", role:"Community admin" },
              { quote:"Deep analysis used to take me 45 min every morning. Traxora does it in seconds.", name:"Marcus D.", role:"Day trader" },
            ].map((t, i) => (
              <div key={i} className="reveal bg-[#13112A] border border-[#252345] rounded-2xl p-6 flex flex-col">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <svg key={j} width="11" height="11" viewBox="0 0 24 24" fill="#F59E0B"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  ))}
                </div>
                <p className="text-sm text-[#94A3B8] leading-relaxed flex-1 mb-5">&ldquo;{t.quote}&rdquo;</p>
                <div className="border-t border-[#252345] pt-4">
                  <p className="text-xs font-bold text-[#E2E8F0]">{t.name}</p>
                  <p className="text-[10px] text-[#4B5675] mt-0.5">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-[10px] text-[#333368] mt-6">Feedback from early beta users</p>
        </div>
      </section>

      {/* ══ PRICING ══ */}
      <section className="px-6 sm:px-10 py-24 max-w-4xl mx-auto w-full">
        <div className="text-center mb-12">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400 mb-3">Pricing</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-3">
            Others charge <span className="line-through text-[#4B5675]">$29–$118/mo</span>.<br />
            <span className="text-emerald-400">Traxora is $5/mo.</span>
          </h2>
          <p className="text-[#7B8DB4] text-sm max-w-sm mx-auto">Full institutional-grade analysis. No features locked behind higher tiers. Cancel anytime.</p>
        </div>

        <div className="reveal-scale bg-[#13112A] border border-emerald-500/25 rounded-3xl overflow-hidden relative">
          <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

          <div className="px-8 pt-8 pb-6 border-b border-[#252345] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Pro Plan</span>
                <span className="text-[10px] text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded-full font-semibold">Most popular</span>
              </div>
              <p className="text-4xl font-black">$5<span className="text-base font-normal text-[#4B5675]">/month</span></p>
              <p className="text-xs text-[#4B5675] mt-1">Billed monthly · cancel anytime · no hidden fees</p>
            </div>
            <button type="button" onMouseDown={ripple} onClick={handleLaunch} className="btn-shimmer ripple-container shrink-0 bg-emerald-600 hover:bg-emerald-500 transition-all px-8 py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-95">
              {session ? "Open Dashboard →" : "Get started — $5/mo →"}
            </button>
          </div>

          <div className="px-8 py-6 grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-8">
            {[
              "Unlimited AI signal analysis",
              "Morning briefing at 8:30am ET",
              "Deep scanner — 50+ tickers ranked",
              "Options analysis with Greeks & IV",
              "AI trade journal — auto-written",
              "Futures signals — ES, NQ, GC, CL",
              "Paper trading simulator — $10K",
              "Push notifications during Kill Zones",
            ].map(f => (
              <div key={f} className="flex items-center gap-2.5 text-sm text-[#CBD5E1] py-0.5">
                <svg className="shrink-0 text-emerald-500" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {f}
              </div>
            ))}
          </div>

          <div className="px-8 pb-8 text-center">
            <p className="text-[11px] text-[#4B5675]">Secure checkout via Ko-fi · Access activates immediately after payment</p>
          </div>
        </div>
      </section>

      {/* ══ COMPARISON ══ */}
      <section className="px-6 sm:px-10 py-20 max-w-5xl mx-auto w-full">
        <div className="text-center mb-12">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4B5675] mb-3">Comparison</p>
          <h2 className="text-3xl font-black tracking-tight mb-3">No competitor offers all of this.</h2>
          <p className="text-[#7B8DB4] text-sm max-w-md mx-auto">Smart Money signals + Claude Sonnet 4.6 + $5/mo. None of them have all three.</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-[#252345]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#252345]">
                <th className="text-left py-4 pl-6 pr-4 text-[#4B5675] text-xs uppercase tracking-widest font-medium">Feature</th>
                {[
                  { name:"Traxora",     price:"$5/mo",   highlight:true  },
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
        <div className="text-center mt-10">
          <button type="button" onMouseDown={ripple} onClick={handleLaunch} className="btn-shimmer ripple-container bg-emerald-600 hover:bg-emerald-500 transition-all px-10 py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-95">
            {session ? "Open Dashboard →" : "Get started — sign in with Google →"}
          </button>
        </div>
      </section>

      {/* ══ FAQ ══ */}
      <section className="px-6 sm:px-10 py-20 bg-[#0A0818]/60 border-y border-[#252345]/40">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400 mb-3">FAQ</p>
            <h2 className="text-3xl font-black tracking-tight">Common questions.</h2>
          </div>
          <div className="space-y-2">
            {[
              { q:"Do I need trading experience?",       a:"No. Every signal includes plain-English reasoning — what the Order Block means, why this is a Kill Zone, what the entry level represents. Beginners learn faster; experienced traders get confirmation they trust." },
              { q:"What exactly does the AI analyze?",   a:"Six Smart Money concepts per ticker: Order Blocks, Fair Value Gaps, Liquidity Sweeps, Market Structure Shifts, Optimal Trade Entry zones, and Kill Zone timing — synthesized into a single verdict with entry zone, stop-loss, and target." },
              { q:"Can I cancel Pro anytime?",           a:"Yes — cancel from Settings with one click. No contracts, no retention flows. You keep access through the end of your current billing period." },
              { q:"How fast does Pro activate?",         a:"Instantly. The moment your Ko-fi payment confirms, your account upgrades. Refresh the page — all Pro features are immediately available." },
              { q:"Is this financial advice?",           a:"No. Traxora is an educational research tool. All signals are generated by AI analyzing public market data. Always do your own research and consult a licensed financial advisor before making investment decisions." },
            ].map(item => (
              <details key={item.q} className="group bg-[#13112A] border border-[#252345] rounded-xl overflow-hidden hover:border-[#333368] transition-colors">
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer">
                  <p className="font-semibold text-sm text-[#F1F5F9] pr-4">{item.q}</p>
                  <svg className="shrink-0 text-[#4B5675] transition-transform duration-200 group-open:rotate-180" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </summary>
                <p className="px-5 pb-5 text-sm text-[#7B8DB4] leading-relaxed border-t border-[#252345] pt-4">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ══ */}
      <section className="px-6 sm:px-10 py-24 max-w-3xl mx-auto w-full text-center">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400 mb-4">Get started</p>
        <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">
          Institutional-grade analysis.<br />At $5 a month.
        </h2>
        <p className="text-[#7B8DB4] text-sm mb-8 max-w-sm mx-auto">No credit card required to start. Upgrade to Pro whenever you&apos;re ready.</p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button type="button" onMouseDown={ripple} onClick={handleLaunch} className="btn-shimmer ripple-container bg-emerald-600 hover:bg-emerald-500 transition-all px-8 py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-95">
            {session ? "Open Dashboard →" : "Sign in with Google — free →"}
          </button>
          <Link href="/guide" className="border border-[#252345] hover:border-[#333368] transition-colors px-7 py-3.5 rounded-xl text-sm font-medium text-[#7B8DB4] hover:text-[#F1F5F9]">
            Read the guide →
          </Link>
        </div>
      </section>

      {/* ══ STICKY MOBILE CTA ══ */}
      {!session && (
        <div className={`md:hidden fixed bottom-0 left-0 right-0 z-30 px-4 pb-5 pt-3 bg-gradient-to-t from-[#0D0B1A] to-[#0D0B1A]/0 transition-all duration-300 ${showSticky ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
          <button type="button" onMouseDown={ripple} onClick={handleLaunch} className="btn-shimmer ripple-container w-full bg-emerald-600 hover:bg-emerald-500 transition-all py-4 rounded-xl text-sm font-bold shadow-2xl shadow-emerald-500/30 flex items-center justify-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="white"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white"/>
            </svg>
            Sign in with Google — free
          </button>
        </div>
      )}

      {/* ══ FOOTER ══ */}
      <footer className="border-t border-[#252345] px-6 sm:px-10 py-8 bg-[#0D0B1A]/60">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-6 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center">
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
              { href:"/pricing",      label:"Pricing"   },
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
