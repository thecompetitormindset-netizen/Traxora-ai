import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Paper Trading",
  description: "Practice trading risk-free with a simulated account. Track open positions, P&L, and equity curve.",
  robots: { index: false, follow: false },
};

export default function PaperLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
