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

  return (
    <div className="flex min-h-screen bg-[#0B0F19] text-white">
      <Sidebar />
      <main className="flex-1 p-6 xl:p-8">
        <Topbar />

        <div className="mt-6">
          <h1 className="text-4xl font-bold">Top 500 Companies</h1>
          <p className="text-gray-400 mt-2">
            Click any company to view full company details.
          </p>
        </div>

        <div className="mt-6 bg-[#111827] border border-[#1F2937] rounded-3xl p-6">
          {loading ? (
            <div className="text-gray-400">Loading companies...</div>
          ) : companies.length === 0 ? (
            <div className="text-gray-400">No companies found.</div>
          ) : (
            <>
              <div className="grid grid-cols-3 text-xs text-gray-500 pb-3 border-b border-[#1F2937] uppercase tracking-wide">
                <span>Symbol</span>
                <span>Company</span>
                <span>Sector</span>
              </div>

              <div className="space-y-1 mt-2 max-h-[70vh] overflow-y-auto">
                {companies.map((company) => (
                  <button
                    key={company.eodhdSymbol}
                    onClick={() => openCompany(company.eodhdSymbol)}
                    className="w-full grid grid-cols-3 items-center text-sm py-4 border-b border-[#1F2937] last:border-0 hover:bg-[#0F172A] rounded-xl px-2 text-left transition"
                  >
                    <span className="font-semibold">{company.eodhdSymbol}</span>
                    <span className="text-gray-300">{company.name}</span>
                    <span className="text-gray-400">{company.sector}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
