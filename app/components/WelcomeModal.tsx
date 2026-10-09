"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Icon, type IconName } from "./Icon";

const WELCOME_KEY = "traxora_welcome_seen";

// Shown once after someone signs in: what signing in adds, in plain words.
const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: "sparkle", title: "Ask AI", desc: "Ask questions about any stock or the app." },
  { icon: "phone", title: "On all your devices", desc: "Your practice trades and watchlist follow you." },
  { icon: "mail", title: "Morning email", desc: "A short summary before the market opens." },
];

export default function WelcomeModal() {
  const { data: session, status } = useSession();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) return;
    const seen = localStorage.getItem(WELCOME_KEY);
    // Wait until the onboarding tour is done so the two modals never stack
    const onboarded = localStorage.getItem("traxora_onboarded_v2");
    if (!seen && onboarded) setVisible(true);
  }, [status, session]);

  function dismiss() {
    localStorage.setItem(WELCOME_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  const rawName   = session?.user?.name ?? session?.user?.email?.split("@")[0] ?? "there";
  const firstName = rawName.split(" ")[0];

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="welcome-title"
        className="w-full max-w-md rounded-[18px] border border-[var(--mx-line)] bg-[var(--mx-surface)] text-[var(--mx-text)] p-6">
        <h2 id="welcome-title" className="text-[20px]">Welcome, {firstName}</h2>
        <p className="mt-1 text-[14px] text-[var(--mx-text-2)]">You’re signed in. Here’s what that adds:</p>
        <ul className="mt-5 space-y-4">
          {FEATURES.map(f => (
            <li key={f.title} className="flex items-start gap-3">
              <span className="grid place-items-center w-9 h-9 shrink-0 rounded-[10px] border border-[var(--mx-line)]"><Icon name={f.icon} size={18} /></span>
              <span>
                <span className="block text-[14px]">{f.title}</span>
                <span className="block text-[13px] text-[var(--mx-text-3)]">{f.desc}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex gap-3">
          <Link href="/guide" onClick={dismiss} className="flex-1 h-10 inline-flex items-center justify-center rounded-full border border-[var(--mx-line)] text-[14px] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]">Read the guide</Link>
          <button type="button" onClick={dismiss} className="flex-1 h-10 rounded-full bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[14px]">Got it</button>
        </div>
      </div>
    </div>
  );
}
