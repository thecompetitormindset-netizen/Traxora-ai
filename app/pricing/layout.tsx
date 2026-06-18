import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Full AI Trading Signals for $5/mo",
  description:
    "Get unlimited BUY/SELL signals, Smart Money analysis, options plays & daily AI briefings for $5/mo. 80–90% cheaper than competitors. Cancel anytime, no contracts.",
  keywords: [
    "AI trading signals price", "cheap trading signals", "smart money signals subscription",
    "affordable trading platform", "Traxora AI pricing", "trading signals monthly",
  ],
  alternates: {
    canonical: "https://traxora-ai.vercel.app/pricing",
  },
  openGraph: {
    title:       "Traxora AI Pricing — $5/mo for Full AI Trading Signals",
    description: "Smart Money signals, Order Blocks, FVGs, options analysis, morning briefings, and AI trade journal. $5/mo vs $29–$118 elsewhere. Cancel anytime.",
    url:         "https://traxora-ai.vercel.app/pricing",
    type:        "website",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
