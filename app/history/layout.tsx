import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trade History — Traxora AI",
  description: "Your closed trade history, AI signal track record, and performance analytics.",
};

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
