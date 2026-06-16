import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Traxora AI · $5/mo",
  description: "Full Smart Money signals, AI morning briefings, options analysis, deep scanner, and trade journal — all for $5/month. Cancel anytime. No credit card to start.",
  openGraph: {
    title: "Traxora AI Pricing — $5/mo Full Access",
    description: "Smart Money signals, morning briefings, options analysis, and AI trade journal for $5/mo vs $29–$118 elsewhere. Cancel anytime.",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
