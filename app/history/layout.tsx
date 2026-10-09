import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "History",
  description: "Closed trade history, AI signal track record, and performance analytics.",
  robots: { index: false, follow: false },
};

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
