import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Earnings Calendar — Traxora AI",
  description: "Upcoming earnings reports with EPS estimates. Plan your trades around market-moving events.",
  robots: { index: false, follow: false },
};

export default function EarningsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
