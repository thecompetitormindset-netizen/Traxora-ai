import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Overview",
  description: "What needs your attention today, your watchlist and your practice trading.",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
