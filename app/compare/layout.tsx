import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare Stocks — Traxora AI",
  description: "Side-by-side comparison of fundamentals, analyst ratings, and AI signals for any two stocks.",
  robots: { index: false, follow: false },
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
