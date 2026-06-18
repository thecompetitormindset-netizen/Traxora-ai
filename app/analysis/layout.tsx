import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Signals",
  description: "Deep AI analysis with BUY/SELL/HOLD signals, Order Blocks, FVGs, and a full trade plan for any ticker.",
  robots: { index: false, follow: false },
};

export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
