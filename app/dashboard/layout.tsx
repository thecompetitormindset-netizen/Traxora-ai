import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your live trading dashboard. AI signals, watchlist, futures, options plays, and portfolio — all in one view.",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
