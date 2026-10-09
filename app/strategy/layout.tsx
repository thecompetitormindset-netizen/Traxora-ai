import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your results",
  description: "How your practice trades have gone, in one place.",
  robots: { index: false, follow: false },
};

export default function StrategyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
