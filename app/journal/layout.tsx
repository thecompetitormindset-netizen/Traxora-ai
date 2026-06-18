import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trade Journal",
  description: "AI-assisted trade journal. Review past trades, AI analysis, and performance stats.",
  robots: { index: false, follow: false },
};

export default function JournalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
