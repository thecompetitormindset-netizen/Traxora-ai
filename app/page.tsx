"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";



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

  const [livePrices, setLivePrices] = useState<Record<string, LivePrice>>({});

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
    fetch("/api/market/tickers")
      .then(r => r.json())
      .then((data: Record<string, LivePrice>) => setLivePrices(data))
      .catch(() => {});
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

  function handleSpot(e: React.MouseEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setSpotX(((e.clientX - r.left) / r.width) * 100);
    setSpotY(((e.clientY - r.top) / r.height) * 100);
  }

  const signal = LIVE_SIGNALS[signalIdx];
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

      {/* ══ FEATURE STRIP ══ */}
      <section className="px-6 sm:px-8 py-12 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon:"⚡", title:"BUY / HOLD / SELL signals", desc:"Enter any ticker. Claude AI checks 6 Smart Money concepts and returns a clear verdict with entry, stop, and target in seconds." },
            { icon:"🌅", title:"Daily morning briefing",    desc:"Full AI market brief at 8:30am ET — macro regime, top options plays, futures setups, VIX context, and the day's key levels." },
            { icon:"📡", title:"Deep market scanner",       desc:"Scan 50+ tickers at once. Ranked by smart money conviction score — highest-probability setups rise to the top automatically." },
          ].map(f => (
            <div key={f.title} className="reveal bg-[#13112A] border border-[#252345] rounded-2xl p-6 hover:border-[#333368] transition-colors">
              <span className="text-2xl mb-3 block">{f.icon}</span>
              <h3 className="font-bold text-[#F1F5F9] mb-2">{f.title}</h3>
              <p className="text-sm text-[#7B8DB4] leading-relaxed">{f.desc}</p>
            </div>
          ))}
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
              "Unlimited AI analysis — every signal",
              "Morning briefing email at 8:30am ET",
              "Deep market scanner — 50+ tickers",
              "Options analysis with Greeks & IV context",
              "AI trade journal + coaching",
              "Futures signals — ES, NQ, GC, CL + more",
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
