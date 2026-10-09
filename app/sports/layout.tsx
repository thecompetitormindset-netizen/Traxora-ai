import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sports",
  description: "AI-derived winner and score predictions for NFL, NBA, MLB, NHL, and top soccer leagues, built from real sportsbook odds.",
  robots: { index: false, follow: false },
};

export default function SportsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
