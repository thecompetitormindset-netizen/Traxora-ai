import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Strategy",
  description: "Review your trading performance, equity curve, and AI-generated strategy insights.",
  robots: { index: false, follow: false },
};

export default function StrategyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
