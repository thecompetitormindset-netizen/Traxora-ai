import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Paper Trading — Traxora AI",
  description: "Practice trading risk-free with a $10,000 simulated account. Track open positions, P&L, and equity curve.",
};

export default function PaperLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
