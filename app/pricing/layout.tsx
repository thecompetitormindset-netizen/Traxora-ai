import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — AI Trading Signals from $5/mo",
  description:
    "Traxora AI Pro gives you unlimited AI trading signals, Smart Money analysis (Order Blocks, FVGs, Liquidity), options plays, daily morning briefings, and a full AI trade journal — for $5/month. Cancel anytime.",
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
