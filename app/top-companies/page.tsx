"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";

type Company = {
  symbol: string;
  name: string;
  sector: string;
  eodhdSymbol: string;
};

export default function TopCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function loadCompanies() {
      try {
        const res = await fetch("/api/top-companies");
        const data = await res.json();
        setCompanies(Array.isArray(data) ? data : []);
      } catch {
        setCompanies([]);
      } finally {
        setLoading(false);
      }
    }
    loadCompanies();
  }, []);

  function openCompany(symbol: string) {
    router.push(`/company/${encodeURIComponent(symbol)}`);
  }

  const filtered = query.trim()
    ? companies.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.eodhdSymbol.toLowerCase().includes(query.toLowerCase()) ||
          c.sector.toLowerCase().includes(query.toLowerCase()),
      )
    : companies;

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="flex-1 p-6 xl:p-8 pb-28">
        <Topbar />
        <div className="max-w-4xl mx-auto w-full">

        <div className="mt-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold">Top 500 Companies</h1>
            <p className="text-[#7B8DB4] mt-2">
              Click any company to view full details and AI analysis.
            </p>
          </div>
          {!loading && (
            <span className="text-xs text-[#4B5675] border border-[#1C2333] px-3 py-1.5 rounded-xl">
              {filtered.length} companies
            </span>
          )}
        </div>

        {/* Search */}
        <div className="mt-5">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, ticker, or sector…"
            className="w-full max-w-md bg-[#0C1017] border border-[#1C2333] rounded-xl px-4 py-3 text-sm text-[#F1F5F9] placeholder-[#4B5675] outline-none focus:border-emerald-500/50 transition"
          />
        </div>

        <div className="mt-5 bg-[#0C1017] border border-[#1C2333] rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-[#4B5675] text-sm animate-pulse">Loading companies…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-[#4B5675] text-sm">No companies found.</div>
          ) : (
            <>
              <div className="grid grid-cols-3 text-[10px] text-[#4B5675] px-5 py-3 border-b border-[#1C2333] uppercase tracking-widest font-semibold">
                <span>Symbol</span>
                <span>Company</span>
                <span>Sector</span>
              </div>

              <div className="divide-y divide-[#1C2333] max-h-[70vh] overflow-y-auto">
                {filtered.map((company) => (
                  <button
                    key={company.eodhdSymbol}
                    type="button"
                    onClick={() => openCompany(company.eodhdSymbol)}
                    className="w-full grid grid-cols-3 items-center text-sm px-5 py-3.5 hover:bg-[#111827] text-left transition"
                  >
                    <span className="font-bold text-emerald-400">{company.eodhdSymbol}</span>
                    <span className="text-[#CBD5E1] truncate pr-4">{company.name}</span>
                    <span className="text-[#4B5675]">{company.sector}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        </div>
      </main>
    </div>
  );
}
