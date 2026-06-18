import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "IPO Tracker",
  description: "Track upcoming and recent IPOs with AI analysis on potential, sector fit, and lock-up risks.",
  robots: { index: false, follow: false },
};

export default function IpoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
