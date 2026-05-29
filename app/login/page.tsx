"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const AUTH_ERRORS: Record<string, string> = {
  OAuthCallback:         "Google sign-in failed. Ensure this app is authorized in Google Cloud Console.",
  OAuthAccountNotLinked: "This Google account is linked to a different sign-in method.",
  Configuration:         "Auth configuration error — check AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET in Vercel.",
  AccessDenied:          "Access denied by Google.",
  Default:               "Sign-in failed. Please try again.",
};

function LoginContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorCode   = searchParams.get("error");
  const errorMsg    = errorCode ? (AUTH_ERRORS[errorCode] ?? AUTH_ERRORS.Default) : null;
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  useEffect(() => {
    if (session) router.push("/dashboard");
  }, [session, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-[#F1F5F9]">
      {/* Back to home */}
      <Link href="/" className="absolute top-6 left-6 flex items-center gap-2 text-sm text-[#4B5675] hover:text-[#7B8DB4] transition-colors">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </Link>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/25">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight">Traxora AI</h1>
          <p className="text-sm text-[#7B8DB4] mt-1">Sign in to access your dashboard</p>
        </div>

        {errorMsg && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center">
            {errorMsg}
          </div>
        )}

        {/* Card */}
        <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-6">
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl })}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 transition-colors text-gray-900 font-semibold py-3 px-5 rounded-xl text-sm"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#252345]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[#13112A] px-3 text-xs text-[#4B5675]">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl })}
            className="w-full bg-emerald-600 hover:bg-emerald-500 transition-colors text-white font-semibold py-3 px-5 rounded-xl text-sm"
          >
            Sign in with Google →
          </button>
        </div>

        <p className="text-center text-xs text-[#4B5675] mt-5 leading-relaxed">
          By signing in you agree that this tool is for informational purposes only
          and does not constitute financial advice.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
