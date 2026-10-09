"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// Landing-page motion pieces (styles in app/landing.css). Under Reduce Motion
// they keep fades and highlights but drop movement (slides, zoom, 3D travel).

const RM = "(prefers-reduced-motion: reduce)";
function subscribeRM(cb: () => void) {
  const m = window.matchMedia(RM);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
export function useReducedMotion() {
  return useSyncExternalStore(subscribeRM, () => window.matchMedia(RM).matches, () => false);
}

/** Fades and lifts its children in the first time they scroll into view. */
export function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: "0px 0px -10% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`lp-reveal ${shown ? "is-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* ── Hero media: three looping market "scenes" with boxes that draw themselves ── */

function seeded(n: number, seed: number) {
  let s = seed;
  return Array.from({ length: n }, () => { s = (s * 9301 + 49297) % 233280; return s / 233280; });
}

const LINE = (() => {
  const r = seeded(60, 7);
  let y = 380;
  return r.map((v, i) => { y = Math.max(170, Math.min(470, y + (v - 0.47) * 46 - 1.6)); return `${i * 20.5},${y.toFixed(1)}`; }).join(" ");
})();

const CANDLES = (() => {
  const r = seeded(84, 21);
  let c = 360;
  return Array.from({ length: 28 }, (_, i) => {
    const o = c; c = Math.max(170, Math.min(430, c + (r[i * 3] - 0.5) * 60));
    const hi = Math.min(o, c) - r[i * 3 + 1] * 30, lo = Math.max(o, c) + r[i * 3 + 2] * 30;
    return { x: 60 + i * 40, o, c, hi, lo, vol: 20 + r[i * 3 + 1] * 70 };
  });
})();

function Anno({ x, y, w, h, label, center = false }: { x: number; y: number; w: number; h: number; label: string; center?: boolean }) {
  const lw = label.length * 9.6 + 28;
  return (
    <g className="lp-anno">
      <rect className="lp-draw" x={x} y={y} width={w} height={h} rx="6" fill="rgb(255 255 255 / 0.04)" stroke="#FAFAFA" strokeWidth="1.5" pathLength={100} />
      {[[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([cx, cy], i) => <rect key={i} x={cx - 4} y={cy - 4} width="8" height="8" fill="#FAFAFA" />)}
      <g transform={`translate(${center ? x + w / 2 - lw / 2 : x}, ${y - 34})`}>
        <rect width={lw} height="26" rx="4" fill="#FAFAFA" />
        <text x="14" y="17.5" fontSize="14" fill="#000" fontFamily="var(--font-mono-custom), ui-monospace, monospace">{label}</text>
      </g>
    </g>
  );
}

export function HeroMedia() {
  return (
    <svg viewBox="0 0 1200 640" preserveAspectRatio="xMidYMid slice" className="lp-hero-media absolute inset-0 w-full h-full" aria-hidden="true">
      <defs>
        <pattern id="lp-g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="rgb(255 255 255 / 0.06)" /></pattern>
      </defs>
      <rect width="1200" height="640" fill="#050505" />
      <rect width="1200" height="640" fill="url(#lp-g)" />

      {/* Scene 1 — prices */}
      <g className="lp-scene" style={{ animationDelay: "0s" }}>
        <g className="lp-zoom" style={{ animationDelay: "0s" }}>
          <polyline className="lp-draw lp-draw-line" points={LINE} fill="none" stroke="#D9D9D9" strokeWidth="2.2" strokeLinejoin="round" pathLength={100} style={{ animationDelay: "0s" }} />
          <line x1="0" y1="200" x2="1200" y2="200" stroke="rgb(255 255 255 / 0.18)" strokeDasharray="6 8" />
          <line x1="0" y1="450" x2="1200" y2="450" stroke="rgb(255 255 255 / 0.18)" strokeDasharray="6 8" />
          <Anno x={640} y={140} w={300} h={190} label="Prices are recent ✓" />
        </g>
      </g>

      {/* Scene 2 — candles + volume */}
      <g className="lp-scene" style={{ animationDelay: "5s" }}>
        <g className="lp-zoom" style={{ animationDelay: "5s" }}>
          {CANDLES.map(k => (
            <g key={k.x}>
              <line x1={k.x} y1={k.hi} x2={k.x} y2={k.lo} stroke="rgb(255 255 255 / 0.5)" />
              <rect x={k.x - 11} y={Math.min(k.o, k.c)} width="22" height={Math.max(3, Math.abs(k.c - k.o))} fill={k.c < k.o ? "#E5E5E5" : "#3A3A3A"} stroke="#E5E5E5" strokeWidth="1" />
              <rect x={k.x - 11} y={600 - k.vol} width="22" height={k.vol} fill="rgb(255 255 255 / 0.18)" />
            </g>
          ))}
          <Anno x={140} y={490} w={920} h={120} label="Enough people trading ✓" center />
        </g>
      </g>

      {/* Scene 3 — option rows */}
      <g className="lp-scene" style={{ animationDelay: "10s" }}>
        <g className="lp-zoom" style={{ animationDelay: "10s" }}>
          {Array.from({ length: 11 }, (_, i) => (
            <g key={i} transform={`translate(80, ${70 + i * 48})`}>
              <rect width="1040" height="38" rx="4" fill={i === 6 ? "rgb(255 255 255 / 0.08)" : "rgb(255 255 255 / 0.03)"} />
              {[0, 1, 2, 3, 4].map(c => (
                <rect key={c} x={24 + c * 210} y="14" width={[70, 110, 60, 90, 50][(c + i) % 5]} height="10" rx="2" fill={`rgb(255 255 255 / ${c === 2 ? 0.55 : 0.22})`} />
              ))}
            </g>
          ))}
          <Anno x={70} y={352} w={1060} h={58} label="Prices too far apart — wait" center />
        </g>
      </g>

      <rect className="lp-sweep" x="0" y="0" width="1200" height="2" fill="rgb(255 255 255 / 0.35)" />
    </svg>
  );
}

/* ── Sticky 3D layer stack: panels fan out as you scroll, one step at a time ── */

export type StackStep = { label: string; title: string; text: string; panel: React.ReactNode };

export function LayerStack({ steps }: { steps: StackStep[] }) {
  const reduce = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let raf = 0;
    const n = steps.length;
    const update = () => {
      raf = 0;
      const el = section.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
      const t = Math.min(1, p / 0.22);
      // Reduce Motion: panels sit already fanned out; only the highlight changes.
      const spread = reduce ? 1 : t * t * (3 - 2 * t);
      const step = p < 0.22 ? 0 : Math.min(n - 1, Math.floor(((p - 0.22) / 0.78) * n));
      const k = Math.min(1, window.innerWidth / 1000);
      panels.current.forEach((pn, i) => {
        if (!pn) return;
        const o = i - (n - 1) / 2;
        const lift = i === step && !reduce ? spread : 0;
        pn.style.transform =
          `translate(-50%, -50%) translate3d(${o * 120 * spread * k}px, ${o * -46 * spread - lift * 26}px, ${o * 150 * spread + lift * 90}px) ` +
          `rotateX(${14 - 6 * spread}deg) rotateY(${-32 + 12 * spread}deg)`;
        pn.style.opacity = String(spread < 0.5 ? 1 : i === step ? 1 : 0.38);
        pn.style.zIndex = String(i === step ? 10 : i);
      });
      setActive(a => (a === step ? a : step));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, [reduce, steps.length]);

  return (
    <section id="how" ref={section} className="lp-dark relative bg-[var(--mx-canvas)] text-[var(--mx-text)] scroll-mt-0" style={{ height: `${100 + steps.length * 70}vh` }}>
      <div className="sticky top-0 h-screen overflow-hidden flex flex-col">
        <div className="relative flex-1 min-h-0 mt-16 lp-stage" aria-hidden="true">
          {steps.map((s, i) => (
            <div key={s.label} ref={el => { panels.current[i] = el; }} className="lp-glass lp-panel absolute left-1/2 top-1/2 w-[min(500px,72vw,calc((100svh-360px)*1.45))] min-w-[240px] aspect-[16/10] rounded-[14px] p-4 sm:p-5 overflow-hidden">
              <p className="mx-label mb-3">{s.label}</p>
              {s.panel}
            </div>
          ))}
        </div>
        <div className="relative shrink-0 h-[260px] sm:h-[280px] px-4 text-center">
          {steps.map((s, i) => (
            <div key={s.label} className={`absolute inset-x-4 top-0 transition-all duration-500 ${active === i ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"}`} aria-hidden={active !== i}>
              <p className="mx-label inline-flex items-center gap-2"><span aria-hidden="true">◥</span>{s.label}</p>
              <p className="mt-4 mx-auto text-[30px] sm:text-[44px] leading-[1.05] tracking-[-0.035em] max-w-[18ch]" style={{ fontWeight: 450 }}>{s.title}</p>
              <p className="mt-4 mx-auto text-[15px] sm:text-[16px] leading-relaxed text-[var(--mx-text-2)] max-w-[46ch]">{s.text}</p>
            </div>
          ))}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2" aria-hidden="true">
            {steps.map((s, i) => <span key={s.label} className={`h-1 rounded-full transition-all duration-300 ${active === i ? "w-8 bg-[var(--mx-text)]" : "w-3 bg-[var(--mx-line-strong)]"}`} />)}
          </div>
        </div>
      </div>
    </section>
  );
}
