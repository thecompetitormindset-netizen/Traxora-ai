import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Market Scanner — Traxora AI",
  description: "Scan 50+ tickers for high-conviction Smart Money setups, ranked by signal strength.",
};

export default function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
