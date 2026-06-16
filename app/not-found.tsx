import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center text-[#F1F5F9] p-6">
      <div className="max-w-sm w-full text-center">
        <div className="relative inline-block mb-6">
          <p className="text-8xl font-black text-emerald-500/10 select-none">404</p>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
          </div>
        </div>
        <h1 className="text-xl font-bold mb-2">Page not found</h1>
        <p className="text-sm text-[#4B5675] mb-8 leading-relaxed">
          This page doesn&apos;t exist or was moved.<br />
          Check the URL or head back to safety.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-block border border-[#252345] hover:border-[#333368] text-[#7B8DB4] hover:text-[#F1F5F9] transition-colors px-5 py-2.5 rounded-xl text-sm font-semibold"
          >
            ← Home
          </Link>
          <Link
            href="/dashboard"
            className="inline-block bg-emerald-600 hover:bg-emerald-500 transition-colors px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
