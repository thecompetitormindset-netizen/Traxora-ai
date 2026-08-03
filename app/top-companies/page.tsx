"use client";
import PaywallGuard from "@/app/components/PaywallGuard";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import Panel from "../components/Panel";

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
    <PaywallGuard>
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="app-ambient min-w-0 flex-1 p-6 xl:p-8 !pb-36 page-enter">
        <Topbar />
        <div className="max-w-4xl mx-auto w-full">

        <div className="mt-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="reveal section-header text-4xl font-bold text-gradient-green">Top 500 Companies</h1>
            <p className="text-[var(--text-secondary)] mt-2">
              Click any company to view full details and AI analysis.
            </p>
          </div>
          {!loading && (
            <span className="text-xs text-[var(--text-secondary)] border border-[var(--border)] px-3 py-1.5 rounded-xl">
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
            className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none focus:border-emerald-500/50 transition"
          />
        </div>

        <Panel padding="none" hover={false} className="mt-5 glass surface-sheen overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-[var(--text-secondary)] text-sm animate-pulse">Loading companies…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-secondary)] text-sm">No companies found.</div>
          ) : (
            <>
              <div className="grid grid-cols-3 text-[10px] text-[var(--text-secondary)] px-5 py-3 border-b border-[var(--border)] uppercase tracking-widest font-semibold">
                <span>Symbol</span>
                <span>Company</span>
                <span>Sector</span>
              </div>

              <div className="divide-y divide-[var(--border)] max-h-[70vh] overflow-y-auto">
                {filtered.map((company) => (
                  <button
                    key={company.eodhdSymbol}
                    type="button"
                    onClick={() => openCompany(company.eodhdSymbol)}
                    className="w-full grid grid-cols-3 items-center text-sm px-5 py-3.5 hover:bg-[var(--bg-elevated)] text-left transition"
                  >
                    <span className="font-bold text-emerald-400">{company.eodhdSymbol}</span>
                    <span className="text-[var(--text-primary)] truncate pr-4">{company.name}</span>
                    <span className="text-[var(--text-secondary)]">{company.sector}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Panel>
        </div>
      </main>
    </div>
    </PaywallGuard>
  );
}
