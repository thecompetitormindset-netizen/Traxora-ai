import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Markets — Traxora AI",
  description: "Real-time market overview: indices, futures, forex, bonds, and commodities with live prices.",
};

export default function MarketLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
