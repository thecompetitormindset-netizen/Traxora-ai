import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Company results",
  description: "When companies report their results this week, in plain words.",
  robots: { index: false, follow: false },
};

export default function EarningsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
