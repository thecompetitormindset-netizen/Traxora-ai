import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Market mood",
  description: "How investors feel today, in plain words.",
  robots: { index: false, follow: false },
};

export default function MarketsentimentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
