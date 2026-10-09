import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New listings",
  description: "Companies about to list on the stock market, and how recent ones have done.",
  robots: { index: false, follow: false },
};

export default function IpoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
