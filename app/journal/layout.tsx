import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trade Journal — Traxora AI",
  description: "Your AI-assisted trade journal. Review past trades, AI analysis, and performance stats.",
};

export default function JournalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
