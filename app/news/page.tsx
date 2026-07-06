"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import PaywallGuard from "@/app/components/PaywallGuard";

type NewsItem = {
  title:   string;
  link:    string;
  pubDate: string;
  source:  string;
};

type Topic = "market" | "technology" | "finance" | "energy" | "crypto" | "healthcare";

const TOPICS: { id: Topic; label: string; emoji: string }[] = [
  { id: "market",     label: "Market",     emoji: "📈" },
  { id: "technology", label: "Technology", emoji: "💻" },
  { id: "finance",    label: "Finance",    emoji: "🏦" },
  { id: "energy",     label: "Energy",     emoji: "⚡" },
  { id: "healthcare", label: "Healthcare", emoji: "🏥" },
  { id: "crypto",     label: "Crypto",     emoji: "₿"  },
];

function timeAgo(pubDate: string): string {
  if (!pubDate) return "";
  const diff = Date.now() - new Date(pubDate).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="card-shine glass surface-sheen bg-[#13112A] rounded-2xl border border-[#252345] hover:border-[#333368] transition-all p-4 flex flex-col gap-2 group"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold text-[#4B5675] uppercase tracking-widest truncate">
          {item.source}
        </span>
        <span className="text-[9px] text-[#333368] font-mono shrink-0">{timeAgo(item.pubDate)}</span>
      </div>

      <p className="text-sm font-semibold text-[#E2E8F0] leading-snug line-clamp-3 group-hover:text-white transition-colors">
        {item.title}
      </p>

      <div className="flex items-center gap-1 mt-auto">
        <span className="text-[10px] font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">
          Read →
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-emerald-400 group-hover:translate-x-0.5 transition-transform">
          <path d="M7 17L17 7M17 7H7M17 7v10"/>
        </svg>
      </div>
    </a>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-[#13112A] rounded-2xl border border-[#252345] p-4 skeleton-shimmer">
      <div className="h-2.5 bg-[#252345] rounded w-20 mb-3" />
      <div className="space-y-1.5 mb-3">
        <div className="h-3 bg-[#252345] rounded w-full" />
        <div className="h-3 bg-[#252345] rounded w-5/6" />
        <div className="h-3 bg-[#252345] rounded w-3/4" />
      </div>
      <div className="h-2.5 bg-[#252345] rounded w-10" />
    </div>
  );
}

export default function NewsPage() {
  const [topic,   setTopic]   = useState<Topic>("market");
  const [items,   setItems]   = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const load = useCallback(async (t: Topic) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/news?topic=${t}&limit=24`, { cache: "no-store" });
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
      setLastFetch(new Date());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(topic); }, [topic, load]);

  // Auto-refresh every 5 min
  useEffect(() => {
    const id = setInterval(() => load(topic), 5 * 60_000);
    return () => clearInterval(id);
  }, [topic, load]);

  return (
    <PaywallGuard>
      <div className="flex min-h-screen text-[#F1F5F9]">
        <Sidebar />
        <main className="app-ambient min-w-0 flex-1 p-3 sm:p-4 xl:p-5 !pb-36 page-enter">
          <Topbar />
          <div className="max-w-7xl mx-auto w-full">

            {/* Header */}
            <div className="mt-3 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-gradient-green">News Feed</h1>
                {lastFetch && (
                  <p className="text-[10px] text-[#333368] mt-0.5">
                    Updated {timeAgo(lastFetch.toISOString())}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => load(topic)}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-bold transition-colors disabled:opacity-40"
              >
                {loading
                  ? <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Loading…</>
                  : "Refresh ↺"}
              </button>
            </div>

            {/* Topic pills */}
            <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-hide">
              {TOPICS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTopic(t.id)}
                  className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    topic === t.id
                      ? "bg-violet-600 text-white"
                      : "bg-[#1A1838] border border-[#252345] text-[#4B5675] hover:text-[#F1F5F9] hover:border-[#333368]"
                  }`}
                >
                  <span>{t.emoji}</span>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Grid */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {loading
                ? Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)
                : items.length > 0
                  ? items.map((item, i) => <NewsCard key={i} item={item} />)
                  : (
                    <div className="col-span-full bg-[#13112A] border border-[#252345] rounded-2xl p-10 text-center">
                      <p className="text-2xl mb-2">📰</p>
                      <p className="text-sm text-[#4B5675]">No news found for this topic right now.</p>
                    </div>
                  )
              }
            </div>

            <p className="mt-6 text-center text-[10px] text-[#333368]">
              News sourced from Google News RSS · Not financial advice · Links open external sites
            </p>
          </div>
        </main>
      </div>
    </PaywallGuard>
  );
}
