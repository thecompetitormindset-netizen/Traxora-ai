import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stocks",
  description: "US stocks and crypto: today’s movers, a screener and the market at a glance.",
  robots: { index: false, follow: false },
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
