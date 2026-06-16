import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In — Traxora AI",
  description: "Sign in to Traxora AI with Google to access AI-powered Smart Money trading signals, morning briefings, options analysis, and your trade journal.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
