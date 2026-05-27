"use client";

import { useEffect, useState } from "react";

type Sparkle = {
  id: number;
  top: string;
  left: string;
  size: number;
  duration: string;
  delay: string;
  color: string;
};

const COLORS = ["#6366F1", "#818CF8", "#C4B5FD", "#FFFFFF", "#A5B4FC", "#E0E7FF"];

export default function SparkleBackground({
  count = 50,
  opacity = 0.2,
}: {
  count?: number;
  opacity?: number;
}) {
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);

  useEffect(() => {
    setSparkles(
      Array.from({ length: count }, (_, i) => ({
        id:       i,
        top:      `${(i * 137.5) % 100}%`,
        left:     `${(i * 97.3 + 13) % 100}%`,
        size:     1.2 + (i % 4) * 0.7,
        duration: `${2.8 + (i % 6) * 0.5}s`,
        delay:    `${(i * 0.27) % 4.5}s`,
        color:    COLORS[i % COLORS.length],
      }))
    );
  }, [count]);

  const css = sparkles
    .map(
      (s) =>
        `.sp${s.id}{top:${s.top};left:${s.left};width:${s.size}px;height:${s.size}px;` +
        `background-color:${s.color};` +
        `box-shadow:0 0 ${+(s.size * 4).toFixed(1)}px ${+(s.size * 1.5).toFixed(1)}px ${s.color}70;` +
        `--sparkle-duration:${s.duration};--sparkle-delay:${s.delay};opacity:${opacity}}`
    )
    .join("");

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {sparkles.map((s) => (
        <span key={s.id} className={`absolute rounded-full animate-sparkle sp${s.id}`} />
      ))}
    </div>
  );
}
