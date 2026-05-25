"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  const links = [
    { name: "Dashboard", href: "/dashboard", icon: "🏠" },
    { name: "Explore", href: "/explore", icon: "🔍" },
    { name: "Analysis", href: "/analysis", icon: "📊" },
    { name: "Notifications", href: "/notifications", icon: "🔔" },
    { name: "Settings", href: "/settings", icon: "⚙️" },
  ];

  return (
    <aside className="w-72 min-h-screen bg-[#0F172A] border-r border-[#1F2937] p-5 flex flex-col justify-between">
      <div>
        <Link href="/dashboard" className="block mb-10">
          <h1 className="text-2xl font-bold text-white">
            Kairos <span className="text-green-500">TradePilot</span><span className="text-blue-400"> AI</span>
          </h1>
        </Link>

        <nav className="space-y-3">
          {links.map((link) => {
            const isActive = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition ${
                  isActive
                    ? "bg-green-500/15 text-green-400 border border-green-500/20"
                    : "text-gray-400 hover:bg-[#1F2937] hover:text-white"
                }`}
              >
                <span className="text-lg">{link.icon}</span>
                <span className="font-medium">{link.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="bg-[#111827] rounded-3xl p-5 border border-[#1F2937]">
        <p className="text-lg font-semibold text-white">
          Practice Makes Perfect
        </p>
        <p className="text-sm text-gray-400 mt-2">
          Trade with fake money and learn without real risk.
        </p>
      </div>
    </aside>
  );
}
