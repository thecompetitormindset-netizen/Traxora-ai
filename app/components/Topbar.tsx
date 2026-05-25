"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";

type SearchItem = {
  code: string;
  name: string;
  exchange: string;
  country: string;
  currency: string;
  type: string;
  symbol: string;
};

type TopbarProps = {
  onSearch?: (symbol: string) => void;
};

export default function Topbar({ onSearch }: TopbarProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();

        if (Array.isArray(data)) {
          setResults(data);
          setOpen(true);
        } else {
          setResults([]);
          setOpen(false);
        }
      } catch (error) {
        console.error("Search failed:", error);
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  function handleSelect(symbol: string) {
    setQuery(symbol);
    setOpen(false);
    onSearch?.(symbol);

    router.push(`/analysis?symbol=${encodeURIComponent(symbol)}`);
  }

  return (
    <div className="h-20 flex items-center justify-between gap-4 relative">
      <div className="w-[560px] relative">
        <div className="bg-[#111827] border border-[#1F2937] rounded-2xl px-5 py-3 flex items-center gap-3">
          <span className="text-gray-400 text-lg">🔍</span>

          <input
            type="text"
            placeholder="Search any company or symbol"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (results.length > 0) setOpen(true);
            }}
            className="w-full bg-transparent text-white outline-none placeholder:text-gray-500 text-sm"
          />

          {loading && <span className="text-xs text-gray-500">Loading...</span>}
        </div>

        {open && results.length > 0 && (
          <div className="absolute top-[72px] left-0 w-full bg-[#111827] border border-[#1F2937] rounded-2xl shadow-lg z-50 max-h-96 overflow-y-auto">
            {results.map((item, index) => (
              <button
                key={`${item.symbol}-${index}`}
                onClick={() => handleSelect(item.symbol)}
                className="w-full text-left px-4 py-3 border-b border-[#1F2937] last:border-0 hover:bg-[#1F2937] transition"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">
                      {item.symbol}
                    </p>
                    <p className="text-sm text-gray-400 truncate">
                      {item.name}
                    </p>
                  </div>

                  <div className="text-xs text-gray-500 text-right shrink-0">
                    <p>{item.exchange}</p>
                    <p>{item.country}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/notifications"
          className="relative w-11 h-11 rounded-full bg-[#111827] border border-[#1F2937] flex items-center justify-center text-gray-300 hover:text-white hover:bg-[#1F2937] transition"
        >
          🔔
          <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
            3
          </span>
        </Link>

        {session?.user ? (
          <div className="flex items-center gap-3 bg-[#111827] border border-[#1F2937] rounded-2xl px-4 py-3 min-w-[250px]">
            <Link href="/settings" className="shrink-0">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt="Profile"
                  className="w-11 h-11 rounded-full object-cover"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-green-500 flex items-center justify-center text-sm font-bold text-white">
                  {session.user.name?.[0] ?? "U"}
                </div>
              )}
            </Link>

            <Link href="/settings" className="leading-tight flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {session.user.name ?? "User"}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {session.user.email ?? ""}
              </p>
            </Link>

            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-xs text-red-400 hover:text-red-300 whitespace-nowrap"
            >
              Logout
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="bg-[#111827] border border-[#1F2937] rounded-2xl px-4 py-3 text-sm font-medium hover:bg-[#1F2937] transition"
          >
            Sign in
          </button>
        )}
      </div>
    </div>
  );
}
