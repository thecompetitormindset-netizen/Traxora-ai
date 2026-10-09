import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "News",
  description: "The latest market news by topic.",
  robots: { index: false, follow: false },
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
