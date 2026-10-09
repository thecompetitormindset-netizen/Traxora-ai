import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Practice trading",
  description: "Practise buying and selling with pretend money at real prices.",
  robots: { index: false, follow: false },
};

export default function PaperLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
