import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Options",
  description: "Option ideas checked against strict safety rules, explained in plain words. Practice only.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
