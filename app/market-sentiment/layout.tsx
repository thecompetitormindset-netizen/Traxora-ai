import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Market Sentiment — Traxora AI",
  description: "AI-synthesized Fear & Greed index, sector sentiment, and macro market conditions in real time.",
};

export default function MarketSentimentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
