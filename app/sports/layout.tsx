import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sports",
  description: "What’s on across many sports, with simple win chances for the big team leagues. For fun — not betting advice.",
  robots: { index: false, follow: false },
};

export default function SportsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
