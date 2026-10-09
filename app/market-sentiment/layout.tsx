import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Market mood",
  description: "AI-synthesized Fear and Greed index, sector sentiment, and macro market conditions in real time.",
  robots: { index: false, follow: false },
};

export default function MarketsentimentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
