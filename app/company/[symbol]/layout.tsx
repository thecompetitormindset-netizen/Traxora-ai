import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Company",
  description: "What a company does and its key facts, in plain words.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
