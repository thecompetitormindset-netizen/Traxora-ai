"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { data: session } = useSession();
  const router = useRouter();

  // 🔥 auto redirect if already logged in
  useEffect(() => {
    if (session) {
      router.push("/dashboard");
    }
  }, [session, router]);

  return (
    <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center text-white px-6">
      <div className="bg-[#111827] border border-[#1F2937] rounded-3xl p-10 w-full max-w-md text-center">
        <h1 className="text-3xl font-bold mb-6">
          Trade<span className="text-green-500">Pilot</span>
        </h1>

        <p className="text-gray-400 mb-6">Sign in with your Google account</p>

        <button
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          className="w-full bg-green-500 hover:bg-green-600 transition rounded-xl py-3 font-semibold"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
