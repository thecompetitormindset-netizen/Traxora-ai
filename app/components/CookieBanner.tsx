"use client";

import { Glyph } from "./Icon";
import { useStoredFlag, writeStoredFlag } from "../lib/useStoredFlag";

const COOKIE_KEY = "traxora_cookie_consent";

export default function CookieBanner() {
  // Read straight from storage rather than defaulting to hidden and correcting
  // in an effect: the banner no longer appears a render late, and a choice made
  // in another tab closes it here too.
  const answered = useStoredFlag(COOKIE_KEY);

  const accept = () => writeStoredFlag(COOKIE_KEY, "accepted");
  const decline = () => writeStoredFlag(COOKIE_KEY, "declined");

  if (answered) return null;

  return (
    <div className="fixed bottom-44 left-4 right-4 z-[var(--z-float)] max-w-lg mx-auto sm:bottom-6">
      <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-4 shadow-2xl shadow-black/50 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1">
          <p className="text-xs font-bold text-[#F1F5F9] mb-1"><Glyph e="🍪" /> We use cookies</p>
          <p className="text-[11px] text-[#7B8DB4] leading-relaxed">
            We use cookies to save your settings and, if you choose to sign in, keep you signed in. No tracking or ads — ever.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={decline}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#4B5675] hover:text-[#7B8DB4] border border-[#252345] hover:border-[#333368] transition-colors"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={accept}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
