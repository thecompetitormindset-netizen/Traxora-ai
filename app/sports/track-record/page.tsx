"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import { Glyph } from "../../components/Icon";

type TierStat   = { label: string; total: number; correct: number };
type LeagueStat = { league: string; total: number; correct: number };
type RecentPick = {
  id: string; league: string; homeTeam: string; awayTeam: string;
  predictedWinner: string | null; confidence: number | null;
  actualWinner: string | null; hit: boolean; commenceTime: string;
};
type Rate = { hitRate: number | null; correct: number; graded: number; note: string | null };
type Band = { label: string; games: number; actual: number | null; implied: number | null };
type Market = {
  record: Rate;
  ours: Rate;
  versus: { disagreements: number; weWere: number; ourShare: number | null; note: string | null };
  calibration: Band[];
  gamesWithALine: number;
  note: string | null;
};
type TrackRecord = {
  overall: { total: number; correct: number };
  byTier:   TierStat[];
  byLeague: LeagueStat[];
  recent:   RecentPick[];
  market?:  Market;
};

const asPct = (v: number | null): string => v === null ? "—" : `${Math.round(v * 1000) / 10}%`;

/**
 * The market panel.
 *
 * Its whole job is to resist the obvious framing. A single line is never right
 * or wrong — a -150 favourite losing is the 40% happening, not a bookmaker
 * error — so nothing here grades one game. What it shows is whether the
 * chances the market implied actually came up at that rate, and whether our
 * own picks beat it on the games where the two disagreed. That second number
 * is the only one that would be evidence of an edge.
 */
function MarketPanel({ m }: { m: Market }) {
  return (
    <div className="mt-8 rounded-2xl border border-[#252345] bg-[#13112A] p-5">
      <h2 className="text-lg font-bold text-[var(--text-primary,#F1F5F9)]">Against the closing line</h2>
      <p className="mt-1 text-xs leading-relaxed text-[#7B8DB4] max-w-[70ch]">
        What a bookmaker was offering before each game, graded the same way our own picks are. A
        hit rate on its own says little: being right 58% of the time where the market implied 57%
        is no edge. Nothing here is a betting recommendation.
      </p>

      {m.note ? (
        <p className="mt-4 text-sm text-[#7B8DB4]">{m.note}</p>
      ) : (
        <>
          <div className="mt-5 grid sm:grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[#4B5675]">The market</p>
              <p className="mt-1 text-2xl font-black font-mono text-[var(--text-primary,#F1F5F9)]">{asPct(m.record.hitRate)}</p>
              <p className="mt-0.5 text-[11px] text-[#7B8DB4]">
                {m.record.note ?? `its favourite won ${m.record.correct} of ${m.record.graded}`}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[#4B5675]">Us, same games</p>
              <p className="mt-1 text-2xl font-black font-mono text-[var(--text-primary,#F1F5F9)]">{asPct(m.ours.hitRate)}</p>
              <p className="mt-0.5 text-[11px] text-[#7B8DB4]">
                {m.ours.note ?? `right ${m.ours.correct} of ${m.ours.graded}`}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[#4B5675]">When we disagreed</p>
              <p className="mt-1 text-2xl font-black font-mono text-[var(--text-primary,#F1F5F9)]">{asPct(m.versus.ourShare)}</p>
              <p className="mt-0.5 text-[11px] text-[#7B8DB4]">
                {m.versus.note ?? `we were right in ${m.versus.weWere} of ${m.versus.disagreements}`}
              </p>
            </div>
          </div>

          {/* Agreeing with the market proves nothing, so this is said out loud
              rather than left for a reader to work out from three numbers. */}
          <p className="mt-4 text-[11px] leading-relaxed text-[#4B5675] max-w-[70ch]">
            Only the third number tests anything. Agreeing with the line and being right just means
            the favourite won; it is the games where we took the other side that say whether there
            is an edge, and 50% there means there is none.
          </p>

          <div className="mt-6">
            <p className="text-[11px] uppercase tracking-wider text-[#4B5675]">
              Did the chances it implied come up?
            </p>
            <div className="mt-2 space-y-1.5">
              {m.calibration.filter(b => b.games > 0).map(b => (
                <div key={b.label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[#7B8DB4] w-20 shrink-0 font-mono text-xs">{b.label}</span>
                  <span className="flex-1 text-xs text-[#4B5675]">
                    implied {asPct(b.implied)} · {b.games} {b.games === 1 ? "game" : "games"}
                  </span>
                  <span className="font-mono text-sm text-[var(--text-primary,#F1F5F9)] shrink-0">
                    {b.actual === null ? "too few" : asPct(b.actual)}
                  </span>
                </div>
              ))}
              {m.calibration.every(b => b.games === 0) && (
                <p className="text-sm text-[#7B8DB4]">No settled games with a line yet.</p>
              )}
            </div>
            <p className="mt-2 text-[11px] text-[#4B5675] max-w-[70ch]">
              A band sitting close to its implied figure is a market doing its job. A band well off
              it, over enough games, is the only thing here that would be evidence of a mispricing.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function pct(correct: number, total: number): string {
  return total > 0 ? `${Math.round((correct / total) * 1000) / 10}%` : "—";
}

export default function TrackRecordPage() {
  const { status } = useSession();
  const [data,    setData]    = useState<TrackRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed,  setFailed]  = useState(false);


  function load() {
    setLoading(true);
    setFailed(false);
    fetch("/api/sports/track-record", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: TrackRecord | null) => { if (!d) { setFailed(true); return; } setData(d); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- starts the initial load; its setState runs after the await
  useEffect(() => { load(); }, []);

  if (status === "loading") {
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
            <Link href="/sports" className="text-[10px] text-[#4B5675] hover:text-[#7B8DB4] font-semibold">← Back to Sports</Link>
            <h1 className="text-2xl font-black tracking-tight text-gradient-green mt-2">How often we’ve been right</h1>
            <p className="text-xs text-[#4B5675] max-w-lg mx-auto mt-1">
              Every pick is saved before the game starts and checked after it ends — nothing is left out.
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
                <span className="text-xl"><Glyph e="📉" /></span>
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
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#4B5675] mb-1">Right so far</p>
                <p className="text-4xl font-black font-mono text-emerald-400">{pct(data.overall.correct, data.overall.total)}</p>
                <p className="text-xs text-[#4B5675] mt-1">{data.overall.correct} of {data.overall.total} picks were right</p>
              </div>

              {/* By league */}
              {data.byLeague.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-[#7B8DB4] mb-3">By sport</h2>
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
                <h2 className="text-sm font-bold uppercase tracking-widest text-[#7B8DB4] mb-3">Latest picks</h2>
                <div className="space-y-1.5">
                  {data.recent.map(r => (
                    <div key={r.id} className="flex items-center gap-3 bg-[#13112A] border border-[#252345] rounded-xl px-4 py-2.5">
                      <span className={`text-xs shrink-0 ${r.hit ? "text-emerald-400" : "text-rose-400"}`}>{r.hit ? "✓" : "✗"}</span>
                      <span className="text-[10px] font-semibold text-[#4B5675] w-16 shrink-0">{r.league}</span>
                      <span className="text-xs text-[#CBD5E1] flex-1 truncate">{r.awayTeam} @ {r.homeTeam}</span>
                      <span className="text-[10px] font-mono text-[#7B8DB4] shrink-0">picked {r.predictedWinner}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* The market's record, beside ours. Rendered only when the
                  route sent one, so an older cached payload cannot crash the
                  page on a key that did not exist yet. */}
              {data.market && <MarketPanel m={data.market} />}
            </>
          )}

        </main>
      </div>
      <Sidebar />
    </div>
  );
}
