import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Signals",
  description: "A plain read on any stock — leaning buy, leaning sell or wait — and why.",
  robots: { index: false, follow: false },
};

export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
