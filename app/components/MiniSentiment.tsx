"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function MiniSentiment() {
  const [score,  setScore]  = useState<number | null>(null);
  const [regime, setRegime] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sentiment")
      .then(r => r.json())
      .then(d => {
        if (!d?.error) {
          setScore(d.overallScore ?? null);
          setRegime(d.regime ?? null);
        }
      })
      .catch(() => {});
  }, []);

  if (score === null) return null;

  const clamp = Math.max(-100, Math.min(100, score));
  const pct   = (clamp + 100) / 200; // 0 → 1
  const color = clamp >= 30 ? "#10B981" : clamp >= -30 ? "#F59E0B" : "#EF4444";
  const label = clamp >= 30 ? "Bull" : clamp >= -30 ? "Neut" : "Bear";

  return (
    <Link
      href="/market-sentiment"
      title={`Market Pulse: ${score > 0 ? "+" : ""}${score} (${regime ?? label})`}
      className="fixed left-2 top-1/2 -translate-y-1/2 z-40 hidden xl:block group"
    >
      <div className="bg-[#0C1017]/90 border border-[#1C2333] group-hover:border-indigo-500/30 rounded-xl p-2.5 transition-all backdrop-blur-sm shadow-lg">
        {/* Score */}
        <p
          className="text-[9px] font-black font-mono tabular-nums text-center leading-none"
          style={{ color }}
        >
          {clamp > 0 ? "+" : ""}{clamp}
        </p>

        {/* Horizontal bar */}
        <div className="mt-1.5 w-14 h-2 bg-[#080E1B] rounded-full overflow-hidden border border-[#1C2333]/50 relative">
          {/* Gradient backdrop */}
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: "linear-gradient(90deg,#EF4444 0%,#F59E0B 50%,#10B981 100%)", opacity: 0.22 }}
          />
          {/* Zero tick */}
          <div className="absolute top-0 bottom-0 w-px bg-[#232F46]" style={{ left: "50%" }} />
          {/* Needle */}
          <div
            className="absolute top-0.5 bottom-0.5 w-1.5 rounded-full"
            style={{ left: `calc(${pct * 100}% - 3px)`, background: color, boxShadow: `0 0 4px ${color}` }}
          />
        </div>

        {/* Label */}
        <p className="text-[7px] text-[#4B5675] text-center mt-1 leading-none">{label}</p>
      </div>
    </Link>
  );
}
