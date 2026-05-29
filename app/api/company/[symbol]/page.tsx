"use client";

import { useEffect, useState } from "react";
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
      <main className="flex-1 p-6 xl:p-8 pb-28">
        <Topbar />

        {loading ? (
          <div className="mt-6 text-gray-400">Loading company details...</div>
        ) : !company ? (
          <div className="mt-6 text-gray-400">
            Could not load company details.
          </div>
        ) : (
          <>
            <div className="mt-6 flex items-start justify-between gap-6">
              <div className="flex items-start gap-4">
                {company.logo ? (
                  <img
                    src={company.logo}
                    alt={company.name}
                    className="w-16 h-16 rounded-2xl bg-white object-contain"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-[#1A1838] border border-[#1E1C42]" />
                )}

                <div>
                  <h1 className="text-4xl font-bold">{company.name}</h1>
                  <p className="text-gray-400 mt-2">
                    {company.symbol} · {company.exchange} · {company.country}
                  </p>
                </div>
              </div>

              <Link
                href={`/market?symbol=${encodeURIComponent(company.symbol)}`}
                className="bg-green-500 hover:bg-green-600 transition rounded-2xl px-5 py-3 font-semibold"
              >
                Open in Market
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mt-8">
              <div className="bg-[#1A1838] border border-[#1E1C42] rounded-3xl p-5">
                <p className="text-sm text-gray-400">Sector</p>
                <p className="text-xl font-semibold mt-2">
                  {company.sector || "--"}
                </p>
              </div>

              <div className="bg-[#1A1838] border border-[#1E1C42] rounded-3xl p-5">
                <p className="text-sm text-gray-400">Industry</p>
                <p className="text-xl font-semibold mt-2">
                  {company.industry || "--"}
                </p>
              </div>

              <div className="bg-[#1A1838] border border-[#1E1C42] rounded-3xl p-5">
                <p className="text-sm text-gray-400">IPO Date</p>
                <p className="text-xl font-semibold mt-2">
                  {company.ipoDate || "--"}
                </p>
              </div>

              <div className="bg-[#1A1838] border border-[#1E1C42] rounded-3xl p-5">
                <p className="text-sm text-gray-400">Employees</p>
                <p className="text-xl font-semibold mt-2">
                  {company.employees || "--"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
              <div className="xl:col-span-2 bg-[#1A1838] border border-[#1E1C42] rounded-3xl p-6">
                <h2 className="text-2xl font-semibold mb-4">About</h2>
                <p className="text-gray-300 leading-7">
                  {company.description || "No description available."}
                </p>
              </div>

              <div className="bg-[#1A1838] border border-[#1E1C42] rounded-3xl p-6">
                <h2 className="text-2xl font-semibold mb-4">Company Info</h2>

                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-gray-400">Website</p>
                    {company.website ? (
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-green-400 hover:text-green-300 break-all"
                      >
                        {company.website}
                      </a>
                    ) : (
                      <p>--</p>
                    )}
                  </div>

                  <div>
                    <p className="text-gray-400">Phone</p>
                    <p>{company.phone || "--"}</p>
                  </div>

                  <div>
                    <p className="text-gray-400">Address</p>
                    <p>{company.address || "--"}</p>
                  </div>

                  <div>
                    <p className="text-gray-400">Currency</p>
                    <p>{company.currency || "--"}</p>
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
