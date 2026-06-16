import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Explore — Traxora AI",
  description: "Discover top stocks, sector leaders, and market-moving tickers with AI-powered analysis.",
};

export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
