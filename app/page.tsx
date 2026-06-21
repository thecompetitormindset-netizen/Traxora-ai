"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";


const TICKER_POOL = [
  { sym:"NVDA",  price:"—",  chg:"—",  up:true  },
  { sym:"AAPL",  price:"—",  chg:"—",  up:true  },
  { sym:"MSFT",  price:"—",  chg:"—",  up:true  },
  { sym:"META",  price:"—",  chg:"—",  up:true  },
  { sym:"AMZN",  price:"—",  chg:"—",  up:true  },
  { sym:"GOOGL", price:"—",  chg:"—",  up:true  },
  { sym:"TSLA",  price:"—",  chg:"—",  up:true  },
  { sym:"AMD",   price:"—",  chg:"—",  up:true  },
  { sym:"NFLX",  price:"—",  chg:"—",  up:true  },
  { sym:"JPM",   price:"—",  chg:"—",  up:true  },
  { sym:"GS",    price:"—",  chg:"—",  up:true  },
  { sym:"V",     price:"—",  chg:"—",  up:true  },
  { sym:"SPY",   price:"—",  chg:"—",  up:true  },
  { sym:"QQQ",   price:"—",  chg:"—",  up:true  },
  { sym:"XOM",   price:"—",  chg:"—",  up:true  },
  { sym:"COIN",  price:"—",  chg:"—",  up:true  },
  { sym:"ES",    price:"—",  chg:"—",  up:true  },
  { sym:"NQ",    price:"—",  chg:"—",  up:true  },
  { sym:"GC",    price:"—",  chg:"—",  up:true  },
  { sym:"CL",    price:"—",  chg:"—",  up:true  },
];

const LIVE_SIGNALS = [
  { sym:"NVDA", name:"NVIDIA Corp.",    price:"$134.50", sig:"BUY",  conf:"High",   ob:"Bullish OB at $131.20", fvg:"FVG $132–134", liq:"BSL at $135.80", kz:"NY session" },
  { sym:"AAPL", name:"Apple Inc.",      price:"$189.20", sig:"HOLD", conf:"Medium", ob:"Premium zone, no OB",   fvg:"FVG filled $188", liq:"SSL at $186",   kz:"Pre-London" },
  { sym:"TSLA", name:"Tesla Inc.",      price:"$178.40", sig:"SELL", conf:"High",   ob:"Bearish OB at $182",    fvg:"FVG $179–181",  liq:"BSL swept $183", kz:"NY AM session" },
  { sym:"GC",   name:"Gold Futures",   price:"$2,340",  sig:"BUY",  conf:"High",   ob:"Bullish OB $2,325",     fvg:"FVG $2,328–332", liq:"SSL at $2,318",  kz:"London open"  },
  { sym:"MSFT", name:"Microsoft Corp.", price:"$415.80", sig:"BUY",  conf:"Medium", ob:"Bullish OB at $411",    fvg:"FVG $412–415",  liq:"BSL at $420",    kz:"NY session"   },
];


type LivePrice = { price: string; chg: string; up: boolean };

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group bg-[#13112A] border border-[#252345] rounded-2xl overflow-hidden hover:border-[#333368] transition-colors">
      <summary className="flex items-center justify-between px-6 py-5 cursor-pointer">
        <p className="font-bold text-sm text-[#F1F5F9] pr-4">{q}</p>
        <span className="shrink-0 text-[#4B5675] transition-transform duration-300 group-open:rotate-180">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </span>
      </summary>
      <p className="px-6 pb-6 text-sm text-[#7B8DB4] leading-relaxed border-t border-[#252345] pt-4">{a}</p>
    </details>
  );
}

const PLAN_CACHE_KEY = "traxora_plan_cache";

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  function handleLaunch() {
    if (session) { router.push("/dashboard"); }
    else { signIn("google", { callbackUrl: "/dashboard" }); }
  }

  // Pro users skip the marketing page entirely and land straight in the app.
  const [checkingPlan, setCheckingPlan] = useState(false);
  useEffect(() => {
    if (status !== "authenticated") return;

    try {
      if (sessionStorage.getItem(PLAN_CACHE_KEY) === "pro") { router.replace("/dashboard"); return; }
    } catch { /* ignore */ }

    setCheckingPlan(true);
    fetch("/api/user/plan")
      .then(r => r.json())
      .then(({ plan }) => {
        if (plan === "pro") {
          try { sessionStorage.setItem(PLAN_CACHE_KEY, "pro"); } catch { /* ignore */ }
          router.replace("/dashboard");
        } else {
          setCheckingPlan(false);
        }
      })
      .catch(() => setCheckingPlan(false));
  }, [status, router]);

  const [signalIdx,  setSignalIdx]  = useState(0);
  const [signalFade, setSignalFade] = useState(true);

  const [tickOffset, setTickOffset] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [livePrices, setLivePrices] = useState<Record<string, LivePrice>>({});
  const [displayTicker, setDisplayTicker] = useState(TICKER_POOL.slice(0, 12));
  useEffect(() => {
    setDisplayTicker([...TICKER_POOL].sort(() => Math.random() - 0.5).slice(0, 12));
  }, []);

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


  useEffect(() => {
    tickRef.current = setInterval(() => setTickOffset(o => (o + 1) % (displayTicker.length * 120)), 30);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [displayTicker.length]);

  useEffect(() => {
    fetch("/api/market/tickers")
      .then(r => r.json())
      .then((data: Record<string, LivePrice>) => setLivePrices(data))
      .catch(() => {});
  }, []);

  // Sticky CTA: appear when hero scrolls out of view
  useEffect(() => {
    const hero = document.querySelector("[data-hero]");
    if (!hero) return;
    const obs = new IntersectionObserver(([e]) => setShowSticky(!e.isIntersecting), { threshold: 0 });
    obs.observe(hero);
    return () => obs.disconnect();
  }, []);

  // Nav scroll detection
  useEffect(() => {
    const fn = () => setNavScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Scroll reveal: add is-visible when elements enter viewport
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); obs.unobserve(e.target); }
      }),
      { threshold: 0.08, rootMargin: "0px 0px -24px 0px" }
    );
    document.querySelectorAll(".reveal, .reveal-left, .reveal-right, .reveal-scale").forEach(el => obs.observe(el));
    return () => obs.disconnect();
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
  function tilt(e: React.MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = ((e.clientY - r.top) / r.height - 0.5) * 8;
    const y = ((e.clientX - r.left) / r.width - 0.5) * -8;
    el.style.transform = `perspective(800px) rotateX(${x}deg) rotateY(${y}deg) translateY(-2px)`;
  }
  function untilt(e: React.MouseEvent<HTMLDivElement>) {
    e.currentTarget.style.transform = "";
  }
  function handleSpot(e: React.MouseEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setSpotX(((e.clientX - r.left) / r.width) * 100);
    setSpotY(((e.clientY - r.top) / r.height) * 100);
  }

  const signal = LIVE_SIGNALS[signalIdx];
  const quote  = QUOTES[quoteIdx];
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showSticky, setShowSticky] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const [spotX, setSpotX] = useState(50);
  const [spotY, setSpotY] = useState(50);
  const sigColor = signal.sig === "BUY" ? "badge-buy text-emerald-400 bg-emerald-500/10 border-emerald-500/30" : signal.sig === "SELL" ? "badge-sell text-rose-400 bg-rose-500/10 border-rose-500/30" : "badge-hold text-amber-400 bg-amber-500/10 border-amber-500/30";
  const sigBorder = signal.sig === "BUY" ? "border-emerald-500/25" : signal.sig === "SELL" ? "border-rose-500/25" : "border-amber-500/25";

  const NAV_LINKS = [
    { href: "/intelligence", label: "Scanner"  },
    { href: "/analysis",     label: "Signals"  },
    { href: "/pricing",      label: "Pricing"  },
    { href: "/guide",        label: "Guide"    },
  ];

  if (checkingPlan) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <svg className="animate-spin text-emerald-500" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-[#F1F5F9] flex flex-col overflow-hidden">

      {/* ══ NAV ══ */}
      <nav className={`relative z-20 border-b border-[#252345]/60 px-6 sm:px-8 h-16 flex items-center justify-between backdrop-blur-sm bg-[#0D0B1A]/80 sticky top-0 transition-all duration-300 ${navScrolled ? "nav-scrolled" : ""}`}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight">Traxora AI</span>
        </div>
        <div className="flex items-center gap-5">
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} className="text-sm text-[#4B5675] hover:text-[#F1F5F9] transition-colors hidden md:block">{l.label}</Link>
          ))}
          <button type="button" onClick={handleLaunch} className="bg-emerald-600 hover:bg-emerald-500 transition-all px-4 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95">
            {session ? "Dashboard →" : "Sign in →"}
          </button>
          <button
            type="button"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen ? "true" : "false"}
            onClick={() => setMobileMenuOpen(o => !o)}
            className="md:hidden flex flex-col items-center justify-center w-9 h-9 gap-1.5 rounded-lg hover:bg-[#1A1838] transition-colors"
          >
            <span className={`block w-5 h-0.5 bg-[#7B8DB4] transition-all ${mobileMenuOpen ? "rotate-45 translate-y-2" : ""}`} />
            <span className={`block w-5 h-0.5 bg-[#7B8DB4] transition-all ${mobileMenuOpen ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-0.5 bg-[#7B8DB4] transition-all ${mobileMenuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
          </button>
        </div>
      </nav>

      {/* ══ MOBILE MENU DRAWER ══ */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 bg-[#0D0B1A]/95 backdrop-blur-xl border-b border-[#252345]/60 ${mobileMenuOpen ? "max-h-72 opacity-100" : "max-h-0 opacity-0"}`}
        aria-hidden={mobileMenuOpen ? "false" : "true"}
      >
        <div className="px-6 py-4 flex flex-col gap-1">
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium text-[#CBD5E1] hover:text-[#F1F5F9] py-3 border-b border-[#252345]/60 last:border-0 transition-colors">{l.label}</Link>
          ))}
          <button type="button" onClick={() => { setMobileMenuOpen(false); handleLaunch(); }}
            className="mt-2 w-full bg-emerald-600 hover:bg-emerald-500 transition-colors py-3 rounded-xl text-sm font-bold text-white">
            {session ? "Open Dashboard →" : "Sign in with Google →"}
          </button>
        </div>
      </div>

      {/* ══ TICKER BAR ══ */}
      <div className="border-b border-[#252345]/60 bg-[#0D0B1A]/60 overflow-hidden py-2 relative">
        <div className="flex gap-0 whitespace-nowrap"
          style={{ transform: `translateX(-${tickOffset}px)`, transition: "transform 0.03s linear" }}>
          {[...displayTicker, ...displayTicker, ...displayTicker].map((t, i) => {
            const live = livePrices[t.sym];
            return (
              <span key={`${t.sym}-${i}`} className="inline-flex items-center gap-2 px-6 text-[11px] font-mono">
                <span className="text-[#7B8DB4] font-bold">{t.sym}</span>
                <span className="text-[#F1F5F9]">{live?.price ?? t.price}</span>
                <span className={(live?.up ?? t.up) ? "text-emerald-400" : "text-rose-400"}>{live?.chg ?? t.chg}</span>
                <span className="text-[#252345]">|</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* ══ HERO ══ */}
      <section
        data-hero
        className="relative flex flex-col items-center justify-center text-center px-6 sm:px-8 pt-24 pb-20 overflow-hidden"
        onMouseMove={handleSpot}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-600/8 rounded-full blur-3xl animate-pulse" />
          <div className="absolute top-1/3 left-1/3 w-[400px] h-[200px] bg-teal-600/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 right-1/4 w-[300px] h-[200px] bg-cyan-600/4 rounded-full blur-3xl" />
          {/* Dot grid */}
          <div className="absolute inset-0 bg-dot-grid opacity-[0.18]" />
          {/* Cursor spotlight */}
          <div
            className="absolute inset-0 transition-opacity duration-500"
            style={{ background: `radial-gradient(500px circle at ${spotX}% ${spotY}%, rgba(16,185,129,0.055), transparent 70%)` }}
          />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="hero-enter hero-enter-1 inline-flex items-center gap-2 bg-emerald-500/8 border border-emerald-500/20 rounded-full px-4 py-1.5 text-xs text-emerald-400 font-medium mb-10">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Powered by Claude AI · Live market data
          </div>

          <h1 className="hero-enter hero-enter-2 text-6xl sm:text-7xl font-black tracking-tight leading-[1.05] mb-6 flex flex-col items-center justify-center">
            <span className="block">Know exactly</span>
            <span className="block text-gradient-animate">
              when to trade.
            </span>
          </h1>

          <div className="hero-enter hero-enter-3">
            <p className="text-[#7B8DB4] text-lg leading-relaxed mb-2 max-w-xl mx-auto">
              AI that scans the market, fires a clear BUY or SELL signal, and tells you exactly where to enter, where to stop, and where price is headed.
            </p>
            <p className="text-emerald-400 text-sm font-bold mb-10">Less than a coffee a month — $5/mo full access.</p>
          </div>

          {/* Stats */}
          <div className="hero-enter hero-enter-4 flex items-center justify-center gap-2 mb-10 flex-wrap">
            {[
              { value: "500+",    label: "traders & growing",               icon: "👥" },
              { value: "6",       label: "Smart Money concepts per signal",  icon: "🧠" },
              { value: "8:30am",  label: "AI morning brief · daily",        icon: "🌅" },
              { value: "$5/mo",   label: "vs $29–$118 elsewhere",           icon: "✅" },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#1C1933] bg-[#0D0B1A]/60 text-xs text-[#4B5675]">
                <span>{s.icon}</span>
                <span className="font-black text-[#E2E8F0]">{s.value}</span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>

          <div className="hero-enter hero-enter-5 flex items-center justify-center gap-3 flex-wrap">
            <button
              type="button"
              onMouseDown={ripple}
              onClick={handleLaunch}
              className="btn-shimmer ripple-container btn-cta-glow bg-emerald-600 hover:bg-emerald-500 transition-all px-8 py-3.5 rounded-xl text-sm font-bold shadow-xl shadow-emerald-500/25 hover:scale-105 active:scale-95 flex items-center gap-2.5"
            >
              {!session && (
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="white"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="white"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="white"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="white"/>
                </svg>
              )}
              {session ? "Open Dashboard →" : "Sign in with Google"}
            </button>
            <Link href="/guide" className="border border-[#252345] bg-[#13112A]/60 hover:border-[#333368] backdrop-blur-sm transition-all px-7 py-3.5 rounded-xl text-sm font-semibold text-[#7B8DB4] hover:text-[#F1F5F9]">
              See How It Works
            </Link>
          </div>
          {!session && (
            <p className="hero-enter hero-enter-6 text-xs text-[#4B5675] mt-3">No credit card to start · Cancel anytime</p>
          )}
        </div>

        {/* Floating signal card */}
        <div className="animate-signal-float relative z-10 mt-16 w-full max-w-sm mx-auto">
          <div
            className={`bg-[#13112A] border ${sigBorder} rounded-2xl overflow-hidden shadow-2xl transition-all duration-350`}
            style={{ opacity: signalFade ? 1 : 0, transform: signalFade ? "translateY(0) scale(1)" : "translateY(4px) scale(0.99)" }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#252345]">
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
              <p className="text-[10px] font-mono text-[#F1F5F9]">{livePrices[signal.sym]?.price ?? signal.price}</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <span className="text-[9px] text-[#333368]">Demo signal</span>
            <span className="text-[#252345]">·</span>
            <span className="inline-flex items-center gap-1 text-[9px] text-amber-500/60 border border-amber-500/20 bg-amber-500/5 rounded px-1.5 py-px font-medium">⚠ Not financial advice</span>
          </div>
        </div>
      </section>

      {/* ══ PRODUCT FEATURES ══ */}
      <section className="px-6 sm:px-8 py-16 max-w-5xl mx-auto w-full">
        <p className="reveal text-center text-[10px] uppercase tracking-[0.2em] text-[#2D3A52] font-bold mb-8">Everything in one platform</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { icon:"⚡", title:"Live Signal Watchlist", desc:"Track unlimited stocks with BUY / HOLD / SELL signals, entry zones, stop losses, and targets — updated every minute.", tag:"Free", tagColor:"text-[#4B5675] border-[#252345]", delay:"reveal-d1" },
            { icon:"🔄", title:"Wheeling Hub",           desc:"Scan for high-premium cash-secured put candidates. Track your wheel positions end-to-end — CSP → assignment → covered call.", tag:"Free", tagColor:"text-[#4B5675] border-[#252345]", delay:"reveal-d2" },
            { icon:"🌅", title:"Morning Briefing",        desc:"Full AI market brief at 8:30am ET — macro regime, top options plays, futures setups, VIX context, and the day's key levels.", tag:"Pro", tagColor:"text-emerald-400 border-emerald-500/30", delay:"reveal-d3" },
            { icon:"💬", title:"AI Chat",                  desc:"Ask about any stock — earnings risk, options strategy, smart money levels, trade ideas. Get a sourced answer in seconds. Free tier: 25 questions/day.", tag:"Free", tagColor:"text-[#4B5675] border-[#252345]", delay:"reveal-d4" },
            { icon:"📊", title:"Deep Market Scanner",      desc:"Scan 50+ tickers at once for high-conviction setups. Ranked by smart money score — biggest opportunities rise to the top.", tag:"Pro", tagColor:"text-emerald-400 border-emerald-500/30", delay:"reveal-d5" },
            { icon:"📰", title:"Options Analysis",          desc:"Implied volatility, expected move, Greeks, and strike selection — all in one report. Know if IV is cheap or rich before you buy.", tag:"Pro", tagColor:"text-emerald-400 border-emerald-500/30", delay:"reveal-d6" },
          ].map(f => (
            <div
              key={f.title}
              className={`reveal ${f.delay} tilt-card card-glow gradient-border-card glass surface-sheen border border-[#252345] rounded-2xl p-6 hover:border-[#333368]`}
              onMouseMove={tilt}
              onMouseLeave={untilt}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{f.icon}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${f.tagColor}`}>{f.tag}</span>
              </div>
              <h3 className="text-base font-bold text-[#F1F5F9] mb-2">{f.title}</h3>
              <p className="text-sm text-[#7B8DB4] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center mt-8">
          <Link href="/pricing" className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors font-semibold">
            See full feature list →
          </Link>
        </div>
      </section>

      {/* ══ TRUST BAR / TESTIMONIALS ══ */}
      <section className="border-y border-[#13112A] bg-[#080614]/60 py-12 px-6 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-[10px] uppercase tracking-[0.2em] text-[#2D3A52] font-bold mb-1">What traders are saying</p>
          <p className="text-center text-[10px] text-[#4B5675] mb-8">Representative quotes from early users · not independently verified</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { quote: "The morning briefing alone is worth it. I know exactly what to watch before the open.", name: "Austin L.", role: "Swing trader" },
              { quote: "Finally an app that explains WHY it's a BUY — not just a candle pattern. The AI reasoning is solid.", name: "rangepk3r", role: "Community admin" },
              { quote: "Deep analysis used to take me 45 min every morning. Traxora does it in seconds.", name: "Marcus D.", role: "Day trader" },
            ].map((t, i) => (
              <div key={i} className={`${i === 0 ? "reveal-left" : i === 2 ? "reveal-right" : "reveal"} bg-[#0D0B1A] border border-[#1C1933] rounded-2xl p-5 space-y-3`}>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <svg key={j} width="12" height="12" viewBox="0 0 24 24" fill="#F59E0B"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  ))}
                </div>
                <p className="text-[13px] text-[#94A3B8] leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <div>
                  <p className="text-xs font-bold text-[#E2E8F0]">{t.name}</p>
                  <p className="text-[10px] text-[#4B5675]">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PRICING SPOTLIGHT ══ */}
      <section className="px-6 sm:px-8 py-24 max-w-4xl mx-auto w-full">
        <div className="text-center mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-rose-400 mb-3">Honest pricing</p>
          <h2 className="text-4xl font-black tracking-tight mb-3">
            Other tools charge{" "}
            <span className="line-through text-[#4B5675]">$29–$118/mo</span>.<br />
            <span className="text-emerald-400">Traxora is $5/mo.</span>
          </h2>
          <p className="text-[#7B8DB4] text-sm max-w-sm mx-auto">Full institutional-grade analysis. No feature limits behind paywalls. Cancel anytime.</p>
        </div>

        <div className="reveal-scale pricing-glow-border bg-[#13112A] border-2 border-emerald-500/30 rounded-3xl overflow-hidden relative">
          <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent" />
          <div className="absolute inset-0 bg-emerald-500/[0.02] pointer-events-none" />

          <div className="px-8 pt-8 pb-6 border-b border-[#252345] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Pro Plan</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">Most popular</span>
              </div>
              <p className="text-4xl font-black">$5<span className="text-lg font-normal text-[#4B5675]">/mo</span></p>
              <p className="text-xs text-[#4B5675] mt-1">Billed monthly · cancel anytime · no hidden fees</p>
            </div>
            <button type="button" onMouseDown={ripple} onClick={handleLaunch}
              className="btn-shimmer ripple-container shrink-0 bg-emerald-600 hover:bg-emerald-500 transition-all px-8 py-3.5 rounded-xl text-sm font-bold shadow-xl shadow-emerald-500/25 hover:scale-105 active:scale-95">
              {session ? "Open Dashboard →" : "Get Started — $5/mo →"}
            </button>
          </div>

          <div className="px-8 py-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              "Everything in Free tier",
              "Unlimited deep AI analysis per signal",
              "Morning briefing email at 8:30am ET",
              "Live market scanner — top options plays",
              "Wheeling Hub CSP scanner with live IV data",
              "Options analysis with expected move & Greeks",
              "AI trade journal — auto-written after every trade",
              "AI coaching after every 10 closed trades",
              "Signal Track Record — T+3 win-rate backtest",
              "Risk Guard — automatic stop monitoring",
              "Futures signals — ES, NQ, GC, CL + more",
              "Priority signal alerts via browser notifications",
            ].map(f => (
              <div key={f} className="flex items-center gap-2 text-sm text-[#CBD5E1] py-1">
                <span className="text-emerald-400 font-bold text-xs shrink-0">✓</span>
                {f}
              </div>
            ))}
          </div>

          <div className="px-8 pb-8 text-center">
            <p className="text-[10px] text-[#4B5675]">
              Secure checkout via Ko-fi · Access activates instantly after payment
            </p>
          </div>
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
                <strong className="text-[#F1F5F9]">Smart Money methodology</strong> — the framework institutional traders use.
              </p>
              <p>
                Enter any ticker. Claude Sonnet 4.6 checks 6 Smart Money concepts and returns a clear{" "}
                <span className="text-emerald-400 font-semibold">BUY</span>,{" "}
                <span className="text-amber-400 font-semibold">HOLD</span>, or{" "}
                <span className="text-rose-400 font-semibold">SELL</span>{" "}
                in seconds.
              </p>
            </div>
            <div className="flex items-center gap-4 mt-8">
              <button type="button" onClick={handleLaunch} className="bg-emerald-600 hover:bg-emerald-500 transition-colors px-5 py-2.5 rounded-xl text-sm font-bold">
                {session ? "Open Dashboard →" : "Get Started →"}
              </button>
              <Link href="/guide" className="text-sm text-[#7B8DB4] hover:text-[#F1F5F9] transition-colors underline underline-offset-4 decoration-[#333368]">
                Read the Guide →
              </Link>
            </div>
          </div>

          <div className="lg:w-[45%] grid grid-cols-2 gap-3">
            {[
              { value:"6",          label:"Smart Money concepts analyzed on every ticker",              color:"text-emerald-400",  glow:"shadow-emerald-500/20", delay:"" },
              { value:"20+",        label:"Stocks and futures tracked live on your dashboard",         color:"text-cyan-400",    glow:"shadow-cyan-500/20",   delay:"reveal-d1" },
              { value:"Sonnet 4.6", label:"Anthropic's most capable AI model powers every signal",     color:"text-teal-400",    glow:"shadow-teal-500/20",   delay:"reveal-d2" },
              { value:"Real-time",  label:"Push alerts when signals fire during Kill Zones",           color:"text-emerald-400", glow:"shadow-emerald-500/20", delay:"reveal-d2" },
              { value:"$10K",       label:"Trade simulator — practice risk-free before going live",    color:"text-amber-400",   glow:"shadow-amber-500/20",  delay:"reveal-d3" },
              { value:"8:30am",     label:"AI morning brief lands in your inbox before the open",     color:"text-rose-400",    glow:"shadow-rose-500/20",   delay:"reveal-d3" },
            ].map((s) => (
              <div key={s.label} className={`reveal-scale ${s.delay} tilt-card card-glow gradient-border-card glass surface-sheen border border-[#252345] rounded-2xl p-4 hover:border-[#333368]`} onMouseMove={tilt} onMouseLeave={untilt}>
                <p className={`text-2xl font-black mb-1 ${s.color}`}>{s.value}</p>
                <p className="text-xs text-[#4B5675] leading-relaxed">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ HOW TO USE IT ══ */}
      <section className="px-6 sm:px-8 py-12 max-w-6xl mx-auto w-full space-y-10">
        <div className="text-center mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400 mb-2">How it works</p>
          <h2 className="text-2xl font-black tracking-tight">Two steps to your next trade</h2>
        </div>

        {/* Step 1 */}
        <div className="flex flex-col md:flex-row gap-8 items-center">
          <div className="md:w-1/2">
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2">Step 01 · Pick Your Market</p>
            <h3 className="text-xl font-black mb-2">Search any stock or futures ticker</h3>
            <p className="text-sm text-[#7B8DB4] leading-relaxed">
              Type <strong className="text-[#F1F5F9]">AAPL, NVDA, ES, GC</strong> — or browse the live watchlist on the Dashboard. Color-coded signals update in real time.
            </p>
          </div>
          <div className="md:w-1/2 bg-[#13112A]/80 border border-[#252345] rounded-2xl p-4">
            <p className="text-[10px] text-[#4B5675] mb-2 uppercase tracking-widest font-semibold">Live Watchlist</p>
            <div className="space-y-1.5">
              {[
                { sym:"NVDA", name:"NVIDIA Corp.",   price:"$134.50", chg:"+2.4%", sig:"BUY",  sc:"text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                { sym:"AAPL", name:"Apple Inc.",     price:"$189.20", chg:"-0.8%", sig:"HOLD", sc:"text-amber-400 bg-amber-500/10 border-amber-500/20"   },
                { sym:"ES",   name:"E-mini S&P 500", price:"$5,920",  chg:"+0.6%", sig:"BUY",  sc:"text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                { sym:"GC",   name:"Gold Futures",   price:"$2,340",  chg:"+1.1%", sig:"BUY",  sc:"text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                { sym:"TSLA", name:"Tesla Inc.",     price:"$178.40", chg:"-3.2%", sig:"SELL", sc:"text-rose-400 bg-rose-500/10 border-rose-500/20"       },
              ].map((r) => (
                <div key={r.sym} className="flex items-center justify-between border-l-2 border-[#252345] pl-3 py-0.5 hover:border-emerald-500/40 transition-colors">
                  <div>
                    <p className="text-xs font-bold text-[#F1F5F9]">{r.sym}</p>
                    <p className="text-[10px] text-[#4B5675]">{r.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
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
        <div className="flex flex-col md:flex-row-reverse gap-8 items-center">
          <div className="md:w-1/2">
            <p className="text-[10px] font-bold text-teal-400 uppercase tracking-widest mb-2">Step 02 · Read Your Signal</p>
            <h3 className="text-xl font-black mb-2">One tap — BUY, HOLD, or SELL</h3>
            <p className="text-sm text-[#7B8DB4] leading-relaxed">
              Tap <strong className="text-[#F1F5F9]">Analyze</strong>. The AI checks Order Blocks, FVGs, liquidity sweeps, and Kill Zone timing, then gives you a clear verdict with the reasoning.
            </p>
          </div>
          <div className="md:w-1/2">
            <div className={`bg-[#13112A]/80 border ${sigBorder} rounded-2xl overflow-hidden transition-all duration-350 shadow-xl`} style={{ opacity: signalFade ? 1 : 0 }}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#252345]">
                <div>
                  <p className="font-bold text-[#F1F5F9]">{signal.sym}.US</p>
                  <p className="text-xs text-[#4B5675]">{signal.name}</p>
                </div>
                <span className={`text-sm font-black px-3 py-1.5 rounded-lg border ${sigColor}`}>{signal.sig}</span>
              </div>
              <div className="px-5 py-3 flex flex-wrap gap-2 border-b border-[#252345]">
                {[
                  { l:"Price",      v:livePrices[signal.sym]?.price ?? signal.price,                    c:"text-[#F1F5F9] bg-[#1A1838] border-[#252345]"              },
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
      </section>

      {/* ══ COMPETITOR COMPARISON ══ */}
      <section className="px-6 sm:px-8 py-24 max-w-5xl mx-auto w-full">
        <div className="text-center mb-12">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-rose-400 mb-3">Feature for feature</p>
          <h2 className="text-3xl font-black tracking-tight">No competitor offers this.<br />At any price.</h2>
          <p className="text-[#7B8DB4] text-sm mt-3 max-w-md mx-auto">Smart Money methodology + Claude Sonnet 4.6 + $5/mo. None of them have all three.</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-[#252345]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#252345]">
                <th className="text-left py-4 pl-5 pr-6 text-[#4B5675] text-xs uppercase tracking-widest font-semibold">Feature</th>
                {[
                  { name:"Traxora",     price:"$5/mo",   highlight:true  },
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
                { feature:"Smart Money signals", traxora:true,  ti:false, ss:false, ts:false },
                { feature:"Claude Sonnet 4.6 AI",      traxora:true,  ti:false, ss:false, ts:false },
                { feature:"Live BUY/SELL signals",   traxora:true,  ti:true,  ss:true,  ts:true  },
                { feature:"Trade simulator",          traxora:true,  ti:false, ss:false, ts:true  },
                { feature:"Push notifications",      traxora:true,  ti:false, ss:true,  ts:false },
                { feature:"Morning briefing AI",     traxora:true,  ti:false, ss:false, ts:false },
                { feature:"Fraction of the price",   traxora:true,  ti:false, ss:false, ts:false },
              ].map((row, i) => (
                <tr key={row.feature} className={`border-b border-[#252345] last:border-0 ${i % 2 === 0 ? "" : "bg-[#13112A]/40"}`}>
                  <td className="py-3.5 pl-5 pr-6 text-[#CBD5E1] text-xs">{row.feature}</td>
                  {[
                    { val:row.traxora, highlight:true  },
                    { val:row.ti,      highlight:false },
                    { val:row.ss,      highlight:false },
                    { val:row.ts,      highlight:false },
                  ].map((cell, ci) => (
                    <td key={ci} className={`py-3.5 px-4 text-center text-base ${cell.highlight ? "bg-emerald-600/10 border-x border-emerald-500/20" : ""}`}>
                      {cell.val ? <span className="text-emerald-400 font-bold">✓</span> : <span className="text-[#333368]">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-center mt-10">
          <button type="button" onMouseDown={ripple} onClick={handleLaunch} className="btn-shimmer ripple-container bg-emerald-600 hover:bg-emerald-500 transition-all px-10 py-4 rounded-xl font-bold text-sm shadow-xl shadow-emerald-500/20 hover:scale-105 active:scale-95 inline-block">
            {session ? "Open Dashboard →" : "Get Started — Sign in with Google →"}
          </button>
        </div>
      </section>

      {/* ══ FAQ ══ */}
      <section className="px-6 sm:px-8 py-20 max-w-3xl mx-auto w-full">
        <div className="text-center mb-12">
          <p className="reveal text-[11px] font-semibold uppercase tracking-widest text-emerald-400 mb-3">Common Questions</p>
          <h2 className="reveal reveal-d1 text-3xl font-black tracking-tight">Got questions? We&apos;ve got answers.</h2>
        </div>
        <div className="space-y-3">
          <div className="reveal reveal-d2">
            <FAQItem
              q="Do I need trading experience to use Traxora?"
              a="No. Every signal includes plain-English reasoning — what the Order Block means, why this is a Kill Zone, what the entry level represents. Beginners learn faster; experienced traders get confirmation they trust."
            />
          </div>
          <div className="reveal reveal-d2">
            <FAQItem
              q="What exactly does the AI analyze?"
              a="Six Smart Money concepts per ticker: Order Blocks, Fair Value Gaps, Liquidity Sweeps, Market Structure Shifts, Optimal Trade Entry zones, and Kill Zone timing. These are synthesized into a single BUY / HOLD / SELL verdict with a specific entry zone, stop-loss, and price target."
            />
          </div>
          <div className="reveal reveal-d3">
            <FAQItem
              q="Can I cancel my Pro subscription anytime?"
              a="Yes — cancel from your Settings page with one click. No contracts, no retention flows, no fine print. You keep access through the end of your current billing period."
            />
          </div>
          <div className="reveal reveal-d3">
            <FAQItem
              q="How fast does Pro access activate after payment?"
              a="Instantly. The moment your Ko-fi payment confirms, your account upgrades. Refresh the app and all Pro features are available — no waiting, no manual review."
            />
          </div>
          <div className="reveal reveal-d4">
            <FAQItem
              q="Is Traxora financial advice?"
              a="No. Traxora is an educational and research tool. All signals are generated by AI analyzing public market data using Smart Money methodology. Always do your own research and consult a licensed advisor before making any investment decision."
            />
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ══ */}
      <section className="relative px-6 sm:px-8 py-28 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[300px] bg-emerald-600/8 rounded-full blur-3xl animate-pulse" />
        </div>
        <div className="relative z-10 max-w-xl mx-auto text-center">
          <div className="badge-pulse inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-xs text-amber-400 font-bold mb-6">
            🔐 Early access pricing — $5/mo locked in forever
          </div>
          <h2 className="reveal text-4xl font-black tracking-tight mb-4">
            Ready to read the market<br />like smart money?
          </h2>
          <p className="reveal reveal-d1 text-[#7B8DB4] text-base leading-relaxed mb-4">
            Smart money signals, morning briefing, options analysis, real position insights — all for $5/mo.
          </p>
          <p className="reveal reveal-d2 text-xs text-[#4B5675] mb-10">No credit card to start · Cancel from Settings anytime · Access activates instantly</p>
          <div className="reveal reveal-d3 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button type="button" onMouseDown={ripple} onClick={handleLaunch} className="btn-shimmer ripple-container btn-cta-glow bg-emerald-600 hover:bg-emerald-500 transition-all px-10 py-4 rounded-xl font-bold text-sm shadow-2xl shadow-emerald-500/25 hover:scale-105 active:scale-95">
              {session ? "Open Dashboard →" : "Start Trading — $5/mo →"}
            </button>
            <Link href="/pricing" className="text-sm text-[#7B8DB4] hover:text-[#F1F5F9] transition-colors">
              See full pricing →
            </Link>
          </div>
        </div>
      </section>

      {/* ══ STICKY CTA BAR ══ */}
      {showSticky && !session && (
        <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
          <div className="bg-[#0D0B1A]/96 backdrop-blur-xl border-t border-[#252345] px-5 py-3.5 shadow-2xl shadow-black/60">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
              <div className="hidden sm:block">
                <p className="text-sm font-bold text-[#F1F5F9]">Traxora AI — Smart Money Signals</p>
                <p className="text-xs text-[#4B5675] mt-0.5">$5/mo · Cancel anytime</p>
              </div>
              <div className="flex items-center gap-3 ml-auto sm:ml-0">
                <div className="flex items-center gap-1.5 text-xs text-[#4B5675] hidden sm:flex">
                  <span className="text-emerald-400">✓</span> 500+ traders
                  <span className="ml-2 text-emerald-400">✓</span> Instant access
                </div>
                <button
                  type="button"
                  onClick={handleLaunch}
                  className="bg-emerald-600 hover:bg-emerald-500 transition-all px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/25 hover:scale-105 active:scale-95 shrink-0 whitespace-nowrap"
                >
                  Get Started — $5/mo →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ FOOTER ══ */}
      <footer className="border-t border-[#252345] px-6 sm:px-8 py-6 flex items-center justify-between gap-4 flex-wrap bg-[#0D0B1A]/60">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
              </svg>
            </div>
            <span className="text-xs font-bold text-[#F1F5F9]">Traxora AI</span>
          </div>
          <p className="text-[11px] text-[#4B5675]">© 2026 Traxora · Not financial advice · For educational use only</p>
        </div>
        <div className="flex gap-6 flex-wrap">
          <Link href="/dashboard"   className="text-xs text-[#4B5675] hover:text-[#7B8DB4] transition-colors">Dashboard</Link>
          <Link href="/intelligence" className="text-xs text-[#4B5675] hover:text-[#7B8DB4] transition-colors">Scanner</Link>
          <Link href="/analysis"    className="text-xs text-[#4B5675] hover:text-[#7B8DB4] transition-colors">Signals</Link>
          <Link href="/pricing"     className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors font-semibold">Pricing</Link>
          <Link href="/guide"       className="text-xs text-[#4B5675] hover:text-[#7B8DB4] transition-colors">Guide</Link>
          <Link href="/privacy"     className="text-xs text-[#4B5675] hover:text-[#7B8DB4] transition-colors">Privacy</Link>
          <Link href="/terms"       className="text-xs text-[#4B5675] hover:text-[#7B8DB4] transition-colors">Terms</Link>
        </div>
      </footer>
    </div>
  );
}
