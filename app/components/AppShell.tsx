"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import dynamic from "next/dynamic";
import AnimationProvider from "./AnimationProvider";
import SessionWatcher from "./SessionWatcher";

// Marketing pages — only AnimationProvider + SessionWatcher needed
const MARKETING = new Set(["/", "/login", "/guide", "/privacy", "/terms"]);

// Lazy-load heavy components so they never block the initial paint
const WelcomeModal   = dynamic(() => import("./WelcomeModal"),   { ssr: false });
const AutoScanner    = dynamic(() => import("./AutoScanner"),    { ssr: false });
const AutoJournal    = dynamic(() => import("./AutoJournal"),    { ssr: false });
const MorningBriefing= dynamic(() => import("./MorningBriefing"),{ ssr: false });
const RiskGuard      = dynamic(() => import("./RiskGuard"),      { ssr: false });
const AutoCoach      = dynamic(() => import("./AutoCoach"),      { ssr: false });
const SignalToast    = dynamic(() => import("./SignalToast"),    { ssr: false });
const PortfolioSync  = dynamic(() => import("./PortfolioSync"),  { ssr: false });
const SignInPrompt   = dynamic(() => import("./SignInPrompt"),   { ssr: false });

export default function AppShell() {
  const pathname = usePathname();
  const isMarketing = MARKETING.has(pathname);

  useEffect(() => {
    document.body.classList.toggle("app-mode", !isMarketing);
    return () => { document.body.classList.remove("app-mode"); };
  }, [isMarketing]);

  return (
    <>
      <AnimationProvider />
      <SessionWatcher />
      <SignInPrompt />
      {!isMarketing && (
        <>
          <WelcomeModal />
          <AutoScanner />
          <AutoJournal />
          <MorningBriefing />
          <RiskGuard />
          <AutoCoach />
          <SignalToast />
          <PortfolioSync />
        </>
      )}
    </>
  );
}
