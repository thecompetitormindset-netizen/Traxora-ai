"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Star = {
  id: number;
  top: string;
  left: string;
  size: number;
  opacity: number;
};

const PUBLIC_ROUTES = new Set(["/", "/login"]);

export default function CosmicBackground() {
  const pathname = usePathname();
  const [stars, setStars] = useState<Star[]>([]);

  useEffect(() => {
    setStars(
      Array.from({ length: 180 }, (_, i) => ({
        id:      i,
        top:     `${(i * 137.508) % 100}%`,
        left:    `${(i * 97.3 + 23.7) % 100}%`,
        size:    i % 9 === 0 ? 2 : i % 4 === 0 ? 1.5 : 1,
        opacity: parseFloat((0.12 + (i % 7) * 0.055).toFixed(3)),
      }))
    );
  }, []);

  const css = stars
    .map(
      (s) =>
        `.st${s.id}{top:${s.top};left:${s.left};width:${s.size}px;height:${s.size}px;opacity:${s.opacity}}`
    )
    .join("");

  if (!PUBLIC_ROUTES.has(pathname ?? "")) return null;

  return (
    <div id="cosmic-bg" className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Base canvas */}
      <div className="absolute inset-0 bg-[#0D0B1A]" />

      {/* Nebula orb A — emerald, top-left */}
      <div className="absolute -top-40 -left-20 w-[700px] h-[500px] rounded-full bg-emerald-600/[0.09] blur-[160px] animate-float-a" />

      {/* Nebula orb B — teal, right */}
      <div className="absolute top-[40%] -right-32 w-[600px] h-[600px] rounded-full bg-teal-600/[0.07] blur-[140px] animate-float-b" />

      {/* Nebula orb C — cyan, bottom-center */}
      <div className="absolute -bottom-32 left-[30%] w-[500px] h-[400px] rounded-full bg-cyan-600/[0.06] blur-[120px] animate-float-a [animation-delay:-14s]" />

      {/* Nebula orb D — teal, center */}
      <div className="absolute top-[20%] left-[50%] w-[350px] h-[350px] rounded-full bg-teal-600/[0.05] blur-[100px] animate-float-b [animation-delay:-8s]" />

      {/* Nebula orb E — blue, bottom-left */}
      <div className="absolute bottom-[25%] -left-16 w-[300px] h-[300px] rounded-full bg-blue-600/[0.05] blur-[90px] animate-float-a [animation-delay:-5s]" />

      {/* Starfield */}
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {stars.map((s) => (
        <span key={s.id} className={`absolute rounded-full bg-white st${s.id}`} />
      ))}
    </div>
  );
}
