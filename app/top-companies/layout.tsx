import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Top Companies",
  description: "AI-ranked top companies by market cap, momentum, and Smart Money signal strength.",
  robots: { index: false, follow: false },
};

export default function TopcompaniesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
