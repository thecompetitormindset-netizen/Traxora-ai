import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "News Feed — Traxora AI",
  description: "Filterable market news across Technology, Finance, Energy, Healthcare and Crypto.",
  robots: { index: false, follow: false },
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
