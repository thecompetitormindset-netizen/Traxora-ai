import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Top Companies — Traxora AI",
  description: "AI-ranked top companies by market cap, momentum, and Smart Money signal strength.",
};

export default function TopCompaniesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
