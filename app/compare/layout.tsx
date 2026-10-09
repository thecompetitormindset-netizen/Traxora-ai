import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare",
  description: "Two stocks side by side, each fact explained in plain words.",
  robots: { index: false, follow: false },
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
