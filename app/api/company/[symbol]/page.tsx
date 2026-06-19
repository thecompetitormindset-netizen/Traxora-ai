"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Sidebar from "../../../components/Sidebar";
import Topbar from "../../../components/Topbar";

type CompanyData = {
  symbol: string;
  name: string;
  code: string;
  exchange: string;
  currency: string;
  country: string;
  sector: string;
  industry: string;
  ipoDate: string;
  website: string;
  phone: string;
  address: string;
  description: string;
  logo: string;
  employees: string;
};

export default function CompanyPage({
  params,
}: {
  params: { symbol: string };
}) {
  const decodedSymbol = decodeURIComponent(params.symbol);
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCompany() {
      try {
        const res = await fetch(
          `/api/company?symbol=${encodeURIComponent(decodedSymbol)}`,
        );
        const data = await res.json();
        setCompany(data);
      } catch {
        setCompany(null);
      } finally {
        setLoading(false);
      }
    }

    loadCompany();
  }, [decodedSymbol]);

  return (
    <div className="flex min-h-screen text-[#F1F5F9]">
      <Sidebar />
      <main className="flex-1 p-6 xl:p-8 !pb-36">
        <Topbar />

        {loading ? (
          <div className="mt-6 text-[#4B5675]">Loading company details...</div>
        ) : !company ? (
          <div className="mt-6 text-[#4B5675]">
            Could not load company details.
          </div>
        ) : (
          <>
            <div className="mt-6 flex items-start justify-between gap-6">
              <div className="flex items-start gap-4">
                {company.logo ? (
                  <Image
                    src={company.logo}
                    alt={company.name}
                    width={64}
                    height={64}
                    className="w-16 h-16 rounded-2xl bg-white object-contain"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-[#13112A] border border-[#252345]" />
                )}

                <div>
                  <h1 className="text-4xl font-bold">{company.name}</h1>
                  <p className="text-[#4B5675] mt-2">
                    {company.symbol} · {company.exchange} · {company.country}
                  </p>
                </div>
              </div>

              <Link
                href={`/market?symbol=${encodeURIComponent(company.symbol)}`}
                className="bg-emerald-600 hover:bg-emerald-500 transition rounded-2xl px-5 py-3 font-semibold text-white"
              >
                Open in Market
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mt-8">
              {[
                { label: "Sector",     value: company.sector },
                { label: "Industry",   value: company.industry },
                { label: "IPO Date",   value: company.ipoDate },
                { label: "Employees",  value: company.employees },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[#13112A] border border-[#252345] rounded-2xl p-5">
                  <p className="text-xs text-[#4B5675] uppercase tracking-widest">{label}</p>
                  <p className="text-xl font-semibold mt-2 text-[#F1F5F9]">{value || "--"}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
              <div className="xl:col-span-2 bg-[#13112A] border border-[#252345] rounded-2xl p-6">
                <h2 className="text-xl font-bold mb-4 text-[#F1F5F9]">About</h2>
                <p className="text-[#7B8DB4] leading-7 text-sm">
                  {company.description || "No description available."}
                </p>
              </div>

              <div className="bg-[#13112A] border border-[#252345] rounded-2xl p-6">
                <h2 className="text-xl font-bold mb-4 text-[#F1F5F9]">Company Info</h2>

                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-1">Website</p>
                    {company.website ? (
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:text-emerald-300 break-all"
                      >
                        {company.website}
                      </a>
                    ) : (
                      <p className="text-[#7B8DB4]">--</p>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-1">Phone</p>
                    <p className="text-[#CBD5E1]">{company.phone || "--"}</p>
                  </div>

                  <div>
                    <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-1">Address</p>
                    <p className="text-[#CBD5E1]">{company.address || "--"}</p>
                  </div>

                  <div>
                    <p className="text-[10px] text-[#4B5675] uppercase tracking-widest mb-1">Currency</p>
                    <p className="text-[#CBD5E1]">{company.currency || "--"}</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
