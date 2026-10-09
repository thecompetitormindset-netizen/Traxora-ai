"use client";

import { useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";

// Traxora works without an account. Only AI-model features need one, so when
// an AI request comes back 401 we explain that once, calmly, with a sign-in
// button — instead of each feature showing a bare error.

const EVENT = "traxora-signin-required";

function isAiUrl(input: RequestInfo | URL): boolean {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return /\/api\/(ai|ipo)\//.test(url);
}

export default function SignInPrompt() {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const lastShown = useRef(0);

  // Watch AI responses app-wide.
  useEffect(() => {
    const orig = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await orig(input, init);
      try { if (res.status === 401 && isAiUrl(input)) window.dispatchEvent(new Event(EVENT)); } catch { /* ignore */ }
      return res;
    };
    return () => { window.fetch = orig; };
  }, []);

  useEffect(() => {
    function show() {
      // Don't nag: at most once a minute.
      if (Date.now() - lastShown.current < 60_000) return;
      lastShown.current = Date.now();
      setOpen(true);
    }
    window.addEventListener(EVENT, show);
    return () => window.removeEventListener(EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open || status === "authenticated") return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="signin-prompt-title"
      className="fixed z-[var(--z-float)] left-3 right-3 bottom-[88px] sm:left-auto sm:right-6 sm:bottom-6 sm:w-[360px] rounded-[12px] border border-[var(--mx-line-strong)] bg-[var(--mx-surface)] text-[var(--mx-text)] p-4 shadow-[var(--mx-shadow)]"
    >
      <p className="mx-label">AI features</p>
      <p id="signin-prompt-title" className="mt-2 text-[15.5px]" style={{ fontWeight: 500 }}>Sign in to use AI features</p>
      <p className="mt-1 text-[13.5px] leading-snug text-[var(--mx-text-2)]">
        Ask AI, deep analysis, the morning brief and journal coaching use an AI model, so they need a free account. Everything else works without signing in.
      </p>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="h-9 px-3 text-[13px] text-[var(--mx-text-3)] hover:text-[var(--mx-text)]">Not now</button>
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: window.location.href }, { prompt: "select_account" })}
          className="h-9 px-4 rounded-[8px] bg-[var(--mx-primary-bg)] text-[var(--mx-primary-fg)] text-[13px]"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
