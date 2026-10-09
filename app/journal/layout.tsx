import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trade Journal",
  description: "Your saved checks and past trades.",
  robots: { index: false, follow: false },
};

export default function JournalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
