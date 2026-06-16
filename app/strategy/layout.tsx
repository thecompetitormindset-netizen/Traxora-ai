import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Strategy — Traxora AI",
  description: "Review your trading performance, equity curve, and AI-generated strategy insights.",
};

export default function StrategyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
