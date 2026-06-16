import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard — Traxora AI",
  description: "Your live signal dashboard. Monitor your watchlist, open positions, and futures in real time.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
