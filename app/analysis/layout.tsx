import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Signals — Traxora AI",
  description: "Deep AI analysis with BUY/SELL/HOLD signals, trade plan, and Smart Money breakdown for any ticker.",
};

export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
