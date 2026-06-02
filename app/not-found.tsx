import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center text-[#F1F5F9] p-6">
      <div className="max-w-sm w-full text-center">
        <p className="text-7xl font-black text-emerald-500/20 mb-4">404</p>
        <h1 className="text-xl font-bold mb-2">Page not found</h1>
        <p className="text-sm text-[#4B5675] mb-8">This page doesn&apos;t exist or was moved.</p>
        <Link
          href="/dashboard"
          className="inline-block bg-emerald-600 hover:bg-emerald-500 transition-colors px-6 py-2.5 rounded-xl text-sm font-bold"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
