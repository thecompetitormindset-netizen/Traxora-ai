"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center text-[#F1F5F9] p-6">
      <div className="max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
        <p className="text-sm text-[#4B5675] mb-6">An unexpected error occurred. Your data is safe.</p>
        <button
          type="button"
          onClick={reset}
          className="bg-emerald-600 hover:bg-emerald-500 transition-colors px-6 py-2.5 rounded-xl text-sm font-bold"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
