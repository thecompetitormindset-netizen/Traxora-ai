import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sports",
  description: "Which team is more likely to win, based on each team\u2019s record this season. For fun — not betting advice.",
  robots: { index: false, follow: false },
};

export default function SportsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
