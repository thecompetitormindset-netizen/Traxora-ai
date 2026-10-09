"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type TourStep = {
  // CSS selector; may list alternatives ("[data-tour=a], [data-tour=b]").
  // The first *visible* match is used, so one step can point at the desktop
  // sidebar or the mobile tab bar, whichever is on screen.
  selector: string;
  title: string;
  desc: string;
};

type Rect = { left: number; top: number; width: number; height: number };

const PAD = 6;
const GAP = 12;
const EDGE = 12;

function visibleTarget(selector: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none") return el;
  }
  return null;
}

function bottomInset(): number {
  // Leave room for the mobile tab bar when it is on screen.
  const bar = document.querySelector<HTMLElement>(".sidebar-mobile");
  if (!bar || getComputedStyle(bar).display === "none") return 0;
  return bar.getBoundingClientRect().height;
}

// Points at real controls on the page. Works the same on phones and desktop:
// it uses whichever target is visible, keeps the explanation card inside the
// viewport (and above the mobile tab bar), restarts from step 1 every time,
// and can be driven from the keyboard (→ / Enter next, ← back, Esc to close).
export default function ProductTour({ steps, active, onFinish }: {
  steps: TourStep[];
  active: boolean;
  onFinish: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null);
  const [usable, setUsable] = useState<TourStep[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);

  // Each run starts from the first step, with steps whose target exists now.
  useEffect(() => {
    if (!active) return;
    let tries = 0;
    let cancelled = false;
    function collect() {
      if (cancelled) return;
      const found = steps.filter(s => visibleTarget(s.selector));
      // Give late-loading content a moment, then go with what is there.
      if (found.length < steps.length && tries++ < 10) { window.setTimeout(collect, 200); return; }
      if (found.length === 0) { onFinish(); return; }
      setUsable(found);
      setIdx(0);
    }
    collect();
    return () => { cancelled = true; setUsable([]); setRect(null); setCardPos(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const step = usable[idx];

  const place = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight - bottomInset();
    // Clamp the spotlight to the viewport so tall sections still read well.
    const top = Math.max(r.top, 4), bottom = Math.min(r.bottom, vh - 4);
    const spot = { left: Math.max(r.left, 4), top, width: Math.min(r.right, vw - 4) - Math.max(r.left, 4), height: Math.max(bottom - top, 24) };
    setRect(spot);

    const card = cardRef.current;
    const cw = card?.offsetWidth ?? Math.min(320, vw - EDGE * 2);
    const ch = card?.offsetHeight ?? 160;
    let left = Math.min(Math.max(spot.left, EDGE), vw - cw - EDGE);
    let cTop: number;
    if (spot.top + spot.height + PAD + GAP + ch <= vh - EDGE) cTop = spot.top + spot.height + PAD + GAP;      // below
    else if (spot.top - PAD - GAP - ch >= EDGE) cTop = spot.top - PAD - GAP - ch;                           // above
    else { cTop = vh - ch - EDGE; left = Math.max(EDGE, (vw - cw) / 2); }                                     // pinned bottom
    setCardPos({ left, top: cTop });
  }, []);

  // Locate, scroll to and measure the current step's target.
  useEffect(() => {
    if (!active || !step) return;
    const el = visibleTarget(step.selector);
    if (!el) {
      // Target vanished since collection — move on.
      const t = window.setTimeout(() => { if (idx < usable.length - 1) setIdx(i => i + 1); else onFinish(); }, 0);
      return () => window.clearTimeout(t);
    }
    targetRef.current = el;
    const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6;
    el.scrollIntoView({ block: tall ? "start" : "center", behavior: "instant" as ScrollBehavior });
    const id = requestAnimationFrame(() => requestAnimationFrame(place));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step, idx]);

  // Re-measure once the card has rendered (its height decides above/below).
  const measured = rect !== null;
  useLayoutEffect(() => { if (active && measured) place(); }, [active, idx, measured, place]);

  useEffect(() => {
    if (!active) return;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [active, place]);

  const next = useCallback(() => { if (idx < usable.length - 1) setIdx(i => i + 1); else onFinish(); }, [idx, usable.length, onFinish]);
  const back = useCallback(() => setIdx(i => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onFinish(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, next, back, onFinish]);

  // Keep focus on the card's main action so keyboard users can follow along.
  useEffect(() => { if (active && cardPos) nextRef.current?.focus({ preventScroll: true }); }, [active, idx, cardPos]);

  if (!active) return null;

  if (!step || !rect) {
    return (
      <div className="fixed inset-0 z-[var(--z-tour)] bg-black/50 grid place-items-center" role="status" aria-live="polite">
        <p className="text-[13px] text-white/80">Preparing the tour…</p>
      </div>
    );
  }

  const last = idx === usable.length - 1;
  return (
    <div className="fixed inset-0 z-[var(--z-tour)] pointer-events-none">
      {/* Dim everything except the target (box-shadow cut-out). */}
      <div
        className="fixed rounded-[10px] transition-[left,top,width,height] duration-200 motion-reduce:transition-none"
        style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.62)", outline: "2px solid var(--mx-text)", outlineOffset: 0 }}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-desc"
        className="fixed w-[320px] max-w-[calc(100vw-24px)] rounded-[12px] border border-[var(--mx-line-strong)] bg-[var(--mx-surface)] text-[var(--mx-text)] p-4 shadow-[var(--mx-shadow)] pointer-events-auto"
        style={cardPos ? { left: cardPos.left, top: cardPos.top } : { left: EDGE, bottom: EDGE, visibility: "hidden" }}
      >
        <p className="mx-label">Step {idx + 1} of {usable.length}</p>
        <h3 id="tour-title" className="mt-2 text-[16px] tracking-[-0.01em]" style={{ fontWeight: 500 }}>{step.title}</h3>
        <p id="tour-desc" className="mt-1 text-[14px] leading-snug text-[var(--mx-text-2)]">{step.desc}</p>
        <div className="mt-3 flex items-center gap-1" aria-hidden="true">
          {usable.map((_, i) => (
            <span key={i} className={`h-1 rounded-full ${i === idx ? "w-5 bg-[var(--mx-text)]" : "w-2 bg-[var(--mx-line-strong)]"}`} />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={onFinish} className="h-9 px-2 text-[13px] text-[var(--mx-text-3)] hover:text-[var(--mx-text)]">
            Skip
          </button>
          <div className="flex items-center gap-2">
            {idx > 0 && (
              <button type="button" onClick={back} className="h-9 px-3 rounded-[8px] border border-[var(--mx-line-strong)] text-[13px] hover:border-[var(--mx-control)]">
                Back
              </button>
            )}
            <button ref={nextRef} type="button" onClick={next} className="h-9 px-4 rounded-[8px] bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[13px]">
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
        <p className="mt-3 text-[11.5px] text-[var(--mx-text-3)] hidden sm:block">Use ← → to move, Esc to close.</p>
      </div>
    </div>
  );
}
