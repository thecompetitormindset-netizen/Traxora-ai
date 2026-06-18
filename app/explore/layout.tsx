import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore",
  description: "Discover top stocks, sector leaders, and market-moving tickers with AI-powered analysis.",
  robots: { index: false, follow: false },
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
