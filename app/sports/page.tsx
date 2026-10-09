"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { scopedKey } from "../lib/userState";
import { syncFetch } from "../lib/syncFetch";
import type { SportEvent } from "../lib/sportsEvents";

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
  "Premier League", "Champions League", "Europa League", "La Liga", "Serie A", "Bundesliga", "Ligue 1",
  "Eredivisie", "Championship", "Liga MX", "MLS",
];

// One tab per sport. Soccer bundles its leagues; every other sport stands alone.
const SPORT_TABS: Array<{ id: string; label: string; match: (g: GamePrediction) => boolean }> = [
  { id: "all",    label: "All", match: () => true },
  { id: "nfl",    label: "NFL", match: g => g.league === "NFL" },
  { id: "nba",    label: "NBA", match: g => g.league === "NBA" },
  { id: "mlb",    label: "MLB", match: g => g.league === "MLB" },
  { id: "nhl",    label: "Ice hockey (NHL)", match: g => g.league === "NHL" },
  { id: "soccer", label: "Soccer", match: g => g.leagueGroup === "Soccer" },
  { id: "cfb",    label: "College Football", match: g => g.league === "College Football" },
  { id: "cbb",    label: "College Basketball", match: g => g.league === "College Basketball" },
  { id: "wnba",   label: "WNBA", match: g => g.league === "WNBA" },
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
  const n = new Notification(`${item.awayTeam} @ ${item.homeTeam} starting soon`, {
    body: `${item.league} · kickoff at ${fmtKickoff(item.commenceTime)}`,
    icon: "/icon-192.png",
    tag: `sports-${item.id}`,
  });
  n.onclick = () => { window.focus(); window.location.href = "/sports"; n.close(); };
}

// ── Game card ─────────────────────────────────────────────────────────────────

/** Win chance in words; the number stays small and secondary. */
function chanceWords(p: number): string {
  if (p >= 75) return "Very likely to win";
  if (p >= 60) return "Likely to win";
  return "Close game — slight favourite";
}

function GameCard({ g, todayKey, tomorrowKey, watched, onToggleWatch }: {
  g: GamePrediction; todayKey: string; tomorrowKey: string; watched: boolean; onToggleWatch: () => void;
}) {
  const gameDay = localDateKey(g.commenceTime);
  const when = new Date(g.commenceTime).toLocaleString("en-US", gameDay === todayKey || gameDay === tomorrowKey
    ? { hour: "numeric", minute: "2-digit" } : { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const day = gameDay === todayKey ? "Today" : gameDay === tomorrowKey ? "Tomorrow" : null;
  const pick = g.predictedWinner !== null && g.winnerConfidence !== null;
  const team = (name: string, rec: string | null) => (
    <div className="flex items-center justify-between gap-2">
      <span className={`text-[15px] truncate ${g.predictedWinner === name ? "text-[var(--mx-text)]" : "text-[var(--mx-text-2)]"}`}>{name}</span>
      {rec && <span className="text-[12px] text-[var(--mx-text-3)] shrink-0" title="Wins-losses this season">{rec}</span>}
    </div>
  );
  return (
    <li className="rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-[var(--mx-text-3)]">{g.league} · {day ? `${day}, ` : ""}{when}</span>
        <button type="button" onClick={onToggleWatch} aria-pressed={watched}
          className={`h-7 px-2.5 rounded-full border text-[12px] transition-colors ${watched ? "border-[var(--mx-text)] text-[var(--mx-text)]" : "border-[var(--mx-line)] text-[var(--mx-text-3)] hover:text-[var(--mx-text)]"}`}>
          {watched ? "Following" : "Follow"}
        </button>
      </div>
      <div className="space-y-1">
        {team(g.awayTeam, g.awayRecord)}
        <p className="text-[12px] text-[var(--mx-text-3)]">at</p>
        {team(g.homeTeam, g.homeRecord)}
      </div>
      <div className="pt-3 border-t border-[var(--mx-line)]">
        {pick ? (
          <p className="text-[14px]">
            {g.predictedWinner} <span className="text-[var(--mx-text-3)]">— {chanceWords(g.winnerConfidence!).toLowerCase()} ({Math.round(g.winnerConfidence!)}%)</span>
          </p>
        ) : (
          <p className="text-[13px] text-[var(--mx-text-3)]">Too early in the season to say.</p>
        )}
      </div>
    </li>
  );
}

/** A scheduled match or event in a sport we don't predict. */
function EventCard({ e, todayKey, tomorrowKey }: { e: SportEvent; todayKey: string; tomorrowKey: string }) {
  const d = localDateKey(e.start);
  const day = d === todayKey ? "Today" : d === tomorrowKey ? "Tomorrow" : new Date(e.start).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const range = e.end && localDateKey(e.end) !== d ? ` – ${new Date(e.end).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "";
  return (
    <li className="rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-[var(--mx-text-3)] truncate">{e.league}</span>
        {e.live && <span className="shrink-0 text-[12px] px-2 py-0.5 rounded-full border border-[var(--mx-text)] text-[var(--mx-text)]">Live now</span>}
      </div>
      <p className="text-[15px] text-[var(--mx-text)] leading-snug">{e.name}</p>
      <p className="text-[13px] text-[var(--mx-text-2)]">{e.live && range ? `On now${range}` : `${day}${range || `, ${time}`}`}</p>
      {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-[13px] underline text-[var(--mx-text-2)]">Watch the games →</a>}
    </li>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SportsPage() {
  const { status, data: session } = useSession();

  const [games,      setGames]      = useState<GamePrediction[]>([]);
  const [events,     setEvents]     = useState<SportEvent[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading,    setLoading]    = useState(true);
  const [failed,     setFailed]     = useState(false);
  const [sportTab,   setSportTab]   = useState("all");
  const [dateFilter, setDateFilter] = useState<"today" | "tomorrow" | "all">("today");

  const [watchlist,  setWatchlist]  = useState<WatchItem[]>([]);
  const [notifPerm,  setNotifPerm]  = useState<NotificationPermission>("default");
  const watchlistInitialized = useRef(false);

  const todayKey    = useMemo(() => new Date().toLocaleDateString("en-CA"), []);
  const tomorrowKey = useMemo(() => new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA"), []);


  useEffect(() => {
    fetch("/api/sports/events", { cache: "no-store" }).then(r => (r.ok ? r.json() : null))
      .then((d: { events?: SportEvent[] } | null) => setEvents(d?.events ?? [])).catch(() => {});
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

    syncFetch("/api/user/sports-watchlist")
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
      syncFetch("/api/user/sports-watchlist", {
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

  const eventSports = useMemo(() => [...new Set(events.map(e => e.sport))].sort(), [events]);
  const eventSport = sportTab.startsWith("ev:") ? sportTab.slice(3) : null;
  const activeTab = useMemo(() => eventSport ? { id: sportTab, label: eventSport, match: () => false } : SPORT_TABS.find(t => t.id === sportTab) ?? SPORT_TABS[0], [eventSport, sportTab]);
  const eventsShown = useMemo(() => {
    let list = eventSport ? events.filter(e => e.sport === eventSport) : sportTab === "all" ? events : [];
    if (dateFilter === "today") list = list.filter(e => e.live || localDateKey(e.start) === todayKey);
    if (dateFilter === "tomorrow") list = list.filter(e => localDateKey(e.start) === tomorrowKey);
    const bySport = new Map<string, SportEvent[]>();
    for (const e of list) bySport.set(e.sport, [...(bySport.get(e.sport) ?? []), e]);
    return [...bySport.entries()];
  }, [events, eventSport, sportTab, dateFilter, todayKey, tomorrowKey]);

  const grouped = useMemo(() => {
    let filtered = games.filter(activeTab.match);
    if (dateFilter === "today")    filtered = filtered.filter(g => localDateKey(g.commenceTime) === todayKey);
    if (dateFilter === "tomorrow") filtered = filtered.filter(g => localDateKey(g.commenceTime) === tomorrowKey);
    filtered = [...filtered].sort((a, b) => new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime());
    const byLeague = new Map<string, GamePrediction[]>();
    for (const g of filtered) {
      if (!byLeague.has(g.league)) byLeague.set(g.league, []);
      byLeague.get(g.league)!.push(g);
    }
    return LEAGUE_ORDER
      .map(l => ({ league: l, games: byLeague.get(l) ?? [] }))
      .filter(l => l.games.length > 0);
  }, [games, activeTab, dateFilter, todayKey, tomorrowKey]);

  const totalFiltered = grouped.reduce((s, l) => s + l.games.length, 0) + eventsShown.reduce((s, [, l]) => s + l.length, 0);

  const shownTabs = SPORT_TABS.filter(t => t.id === "all" || (tabCounts.get(t.id) ?? 0) > 0);
  const followed = watchlist.map(w => games.find(g => g.id === w.id)).filter((g): g is GamePrediction => g !== undefined);
  const pill = (on: boolean) => `h-9 px-4 rounded-full border text-[14px] shrink-0 transition-colors ${on ? "border-[var(--mx-text)] bg-[var(--mx-text)] text-[var(--mx-canvas)]" : "border-[var(--mx-line)] text-[var(--mx-text-2)] hover:text-[var(--mx-text)]"}`;
  const grid = "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3";

  return (
    <div className="flex min-h-screen text-[var(--mx-text)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="min-w-0 flex-1 p-4 lg:p-8 !pb-36 page-enter">
          <div className="max-w-6xl mx-auto w-full space-y-6">
            <header>
              <h1 className="text-[30px] lg:text-[40px] leading-[1.05] tracking-[-0.03em]">Sports</h1>
              <p className="mt-2 text-[15px] text-[var(--mx-text-2)] max-w-[62ch]">
                What’s on across many sports — from football and cricket to chess and tennis. For the big team leagues we also show who’s more likely to win, based on this season’s record. Just for fun — not betting advice.
              </p>
              <Link href="/sports/track-record" className="mt-2 inline-block text-[13px] text-[var(--mx-text-2)] underline hover:text-[var(--mx-text)]">How often has this been right?</Link>
            </header>

            {!loading && (games.length > 0 || events.length > 0) && (
              <div className="space-y-3">
                <div className="flex gap-2" role="group" aria-label="Day">
                  {(["today", "tomorrow", "all"] as const).map(f => (
                    <button key={f} type="button" onClick={() => setDateFilter(f)} className={pill(dateFilter === f)} aria-pressed={dateFilter === f}>
                      {f === "today" ? "Today" : f === "tomorrow" ? "Tomorrow" : "This week"}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4" role="group" aria-label="Sport">
                  {shownTabs.map(t => (
                    <button key={t.id} type="button" onClick={() => setSportTab(t.id)} className={pill(sportTab === t.id)} aria-pressed={sportTab === t.id}>
                      {t.id === "all" ? "All sports" : t.label}
                    </button>
                  ))}
                  {eventSports.map(sp => (
                    <button key={sp} type="button" onClick={() => setSportTab(`ev:${sp}`)} className={pill(sportTab === `ev:${sp}`)} aria-pressed={sportTab === `ev:${sp}`}>
                      {sp}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {followed.length > 0 && (
              <section aria-labelledby="follow-h" className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="follow-h" className="text-[18px]">Games you follow</h2>
                  {notifPerm !== "granted" && (
                    <button type="button" onClick={requestNotifPermission} className="text-[13px] text-[var(--mx-text-2)] underline hover:text-[var(--mx-text)]">
                      {notifPerm === "denied" ? "Reminders are blocked in your browser" : "Remind me before they start"}
                    </button>
                  )}
                </div>
                <ul className={grid}>
                  {followed.map(g => <GameCard key={g.id} g={g} todayKey={todayKey} tomorrowKey={tomorrowKey} watched onToggleWatch={() => toggleWatch(g)} />)}
                </ul>
              </section>
            )}

            {(loading || status === "loading") && (
              <ul className={grid}>{Array.from({ length: 6 }, (_, i) => <li key={i} className="h-40 rounded-[14px] bg-[var(--mx-raised)] animate-pulse" />)}</ul>
            )}

            {!loading && (failed || !configured) && (
              <p className="py-12 text-center text-[15px] text-[var(--mx-text-2)]">We couldn’t load the games right now. Please try again in a moment.</p>
            )}

            {!loading && !failed && configured && games.length === 0 && (
              <p className="py-12 text-center text-[15px] text-[var(--mx-text-2)]">No games in the next 7 days. Check back when a season starts.</p>
            )}

            {!loading && !failed && games.length > 0 && totalFiltered === 0 && (
              <div className="py-12 text-center">
                <p className="text-[15px] text-[var(--mx-text-2)]">No {activeTab.id === "all" ? "" : `${activeTab.label} `}games {dateFilter === "today" ? "today" : dateFilter === "tomorrow" ? "tomorrow" : "this week"}.</p>
                {dateFilter !== "all" && <button type="button" onClick={() => setDateFilter("all")} className="mt-3 text-[14px] underline">See this week</button>}
              </div>
            )}

            {!loading && !failed && (eventSport ? [] : grouped).map(section => (
              <section key={section.league} aria-labelledby={`lg-${section.league}`} className="space-y-3">
                <h2 id={`lg-${section.league}`} className="text-[18px]">{section.league} <span className="text-[14px] text-[var(--mx-text-3)]">{section.games.length} {section.games.length === 1 ? "game" : "games"}</span></h2>
                <ul className={grid}>
                  {section.games.map(g => (
                    <GameCard key={g.id} g={g} todayKey={todayKey} tomorrowKey={tomorrowKey}
                      watched={watchlist.some(w => w.id === g.id)} onToggleWatch={() => toggleWatch(g)} />
                  ))}
                </ul>
              </section>
            ))}

            {!loading && eventsShown.length > 0 && (
              <div className="space-y-6">
                {!eventSport && <h2 className="text-[20px] pt-2">More sports <span className="text-[14px] text-[var(--mx-text-3)]">schedules only — we don’t predict these</span></h2>}
                {eventsShown.map(([sport, list]) => (
                  <section key={sport} aria-labelledby={`ev-${sport}`} className="space-y-3">
                    <h3 id={`ev-${sport}`} className="text-[18px]">{sport} <span className="text-[14px] text-[var(--mx-text-3)]">{list.length} {list.length === 1 ? "event" : "events"}</span></h3>
                    {eventSport && <p className="text-[13px] text-[var(--mx-text-3)] -mt-1">Schedule only — we don’t make predictions for {sport.toLowerCase()}.</p>}
                    <ul className={grid}>{(eventSport ? list : list.slice(0, 6)).map(e => <EventCard key={e.id} e={e} todayKey={todayKey} tomorrowKey={tomorrowKey} />)}</ul>
                    {!eventSport && list.length > 6 && (
                      <button type="button" onClick={() => setSportTab(`ev:${sport}`)} className="text-[14px] underline text-[var(--mx-text-2)] hover:text-[var(--mx-text)]">See all {sport.toLowerCase()} ({list.length})</button>
                    )}
                  </section>
                ))}
              </div>
            )}

            {!loading && <p className="text-[12.5px] text-[var(--mx-text-3)]">Horse racing and boxing aren’t included yet — there’s no free public schedule for them.</p>}
          </div>
        </main>
      </div>
    </div>
  );
}
