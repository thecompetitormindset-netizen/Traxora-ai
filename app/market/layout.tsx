import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Markets",
  description: "Big indexes, futures and more, with live prices.",
  robots: { index: false, follow: false },
};

export default function MarketLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
