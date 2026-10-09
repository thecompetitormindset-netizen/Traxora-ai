"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { haptic } from "../lib/haptics";
import ThemeToggle from "./ThemeToggle";

// ── Navigation model ──────────────────────────────────────────────────────────
// One list drives the desktop rail, the mobile tab bar and the mobile sheets,
// so labels and active states can't drift between them. Every page is
// reachable; nothing is hidden behind a vague flyout.

type NavItem = { name: string; href: string | null; event?: string };
type NavGroup = { id: "workspace" | "markets" | "tools" | "account"; label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    id: "workspace", label: "Workspace", items: [
      { name: "Overview",        href: "/dashboard" },
      { name: "Options",         href: "/options" },
      { name: "Signals",         href: "/analysis" },
      { name: "Paper portfolio", href: "/paper" },
      { name: "Journal",         href: "/journal" },
    ],
  },
  {
    id: "markets", label: "Markets", items: [
      { name: "Stocks",        href: "/explore" },
      { name: "Crypto",        href: "/explore?view=crypto" },
      { name: "Futures",       href: "/intelligence?section=futures" },
      { name: "Sports",        href: "/sports" },
      { name: "Earnings",      href: "/earnings" },
      { name: "IPOs",          href: "/ipo" },
      { name: "News",          href: "/news" },
      { name: "Sentiment",     href: "/market-sentiment" },
      { name: "Top companies", href: "/top-companies" },
    ],
  },
  {
    id: "tools", label: "Tools", items: [
      { name: "Options screener", href: "/intelligence?section=options" },
      { name: "Compare",          href: "/compare" },
      { name: "Stats",            href: "/strategy" },
      { name: "History",          href: "/history" },
      { name: "Ask AI",           href: "/chat" },
      { name: "Morning brief",    href: null, event: "traxora-show-briefing" },
      { name: "Deep scan",        href: null, event: "traxora-open-scanner" },
    ],
  },
  {
    id: "account", label: "Account", items: [
      { name: "Alerts",   href: "/notifications" },
      { name: "Settings", href: "/settings" },
      { name: "Guide",    href: "/guide" },
    ],
  },
];

const group = (id: NavGroup["id"]) => GROUPS.find(g => g.id === id)!;

// Query-aware: "/explore?view=crypto" is active only with that view; plain
// "/explore" only without one. Same for /intelligence sections.
function isActive(item: NavItem, pathname: string, search: string): boolean {
  if (!item.href) return false;
  const [base, query] = item.href.split("?");
  const onPath = pathname === base || pathname.startsWith(base + "/");
  if (!onPath) return false;
  const params = new URLSearchParams(search);
  if (query) {
    const [k, v] = query.split("=");
    return params.get(k) === v;
  }
  // A bare base link doesn't light up when a sibling query link owns the page.
  const siblings = GROUPS.flatMap(g => g.items).filter(i => i.href?.startsWith(base + "?"));
  return !siblings.some(i => isActive(i, pathname, search));
}

// ── Icons (mobile tab bar only) ───────────────────────────────────────────────

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const TabIcon = {
  overview: <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>,
  options:  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}><path d="M4 18 10 12l4 4 6-8"/></svg>,
  markets:  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/></svg>,
  journal:  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}><path d="M6 3.5h10l3 3v14H6z"/><path d="M9.5 10h6M9.5 14h6"/></svg>,
  more:     <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>,
};

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2.5" aria-label="Traxora home">
      <span aria-hidden="true" className="grid place-items-center w-6 h-6 rounded-[6px] bg-[var(--mx-text)] text-[var(--mx-canvas)]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 16 9 10 13 14 21 6"/></svg>
      </span>
      <span className="text-[16px] tracking-[-0.03em] text-[var(--mx-text)]">traxora</span>
    </Link>
  );
}

function NavRow({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const cls = `d-nav-item ${active ? "d-nav-item-active" : ""}`;
  if (item.href) {
    return (
      <Link href={item.href} className={cls} aria-current={active ? "page" : undefined} onClick={onNavigate}>
        {item.name}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={() => { onNavigate?.(); if (item.event) window.dispatchEvent(new Event(item.event)); else router.refresh(); }}>
      {item.name}
    </button>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────

type SheetId = "markets" | "more" | null;

export default function Sidebar() {
  const pathname = usePathname() ?? "";
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState<SheetId>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [peek, setPeek] = useState(false); // collapsed sidebar slid out on edge-hover
  const [navHidden, setNavHidden] = useState(false);
  const lastScrollY = useRef(new WeakMap<EventTarget, number>());

  // Query-dependent active state; usePathname doesn't include the query.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch(window.location.search);
  }, [pathname]);

  // Auto-hide the mobile tab bar on scroll down, reveal on scroll up.
  useEffect(() => {
    const mountedAt = Date.now();
    function onScroll(e: Event) {
      if (Date.now() - mountedAt < 600) return;
      const target = (e.target === document ? document : e.target) as EventTarget | null;
      if (!target) return;
      const el = target instanceof Element ? target : null;
      const y = el ? el.scrollTop : window.scrollY;
      const last = lastScrollY.current.get(target) ?? y;
      lastScrollY.current.set(target, y);
      const delta = y - last;
      if (Math.abs(delta) < 8) return;
      const atBottom = el
        ? y + el.clientHeight >= el.scrollHeight - 48
        : window.innerHeight + y >= document.documentElement.scrollHeight - 48;
      setNavHidden(delta > 0 && y > 80 && !atBottom);
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNavHidden(false);
    setSheet(null);
  }, [pathname]);

  useEffect(() => {
    if (localStorage.getItem("traxora_sidebar_open") === "0") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSidebarOpen(false);
      document.body.classList.add("sidebar-collapsed");
    }
  }, []);

  function toggleSidebar() {
    setPeek(false);
    setSidebarOpen(prev => {
      const next = !prev;
      document.body.classList.toggle("sidebar-collapsed", !next);
      localStorage.setItem("traxora_sidebar_open", next ? "1" : "0");
      return next;
    });
  }

  useEffect(() => {
    if (!sheet) return;
    function handle(e: MouseEvent | TouchEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setSheet(null);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setSheet(null); }
    document.addEventListener("click", handle);
    document.addEventListener("touchstart", handle);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", handle);
      document.removeEventListener("touchstart", handle);
      document.removeEventListener("keydown", onKey);
    };
  }, [sheet]);

  const active = (i: NavItem) => isActive(i, pathname, search);
  const anyActive = (g: NavGroup) => g.items.some(active);
  const ws = group("workspace");

  const TABS = [
    { id: "overview", label: "Overview", icon: TabIcon.overview, href: "/dashboard", on: active(ws.items[0]) },
    { id: "options",  label: "Options",  icon: TabIcon.options,  href: "/options",   on: active(ws.items[1]) },
    { id: "markets",  label: "Markets",  icon: TabIcon.markets,  sheet: "markets" as const, on: anyActive(group("markets")) || sheet === "markets" },
    { id: "journal",  label: "Journal",  icon: TabIcon.journal,  href: "/journal",   on: active(ws.items[4]) },
    { id: "more",     label: "More",     icon: TabIcon.more,     sheet: "more" as const,
      on: sheet === "more" || anyActive(group("tools")) || anyActive(group("account")) || active(ws.items[2]) || active(ws.items[3]) },
  ];

  const sheetGroups: NavGroup[] = sheet === "markets"
    ? [group("markets")]
    : sheet === "more"
      ? [{ id: "workspace", label: "Workspace", items: ws.items.slice(2, 4) }, group("tools"), group("account")]
      : [];

  return (
    <>
      {/* ── Desktop rail ── */}
      {!sidebarOpen && <div className="sidebar-edge-zone" onMouseEnter={() => setPeek(true)} aria-hidden />}
      <aside
        onMouseEnter={() => { if (!sidebarOpen) setPeek(true); }}
        onMouseLeave={() => setPeek(false)}
        className={`sidebar-desktop fixed left-0 top-0 bottom-0 flex-col z-[var(--z-nav)] ${!sidebarOpen && peek ? "sidebar-peek" : ""}`}
      >
        <div className="h-[60px] flex items-center px-3 shrink-0">
          <Wordmark />
        </div>

        <nav data-tour="nav" className="flex-1 overflow-y-auto px-3 pb-4 space-y-6" aria-label="Main navigation">
          {GROUPS.filter(g => g.id !== "account").map(g => (
            <div key={g.id}>
              <p className="mx-label px-2.5 pb-1.5 pt-2">{g.label}</p>
              <div className="space-y-px">
                {g.items.map(i => <NavRow key={i.name} item={i} active={active(i)} />)}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-[var(--mx-line)] px-3 py-3 space-y-px">
          {group("account").items.map(i => <NavRow key={i.name} item={i} active={active(i)} />)}
          <div className="flex items-center justify-between gap-2 pt-2 px-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={toggleSidebar}
              className="h-8 px-2.5 rounded-[7px] text-[12.5px] text-[var(--mx-text-3)] hover:text-[var(--mx-text)] hover:bg-[var(--mx-raised)] transition-colors"
              title={sidebarOpen ? "Hide sidebar" : "Pin sidebar"}
            >
              {sidebarOpen ? "Hide" : "Pin"}
            </button>
          </div>
        </div>
      </aside>

      {!sidebarOpen && (
        <button
          type="button"
          onClick={toggleSidebar}
          className="hidden lg:flex fixed left-3 top-3 z-[var(--z-nav)] w-9 h-9 rounded-[8px] bg-[var(--mx-surface)] border border-[var(--mx-line)] text-[var(--mx-text-2)] hover:text-[var(--mx-text)] items-center justify-center"
          title="Show sidebar"
          aria-label="Show sidebar"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" {...stroke}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
        </button>
      )}

      {/* ── Mobile tab bar + sheets ── */}
      <div
        ref={navRef}
        className={`sidebar-mobile fixed bottom-0 left-0 right-0 z-[var(--z-nav)] transition-transform duration-300 ease-out ${navHidden && !sheet ? "translate-y-[115%]" : "translate-y-0"}`}
      >
        {sheet && (
          <div className="mx-3 mb-2 rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] shadow-[var(--mx-shadow)] max-h-[62vh] overflow-y-auto" role="dialog" aria-label={sheet === "markets" ? "Markets" : "More"}>
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <p className="mx-label">{sheet === "markets" ? "Markets" : "More"}</p>
              <button type="button" onClick={() => setSheet(null)} className="h-8 px-2 text-[13px] text-[var(--mx-text-3)]">Close</button>
            </div>
            {sheetGroups.map(g => (
              <div key={g.label} className="px-2 pb-2">
                {sheet === "more" && <p className="mx-label px-2.5 pt-2 pb-1">{g.label}</p>}
                <div className="grid grid-cols-2 gap-px">
                  {g.items.map(i => <NavRow key={i.name} item={i} active={active(i)} onNavigate={() => setSheet(null)} />)}
                </div>
              </div>
            ))}
            {sheet === "more" && <div className="px-4 pb-4 pt-1"><ThemeToggle /></div>}
          </div>
        )}
        <nav data-tour="nav" className="grid grid-cols-5 bg-[var(--mx-rail)] border-t border-[var(--mx-line)] nav-safe-area" aria-label="Main navigation">
          {TABS.map(t => {
            const inner = (
              <span className={`flex flex-col items-center gap-1 py-2 text-[11px] ${t.on ? "text-[var(--mx-text)]" : "text-[var(--mx-text-3)]"}`}>
                {t.icon}
                {t.label}
              </span>
            );
            return t.href ? (
              <Link key={t.id} href={t.href} onClick={() => haptic.tap()} aria-current={t.on ? "page" : undefined}>{inner}</Link>
            ) : (
              <button key={t.id} type="button" aria-expanded={sheet === t.sheet} onClick={() => { haptic.tap(); setSheet(s => (s === t.sheet ? null : t.sheet!)); }}>
                {inner}
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
