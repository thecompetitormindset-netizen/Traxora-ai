import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Futures",
  description: "Scan 50+ tickers for high-conviction Smart Money setups, ranked by signal strength.",
  robots: { index: false, follow: false },
};

export default function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
