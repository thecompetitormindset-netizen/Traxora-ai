"use client";

import { useEffect, useState } from "react";
import { useAppSession } from "@/app/lib/useAppSession";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";

type TierStat   = { label: string; total: number; correct: number };
type LeagueStat = { league: string; total: number; correct: number };
type RecentPick = {
  id: string; league: string; homeTeam: string; awayTeam: string;
  predictedWinner: string | null; confidence: number | null;
  actualWinner: string | null; hit: boolean; commenceTime: string;
};
type TrackRecord = {
  overall: { total: number; correct: number };
  byTier:   TierStat[];
  byLeague: LeagueStat[];
  recent:   RecentPick[];
};

function pct(correct: number, total: number): string {
  return total > 0 ? `${Math.round((correct / total) * 1000) / 10}%` : "—";
}

export default function TrackRecordPage() {
  const { status } = useAppSession();
  const router = useRouter();
  const [data,    setData]    = useState<TrackRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed,  setFailed]  = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  function load() {
    setLoading(true);
    setFailed(false);
    fetch("/api/sports/track-record", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: TrackRecord | null) => { if (!d) { setFailed(true); return; } setData(d); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D0B1A]">
        <svg className="animate-spin text-emerald-500" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0D0B1A] text-[#F1F5F9]">
      <Topbar />
      <div className="flex flex-1 !pb-36">
        <main className="app-ambient min-w-0 flex-1 max-w-4xl mx-auto w-full px-3 py-4 page-enter">

          <div className="mb-5 text-center">
            <Link href="/sports" className="text-[10px] text-[#4B5675] hover:text-[#7B8DB4] font-semibold">← Back to Game Predictions</Link>
            <h1 className="text-2xl font-black tracking-tight text-gradient-green mt-2">Track Record</h1>
            <p className="text-xs text-[#4B5675] max-w-lg mx-auto mt-1">
              Every graded pick, no cherry-picking. A prediction is logged before the game starts and only counted once the game finishes.
            </p>
          </div>

          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-[#13112A] rounded-xl border border-[#252345] animate-pulse" />)}
            </div>
          )}

          {!loading && (failed || !data) && (
            <div className="text-center py-16">
              <div className="w-12 h-12 rounded-2xl bg-[#13112A] border border-[#252345] flex items-center justify-center mx-auto mb-4" aria-hidden>
                <span className="text-xl">📉</span>
              </div>
              <p className="text-sm font-bold text-[#7B8DB4] mb-1">Couldn&rsquo;t load the track record</p>
              <p className="text-xs text-[#4B5675] mb-5">The data service didn&rsquo;t answer — it usually recovers quickly.</p>
              <button type="button" onClick={load}
                className="text-xs font-bold text-emerald-400 border border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/15 px-5 py-2.5 rounded-xl transition-colors">
                ↻ Try again
              </button>
            </div>
          )}

          {!loading && data && data.overall.total === 0 && (
            <div className="text-center py-16">
              <p className="text-sm font-bold text-[#7B8DB4] mb-1">No graded picks yet</p>
              <p className="text-xs text-[#4B5675] max-w-sm mx-auto">Predictions are logged before each game and graded once it finishes — check back once some of today&rsquo;s games have wrapped up.</p>
            </div>
          )}

          {!loading && data && data.overall.total > 0 && (
            <>
              {/* Overall */}
              <div className="bg-[#13112A] rounded-2xl border border-[#252345] p-6 text-center mb-6">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#4B5675] mb-1">Overall Accuracy</p>
                <p className="text-4xl font-black font-mono text-emerald-400">{pct(data.overall.correct, data.overall.total)}</p>
                <p className="text-xs text-[#4B5675] mt-1">{data.overall.correct} of {data.overall.total} graded picks correct</p>
              </div>

              {/* Calibration by confidence tier */}
              <div className="mb-6">
                <h2 className="text-sm font-bold uppercase tracking-widest text-[#7B8DB4] mb-1">Calibration</h2>
                <p className="text-[10px] text-[#4B5675] mb-3">If the model is honest, a &ldquo;70–80%&rdquo; pick should win roughly 70–80% of the time — no more, no less.</p>
                <div className="space-y-2">
                  {data.byTier.filter(t => t.total > 0).map(t => (
                    <div key={t.label} className="flex items-center gap-3 bg-[#13112A] border border-[#252345] rounded-xl px-4 py-2.5">
                      <span className="text-xs font-mono font-bold text-[#7B8DB4] w-20 shrink-0">{t.label}</span>
                      <div className="flex-1 h-2 rounded-full bg-[#0D0B1A] overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-400" style={{ width: pct(t.correct, t.total) }} />
                      </div>
                      <span className="text-xs font-mono font-bold text-[var(--text-primary,#F1F5F9)] w-24 text-right shrink-0">
                        {pct(t.correct, t.total)} <span className="text-[#4B5675]">({t.total})</span>
                      </span>
                    </div>
                  ))}
                  {data.byTier.every(t => t.total === 0) && (
                    <p className="text-xs text-[#4B5675] text-center py-4">Not enough graded picks yet to break down by confidence.</p>
                  )}
                </div>
              </div>

              {/* By league */}
              {data.byLeague.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-[#7B8DB4] mb-3">By League</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {data.byLeague.map(l => (
                      <div key={l.league} className="bg-[#13112A] border border-[#252345] rounded-xl p-3">
                        <p className="text-[10px] font-bold text-[#4B5675]">{l.league}</p>
                        <p className="text-lg font-black font-mono text-[var(--text-primary,#F1F5F9)]">{pct(l.correct, l.total)}</p>
                        <p className="text-[9px] text-[#333368]">{l.correct}/{l.total}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent picks */}
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-[#7B8DB4] mb-3">Recent Picks</h2>
                <div className="space-y-1.5">
                  {data.recent.map(r => (
                    <div key={r.id} className="flex items-center gap-3 bg-[#13112A] border border-[#252345] rounded-xl px-4 py-2.5">
                      <span className={`text-xs shrink-0 ${r.hit ? "text-emerald-400" : "text-rose-400"}`}>{r.hit ? "✓" : "✗"}</span>
                      <span className="text-[10px] font-semibold text-[#4B5675] w-16 shrink-0">{r.league}</span>
                      <span className="text-xs text-[#CBD5E1] flex-1 truncate">{r.awayTeam} @ {r.homeTeam}</span>
                      <span className="text-[10px] font-mono text-[#7B8DB4] shrink-0">picked {r.predictedWinner} · {r.confidence}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

        </main>
      </div>
      <Sidebar />
    </div>
  );
}
