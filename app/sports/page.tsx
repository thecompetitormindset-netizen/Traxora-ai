"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { scopedKey } from "../lib/userState";

// ── Types ─────────────────────────────────────────────────────────────────────

type GamePrediction = {
  id:               string;
  sportKey:         string;
  league:           string;
  leagueGroup:      "US" | "Soccer";
  commenceTime:     string;
  homeTeam:         string;
  awayTeam:         string;
  homeRecord:       string | null;
  awayRecord:       string | null;
  predictedWinner:  string | null;
  winnerConfidence: number | null;
};

type WatchItem = { id: string; league: string; homeTeam: string; awayTeam: string; commenceTime: string };

const LEAGUE_ORDER = [
  "World Cup", "NFL", "NBA", "MLB", "NHL",
  "College Football", "College Basketball", "WNBA",
  "Premier League", "Champions League", "La Liga", "Serie A", "Bundesliga", "MLS",
];

// One tab per sport. Soccer bundles its leagues; every other sport stands alone.
const SPORT_TABS: Array<{ id: string; label: string; emoji: string; match: (g: GamePrediction) => boolean }> = [
  { id: "all",    label: "All",                emoji: "🌍", match: () => true },
  { id: "nfl",    label: "NFL",                emoji: "🏈", match: g => g.league === "NFL" },
  { id: "nba",    label: "NBA",                emoji: "🏀", match: g => g.league === "NBA" },
  { id: "mlb",    label: "MLB",                emoji: "⚾", match: g => g.league === "MLB" },
  { id: "nhl",    label: "NHL",                emoji: "🏒", match: g => g.league === "NHL" },
  { id: "soccer", label: "Soccer",             emoji: "⚽", match: g => g.leagueGroup === "Soccer" },
  { id: "cfb",    label: "College Football",   emoji: "🎓", match: g => g.league === "College Football" },
  { id: "cbb",    label: "College Basketball", emoji: "🎓", match: g => g.league === "College Basketball" },
  { id: "wnba",   label: "WNBA",               emoji: "🏀", match: g => g.league === "WNBA" },
];

const WATCHLIST_KEY = "traxora_sports_watchlist";
const NOTIFIED_KEY  = "traxora_sports_notified";
const ALERT_WINDOW_MS = 30 * 60 * 1000; // notify once a favorited game is within 30 min of kickoff

function fmtKickoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Local-timezone YYYY-MM-DD so "today"/"tomorrow" match the viewer's clock, not UTC.
function localDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA");
}

function loadWatchlist(): WatchItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(scopedKey(WATCHLIST_KEY)) ?? "[]"); } catch { return []; }
}
function saveWatchlist(list: WatchItem[]) {
  localStorage.setItem(scopedKey(WATCHLIST_KEY), JSON.stringify(list));
}
function loadNotified(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(scopedKey(NOTIFIED_KEY)) ?? "[]")); } catch { return new Set(); }
}
function markNotified(id: string) {
  const s = loadNotified();
  s.add(id);
  localStorage.setItem(scopedKey(NOTIFIED_KEY), JSON.stringify([...s]));
}

// Browser Notification while this tab is open — same mechanism the rest of the
// app uses for signal alerts (there's no real background push wired up here).
function fireGameAlert(item: WatchItem) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  const n = new Notification(`🏆 ${item.awayTeam} @ ${item.homeTeam} starting soon`, {
    body: `${item.league} · kickoff at ${fmtKickoff(item.commenceTime)}`,
    icon: "/icon-192.png",
    tag: `sports-${item.id}`,
  });
  n.onclick = () => { window.focus(); window.location.href = "/sports"; n.close(); };
}

// ── Game card ─────────────────────────────────────────────────────────────────

function GameCard({
  g, todayKey, tomorrowKey, watched, onToggleWatch, inCombo, onToggleCombo,
}: {
  g: GamePrediction; todayKey: string; tomorrowKey: string;
  watched: boolean; onToggleWatch: () => void;
  inCombo: boolean; onToggleCombo: () => void;
}) {
  const homeWins = g.predictedWinner === g.homeTeam;
  const awayWins = g.predictedWinner === g.awayTeam;
  const gameDay  = localDateKey(g.commenceTime);
  const dayLabel = gameDay === todayKey ? "Today" : gameDay === tomorrowKey ? "Tomorrow" : null;
  const hasPick  = g.predictedWinner !== null && g.winnerConfidence !== null;

  return (
    <div className={`bg-[#0D0B1A] rounded-xl border p-4 flex flex-col gap-3 transition-colors ${inCombo ? "border-violet-500/40" : "border-[#252345] hover:border-[#333368]"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          {dayLabel && (
            <span className={`text-[8px] font-black px-1.5 py-px rounded ${
              dayLabel === "Today" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : "bg-sky-500/15 text-sky-400 border border-sky-500/25"
            }`}>{dayLabel.toUpperCase()}</span>
          )}
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#4B5675]">{fmtKickoff(g.commenceTime)}</span>
        </span>
        <button type="button" onClick={onToggleWatch} title={watched ? "Remove from watchlist" : "Add to watchlist"}
          className={`text-sm leading-none transition-colors ${watched ? "text-amber-400" : "text-[#333368] hover:text-[#7B8DB4]"}`}>
          {watched ? "★" : "☆"}
        </button>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-bold truncate ${awayWins ? "text-emerald-400" : "text-[var(--text-primary,#F1F5F9)]"}`}>
            {g.awayTeam}{awayWins && " ✓"}
          </span>
          {g.awayRecord && <span className="text-[10px] font-mono text-[#4B5675] shrink-0">{g.awayRecord}</span>}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-bold truncate ${homeWins ? "text-emerald-400" : "text-[var(--text-primary,#F1F5F9)]"}`}>
            {g.homeTeam}{homeWins && " ✓"}
          </span>
          {g.homeRecord && <span className="text-[10px] font-mono text-[#4B5675] shrink-0">{g.homeRecord}</span>}
        </div>
      </div>

      {hasPick ? (
        <div className="pt-2 border-t border-[#1A1838] flex items-center gap-2">
          <span className="text-[9px] text-[#4B5675] uppercase tracking-widest font-bold">Pick</span>
          <span className="text-xs font-bold text-emerald-400 truncate">{g.predictedWinner}</span>
          <span className="text-[10px] font-mono font-bold text-[#7B8DB4]">{g.winnerConfidence}%</span>
          <button type="button" onClick={onToggleCombo}
            className={`ml-auto text-[9px] font-black px-2 py-0.5 rounded-lg border transition-colors ${
              inCombo
                ? "bg-violet-500/15 text-violet-300 border-violet-500/30"
                : "bg-[#13112A] text-[#4B5675] border-[#252345] hover:text-[#7B8DB4]"
            }`}>
            {inCombo ? "✓ In Combo" : "+ Combo"}
          </button>
        </div>
      ) : (
        <div className="pt-2 border-t border-[#1A1838]">
          <span className="text-[9px] text-[#333368]">Not enough games played yet for a prediction</span>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SportsPage() {
  const { status, data: session } = useSession();
  const router = useRouter();

  const [games,      setGames]      = useState<GamePrediction[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading,    setLoading]    = useState(true);
  const [failed,     setFailed]     = useState(false);
  const [sportTab,   setSportTab]   = useState("all");
  const [dateFilter, setDateFilter] = useState<"today" | "tomorrow" | "all">("all");
  // Default to every game in schedule order — probability is an opt-in view
  const [confFilter, setConfFilter] = useState<0 | 70 | 80>(0);

  const [watchlist,  setWatchlist]  = useState<WatchItem[]>([]);
  const [comboIds,   setComboIds]   = useState<Set<string>>(new Set());
  const [notifPerm,  setNotifPerm]  = useState<NotificationPermission>("default");
  const watchlistInitialized = useRef(false);

  const todayKey    = useMemo(() => new Date().toLocaleDateString("en-CA"), []);
  const tomorrowKey = useMemo(() => new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA"), []);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    fetch("/api/sports/predictions", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { games?: GamePrediction[]; configured?: boolean } | null) => {
        if (!d) { setFailed(true); return; }
        setGames(d.games ?? []);
        setConfigured(d.configured ?? false);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  // Watchlist: load local copy, prune past games, then reconcile with Supabase
  useEffect(() => {
    if (typeof Notification !== "undefined") setNotifPerm(Notification.permission);
    const local  = loadWatchlist();
    const pruned = local.filter(w => new Date(w.commenceTime).getTime() > Date.now() - 6 * 3_600_000);
    if (pruned.length !== local.length) saveWatchlist(pruned);
    setWatchlist(pruned);

    fetch("/api/user/sports-watchlist")
      .then(r => r.json())
      .then((data: { items?: WatchItem[] | null }) => {
        if (!Array.isArray(data.items) || data.items.length === 0) { watchlistInitialized.current = true; return; }
        const localIds  = pruned.map(w => w.id).join(",");
        const serverIds = data.items.map(w => w.id).join(",");
        if (localIds === serverIds) { watchlistInitialized.current = true; return; }
        saveWatchlist(data.items);
        setWatchlist(data.items);
        watchlistInitialized.current = true;
      })
      .catch(() => { watchlistInitialized.current = true; });
  }, [session]);

  // Sync watchlist to Supabase whenever it changes (skip the initial load)
  useEffect(() => {
    if (!watchlistInitialized.current) { watchlistInitialized.current = true; return; }
    const id = setTimeout(() => {
      fetch("/api/user/sports-watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: watchlist }),
      }).catch(() => { /* best-effort */ });
    }, 800);
    return () => clearTimeout(id);
  }, [watchlist]);

  // Check watchlist every 60s for games about to start — tab must be open,
  // this is not real background push (nothing in this app does that today).
  useEffect(() => {
    const check = () => {
      const notified = loadNotified();
      for (const w of watchlist) {
        const msToKickoff = new Date(w.commenceTime).getTime() - Date.now();
        if (msToKickoff > 0 && msToKickoff <= ALERT_WINDOW_MS && !notified.has(w.id)) {
          fireGameAlert(w);
          markNotified(w.id);
        }
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [watchlist]);

  function toggleWatch(g: GamePrediction) {
    setWatchlist(prev => {
      const next = prev.some(w => w.id === g.id)
        ? prev.filter(w => w.id !== g.id)
        : [...prev, { id: g.id, league: g.league, homeTeam: g.homeTeam, awayTeam: g.awayTeam, commenceTime: g.commenceTime }];
      saveWatchlist(next);
      return next;
    });
  }

  function toggleCombo(id: string) {
    setComboIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function requestNotifPermission() {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then(setNotifPerm);
  }

  // Games per sport tab (before date/confidence filters) — powers the tab count badges
  const tabCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of SPORT_TABS) m.set(t.id, games.filter(t.match).length);
    return m;
  }, [games]);

  const activeTab = SPORT_TABS.find(t => t.id === sportTab) ?? SPORT_TABS[0];

  const grouped = useMemo(() => {
    let filtered = games.filter(activeTab.match);
    if (dateFilter === "today")    filtered = filtered.filter(g => localDateKey(g.commenceTime) === todayKey);
    if (dateFilter === "tomorrow") filtered = filtered.filter(g => localDateKey(g.commenceTime) === tomorrowKey);
    // "Sure" is not a real thing in sports — this hides toss-ups and games where
    // either team hasn't played enough games yet to trust the record.
    if (confFilter > 0) filtered = filtered.filter(g => g.winnerConfidence !== null && g.winnerConfidence >= confFilter);
    // Default view reads like a schedule (kickoff order); probability views rank by confidence
    filtered = confFilter > 0
      ? [...filtered].sort((a, b) => (b.winnerConfidence ?? 0) - (a.winnerConfidence ?? 0))
      : [...filtered].sort((a, b) => new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime());
    const byLeague = new Map<string, GamePrediction[]>();
    for (const g of filtered) {
      if (!byLeague.has(g.league)) byLeague.set(g.league, []);
      byLeague.get(g.league)!.push(g);
    }
    return LEAGUE_ORDER
      .map(l => ({ league: l, games: byLeague.get(l) ?? [] }))
      .filter(l => l.games.length > 0);
  }, [games, activeTab, dateFilter, confFilter, todayKey, tomorrowKey]);

  const totalFiltered = grouped.reduce((s, l) => s + l.games.length, 0);

  const comboGames = games.filter(g => comboIds.has(g.id));
  const comboProbability = comboGames.length > 0
    ? comboGames.reduce((p, g) => p * ((g.winnerConfidence ?? 0) / 100), 1) * 100
    : null;

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0D0B1A]">
        <svg className="animate-spin text-emerald-500" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      </div>
    );
  }

  const skeletons = Array.from({ length: 6 });

  return (
    <div className="flex flex-col min-h-screen bg-[#0D0B1A] text-[#F1F5F9]">
      <Topbar />
      <div className="flex flex-1 !pb-36">
        <main className="app-ambient min-w-0 flex-1 max-w-6xl mx-auto w-full px-3 py-4 page-enter">

          {/* Header */}
          <div className="mb-5 text-center">
            <div className="flex items-center justify-center gap-2.5 mb-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/>
              </svg>
              <h1 className="text-2xl font-black tracking-tight text-gradient-green">Game Predictions</h1>
            </div>
            <p className="text-xs text-[#4B5675] max-w-lg mx-auto">
              Win probability from each team&rsquo;s season record (log5 method) — not betting odds, for informational purposes only.
            </p>
            <Link href="/sports/track-record" className="text-[10px] text-sky-400 hover:text-sky-300 font-semibold mt-1.5 inline-block">
              See the model&rsquo;s actual track record →
            </Link>
          </div>

          {/* Combo bar — combined probability of selected picks, not a bet */}
          {comboGames.length > 0 && (
            <div className="bg-violet-500/5 border border-violet-500/25 rounded-2xl p-4 mb-6">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-violet-300">Combo ({comboGames.length} picks)</p>
                <button type="button" onClick={() => setComboIds(new Set())} className="text-[10px] text-[#4B5675] hover:text-[#7B8DB4] font-semibold">Clear</button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {comboGames.map(g => (
                  <span key={g.id} className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-[#13112A] border border-[#252345] text-[#CBD5E1] flex items-center gap-1.5">
                    {g.predictedWinner} <span className="text-violet-300">{g.winnerConfidence}%</span>
                    <button type="button" onClick={() => toggleCombo(g.id)} className="text-[#4B5675] hover:text-rose-400">✕</button>
                  </span>
                ))}
              </div>
              <p className="text-lg font-black font-mono text-violet-300">
                {comboProbability !== null ? comboProbability.toFixed(1) : "0.0"}%
                <span className="text-[10px] font-semibold text-[#4B5675] ml-2">combined probability all picks hit</span>
              </p>
              <p className="text-[9px] text-[#4B5675] mt-1">Picks multiply independently — each additional pick makes the combo less likely, not more. This is a probability calculator, not a bet or a payout.</p>
            </div>
          )}

          {/* Watchlist */}
          {watchlist.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-amber-400">Your Watchlist</h2>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">{watchlist.length}</span>
                </div>
                {notifPerm !== "granted" && (
                  <button type="button" onClick={requestNotifPermission} className="text-[10px] text-sky-400 hover:text-sky-300 font-semibold">
                    {notifPerm === "denied" ? "Alerts blocked in browser settings" : "Enable kickoff alerts"}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {watchlist
                  .map(w => games.find(g => g.id === w.id))
                  .filter((g): g is GamePrediction => g !== undefined)
                  .map(g => (
                    <GameCard key={g.id} g={g} todayKey={todayKey} tomorrowKey={tomorrowKey}
                      watched={true} onToggleWatch={() => toggleWatch(g)}
                      inCombo={comboIds.has(g.id)} onToggleCombo={() => toggleCombo(g.id)} />
                  ))}
              </div>
            </div>
          )}

          {/* Sport tabs — one per sport */}
          {!loading && games.length > 0 && (
            <div className="mb-3 -mx-3 px-3 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-1.5 w-max mx-auto pb-1">
                {SPORT_TABS.map(t => {
                  const count = tabCounts.get(t.id) ?? 0;
                  const active = sportTab === t.id;
                  return (
                    <button key={t.id} type="button" onClick={() => setSportTab(t.id)}
                      className={`shrink-0 flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border transition-colors ${
                        active
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : count === 0
                          ? "bg-[#13112A] text-[#333368] border-[#252345] hover:text-[#4B5675]"
                          : "bg-[#13112A] text-[#7B8DB4] border-[#252345] hover:text-[#F1F5F9] hover:border-[#333368]"
                      }`}>
                      <span aria-hidden>{t.emoji}</span>
                      {t.label}
                      <span className={`text-[9px] font-black px-1.5 py-px rounded-full border ${
                        active ? "bg-emerald-500/15 border-emerald-500/25" : "bg-[#0D0B1A] border-[#252345]"
                      }`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Date + confidence filters */}
          {!loading && games.length > 0 && (
            <div className="flex flex-col items-center gap-2 mb-3">
              <div className="flex items-center justify-center gap-2">
                {(["today", "tomorrow", "all"] as const).map(f => (
                  <button key={f} type="button" onClick={() => setDateFilter(f)}
                    className={`text-xs font-bold px-4 py-2 rounded-xl border transition-colors ${
                      dateFilter === f
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-[#13112A] text-[#4B5675] border-[#252345] hover:text-[#7B8DB4]"
                    }`}>
                    {f === "today" ? "Today" : f === "tomorrow" ? "Tomorrow" : "All Upcoming"}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-center gap-2">
                {([0, 70, 80] as const).map(f => (
                  <button key={f} type="button" onClick={() => setConfFilter(f)}
                    className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                      confFilter === f
                        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                        : "bg-[#13112A] text-[#4B5675] border-[#252345] hover:text-[#7B8DB4]"
                    }`}>
                    {f === 0 ? "All Games" : f === 70 ? "Favorites 70%+" : "Heavy Favorites 80%+"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && games.length > 0 && (
            <p className="text-center text-[10px] text-amber-400/70 mb-6 max-w-md mx-auto">
              Predictions come from each team&rsquo;s own season win rate (log5), not real betting markets — a much
              weaker signal than sportsbook odds. Early-season records especially can be noisy; treat every pick
              here as a rough estimate, not a lock.
            </p>
          )}

          {/* Loading */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {skeletons.map((_, i) => <div key={i} className="h-36 bg-[#13112A] rounded-xl border border-[#252345] animate-pulse" />)}
            </div>
          )}

          {/* Not configured */}
          {!loading && !configured && !failed && (
            <div className="text-center py-16">
              <p className="text-sm font-bold text-[#7B8DB4] mb-1">Game predictions aren&rsquo;t available right now</p>
              <p className="text-xs text-[#4B5675] max-w-sm mx-auto">Try refreshing in a moment.</p>
            </div>
          )}

          {/* Failed */}
          {!loading && failed && (
            <div className="text-center py-16">
              <p className="text-sm font-bold text-[#7B8DB4] mb-1">Couldn&rsquo;t load predictions</p>
              <p className="text-xs text-[#4B5675]">Try refreshing in a moment.</p>
            </div>
          )}

          {/* Empty but configured */}
          {!loading && configured && !failed && games.length === 0 && (
            <div className="text-center py-16">
              <p className="text-sm font-bold text-[#7B8DB4] mb-1">No games in the next 10 days</p>
              <p className="text-xs text-[#4B5675]">Most of these leagues are seasonal — check back when a sport&rsquo;s season is active.</p>
            </div>
          )}

          {/* Configured, has games overall, but none match the current date/league/confidence filter */}
          {!loading && configured && !failed && games.length > 0 && totalFiltered === 0 && (
            <div className="text-center py-16">
              <p className="text-sm font-bold text-[#7B8DB4] mb-1">
                No {activeTab.id === "all" ? "" : `${activeTab.label} `}games {dateFilter === "all" ? "match this filter" : dateFilter}
              </p>
              <p className="text-xs text-[#4B5675]">
                {(tabCounts.get(activeTab.id) ?? 0) === 0 && activeTab.id !== "all"
                  ? `${activeTab.label} has no games in the next 10 days — the season may not be active right now.`
                  : confFilter > 0 ? `Try "All Games" — no picks hit ${confFilter}%+ confidence right now.` : "Try “All Upcoming” to see every scheduled game."}
              </p>
            </div>
          )}

          {/* Games grouped by league */}
          {!loading && !failed && grouped.map(section => (
            <div key={section.league} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold uppercase tracking-widest text-[#7B8DB4]">{section.league}</h2>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">{section.games.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {section.games.map(g => (
                  <GameCard key={g.id} g={g} todayKey={todayKey} tomorrowKey={tomorrowKey}
                    watched={watchlist.some(w => w.id === g.id)} onToggleWatch={() => toggleWatch(g)}
                    inCombo={comboIds.has(g.id)} onToggleCombo={() => toggleCombo(g.id)} />
                ))}
              </div>
            </div>
          ))}

        </main>
      </div>
      <Sidebar />
    </div>
  );
}
