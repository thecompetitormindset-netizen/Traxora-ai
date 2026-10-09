import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Futures",
  description: "Futures for the S&P 500, gold, oil and more, with our read in plain words.",
  robots: { index: false, follow: false },
};

export default function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
