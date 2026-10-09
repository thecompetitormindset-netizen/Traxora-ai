import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Top Companies",
  description: "The biggest US companies, in one list.",
  robots: { index: false, follow: false },
};

export default function TopcompaniesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
