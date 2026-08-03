"use client";

import { useEffect, useState } from "react";

export type TourStep = {
  selector: string; // e.g. '[data-tour="watchlist-edit-btn"]'
  title: string;
  desc: string;
};

type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

function measure(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

// Points at real, live buttons on the page (like a game's first-run tutorial) instead
// of describing them in a modal — a step is skipped if its target never appears (data
// still loading, or the gated content just isn't there today).
export default function ProductTour({
  steps,
  active,
  onFinish,
}: {
  steps: TourStep[];
  active: boolean;
  onFinish: () => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [searching, setSearching] = useState(true);

  const step = steps[stepIdx];

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let tries = 0;
    setSearching(true);
    setRect(null);

    function attempt() {
      if (cancelled) return;
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (el) {
        // Instant scroll + a couple of animation frames so the rect we measure
        // reflects the settled layout, not a mid-flight smooth-scroll position.
        el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (cancelled) return;
            setRect(measure(el));
            setSearching(false);
          });
        });
        return;
      }
      tries += 1;
      if (tries > 16) {
        // Give up on this step — skip straight to the next one.
        if (stepIdx < steps.length - 1) setStepIdx((i) => i + 1);
        else onFinish();
        return;
      }
      window.setTimeout(attempt, 200);
    }
    attempt();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIdx, step?.selector]);

  useEffect(() => {
    if (!active || searching) return;
    function reposition() {
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (el) setRect(measure(el));
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [active, searching, step?.selector]);

  if (!active) return null;

  function goNext() {
    if (stepIdx < steps.length - 1) setStepIdx((i) => i + 1);
    else onFinish();
  }
  function goBack() {
    if (stepIdx > 0) setStepIdx((i) => i - 1);
  }

  if (searching || !rect) {
    return (
      <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center pointer-events-none">
        <p className="text-xs text-[#7B8DB4]">Finding it…</p>
      </div>
    );
  }

  const pad = 6;
  const spotLeft = rect.left - pad;
  const spotTop = rect.top - pad;
  const spotW = rect.width + pad * 2;
  const spotH = rect.height + pad * 2;

  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const cardW = Math.min(300, viewportW - 24);
  const placeBelow = viewportH - rect.bottom > 170 || rect.top < 170;
  let cardLeft = rect.left;
  if (cardLeft + cardW > viewportW - 12) cardLeft = viewportW - cardW - 12;
  if (cardLeft < 12) cardLeft = 12;

  return (
    <div className="fixed inset-0 z-[300] pointer-events-none">
      {/* Dim everywhere except the spotlighted control — box-shadow spread creates the cutout */}
      <div
        className="fixed rounded-xl transition-all duration-300 pointer-events-none"
        style={{ left: spotLeft, top: spotTop, width: spotW, height: spotH, boxShadow: "0 0 0 9999px rgba(5,4,15,0.78)" }}
      />
      <div
        className="fixed rounded-xl ring-2 ring-emerald-400 pointer-events-none transition-all duration-300"
        style={{ left: spotLeft, top: spotTop, width: spotW, height: spotH }}
      />

      <div
        className="fixed w-[300px] max-w-[90vw] bg-[#0A0815] border border-emerald-500/30 rounded-2xl shadow-2xl shadow-black/60 p-4 pointer-events-auto"
        style={placeBelow ? { left: cardLeft, top: rect.bottom + 14 } : { left: cardLeft, bottom: viewportH - rect.top + 14 }}
      >
        <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest mb-1">Step {stepIdx + 1} of {steps.length}</p>
        <h3 className="text-sm font-bold text-[#F1F5F9] mb-1">{step.title}</h3>
        <p className="text-xs text-[#7B8DB4] leading-snug mb-3">{step.desc}</p>
        <div className="flex items-center justify-between">
          <button type="button" onClick={onFinish} className="text-[10px] text-[#4B5675] hover:text-[#94A3B8] transition-colors">
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button type="button" onClick={goBack} className="text-[10px] px-2.5 py-1.5 rounded-lg border border-[#252345] text-[#7B8DB4] hover:border-[#333368] transition-colors">
                Back
              </button>
            )}
            <button type="button" onClick={goNext} className="text-[10px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-colors">
              {stepIdx === steps.length - 1 ? "Done" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
