"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { haptic } from "../lib/haptics";
import ThemeToggle from "./ThemeToggle";

// ── Icons (20px) ──────────────────────────────────────────────────────────────

const Icon = {
  Dashboard: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="9" height="9" rx="2.5"/><rect x="13" y="2" width="9" height="5" rx="2.5"/>
      <rect x="2" y="13" width="9" height="9" rx="2.5"/><rect x="13" y="9" width="9" height="13" rx="2.5"/>
    </svg>
  ),
  Signals: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  Trade: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2.5"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
    </svg>
  ),
  Wheel: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="2"/>
    </svg>
  ),
  More: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  Chevron: ({ open }: { open: boolean }) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={`transition-transform duration-200 ${open ? "rotate-180" : "rotate-0"}`}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
  LogoMark: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
};

// ── Sub-item data ─────────────────────────────────────────────────────────────

const SIGNALS_ITEMS = [
  { name: "Sentiment", desc: "Market pulse & deep report",    href: "/market-sentiment",  emoji: "🌡️", event: null },
  { name: "Analyse",   desc: "Deep AI signal for any ticker", href: "/analysis",          emoji: "⚡",  event: null },
  { name: "Compare",   desc: "Compare two stocks side by side", href: "/compare",         emoji: "⚖️",  event: null },
  { name: "Markets",   desc: "Futures, options & plays",      href: "/intelligence",      emoji: "📊",  event: null },
  { name: "Earnings",  desc: "Upcoming earnings calendar",    href: "/earnings",          emoji: "📅",  event: null },
  { name: "News",      desc: "Filterable market news feed",   href: "/news",              emoji: "📰",  event: null },
  { name: "IPO",       desc: "New listings & outlook",        href: "/ipo",               emoji: "🚀",  event: null },
  { name: "Brief",     desc: "Morning market briefing",       href: null,                 emoji: "🌅",  event: "traxora-show-briefing" },
];

const TRADE_ITEMS = [
  { name: "Journal",  desc: "AI trade journal",         href: "/journal",  emoji: "📖" },
  { name: "Stats",    desc: "Your performance",         href: "/strategy", emoji: "📈" },
  { name: "Planner",  desc: "Size your positions",      href: "/paper",    emoji: "🎯" },
  { name: "History",  desc: "Closed trades & signals",  href: "/history",  emoji: "🗂️" },
  { name: "AI Chat",  desc: "Ask the AI anything",      href: "/chat",     emoji: "💬" },
];

const SETTINGS_ITEMS = [
  { name: "Settings", desc: "Account & preferences",    href: "/settings", emoji: "⚙️" },
  { name: "Guide",    desc: "How to use Traxora",       href: "/guide",    emoji: "📚" },
];

// ── Market dot ────────────────────────────────────────────────────────────────

function MarketDot() {
  const now   = new Date();
  const total = now.getUTCHours() * 60 + now.getUTCMinutes();
  const day   = now.getUTCDay();
  const open  = day >= 1 && day <= 5 && total >= 810 && total < 1200;
  return (
    <span className={`absolute top-0 right-0 w-2 h-2 rounded-full border-2 border-[#0A0815] ${
      open ? "bg-emerald-400" : "bg-[#4B5675]"
    }`} />
  );
}

// ── Mobile sub-panel grid ─────────────────────────────────────────────────────

type SubItem = { name: string; desc: string; href: string | null; emoji: string; event?: string | null };

function SubPanel({ items, onClose, pathname }: { items: SubItem[]; onClose: () => void; pathname: string }) {
  const router = useRouter();

  function handleClick(item: SubItem) {
    haptic.light();
    onClose();
    if (item.href !== null) router.push(item.href);
    else if (item.event) window.dispatchEvent(new Event(item.event));
  }

  return (
    <div className="stagger-container flex flex-wrap justify-center gap-2 p-1">
      {items.map((item) => {
        const active = item.href && (pathname === item.href || pathname?.startsWith(item.href + "/"));
        return (
          <button
            key={item.name}
            type="button"
            onClick={() => handleClick(item)}
            className={`press-scale flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl text-center ${
              active
                ? "bg-emerald-500/15 border border-emerald-500/30"
                : "bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.09]"
            }`}
          >
            <span className="text-xl leading-none">{item.emoji}</span>
            <div>
              <p className={`text-[10px] font-bold leading-none mb-0.5 ${active ? "text-emerald-300" : "text-[#E2E8F0]"}`}>
                {item.name}
              </p>
              <p className="text-[8px] text-[#4B5675] leading-tight">{item.desc}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Desktop nav primitives ────────────────────────────────────────────────────

function DNavLink({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link href={href} className={`d-nav-item ${active ? "d-nav-item-active" : ""}`}>
      <span className="w-[18px] shrink-0">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function DNavGroup({
  icon, label, active, open, onToggle, items, pathname,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  items: SubItem[];
  pathname: string;
}) {
  const router = useRouter();
  function handleSub(item: SubItem) {
    haptic.light();
    if (item.href) router.push(item.href);
    else if (item.event) window.dispatchEvent(new Event(item.event as string));
  }
  return (
    <div>
      <button type="button" onClick={onToggle} className={`d-nav-item ${active ? "d-nav-item-active" : ""}`}>
        <span className="w-[18px] shrink-0">{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        <Icon.Chevron open={open} />
      </button>
      {open && (
        <div className="mt-0.5 ml-2 space-y-0.5">
          {items.filter(i => i.href !== null || i.event).map((item) => {
            const isActive = item.href && (pathname === item.href || pathname?.startsWith(item.href + "/"));
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => handleSub(item)}
                className={`d-nav-item d-nav-sub ${isActive ? "d-nav-sub-active" : ""}`}
              >
                <span className="text-sm leading-none mr-1">{item.emoji}</span>
                {item.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────

type PanelId = "signals" | "trade" | "settings" | null;

export default function Sidebar() {
  const pathname        = usePathname();
  const [open, setOpen] = useState<PanelId>(null);
  const navRef          = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(null); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent | TouchEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, [open]);

  function toggle(id: PanelId) { haptic.tap(); setOpen(prev => prev === id ? null : id); }

  const signalsActive  = ["/analysis","/intelligence","/ipo","/market-sentiment","/earnings","/news","/compare"].some(p => pathname?.startsWith(p));
  const tradeActive    = ["/paper","/journal","/history","/strategy","/chat"].some(p => pathname?.startsWith(p));
  const settingsActive = ["/settings","/guide"].some(p => pathname?.startsWith(p));
  const dashActive     = pathname === "/dashboard";
  const wheelActive    = pathname?.startsWith("/wheel") ?? false;

  const NAV = [
    { id: "dash"     as const, label: "Dash",    icon: <Icon.Dashboard />, active: dashActive,                        href: "/dashboard", panel: null              },
    { id: "signals"  as const, label: "Signals", icon: <Icon.Signals />,  active: signalsActive || open==="signals", href: null,         panel: "signals" as PanelId },
    { id: "wheel"    as const, label: "Wheel",   icon: <Icon.Wheel />,    active: wheelActive,                        href: "/wheel",     panel: null              },
    { id: "trade"    as const, label: "Trade",   icon: <Icon.Trade />,    active: tradeActive   || open==="trade",   href: null,         panel: "trade"   as PanelId },
    { id: "settings" as const, label: "More",    icon: <Icon.More />,     active: settingsActive|| open==="settings",href: null,         panel: "settings"as PanelId },
  ];

  const panelItems: Record<string, SubItem[]> = {
    signals: SIGNALS_ITEMS, trade: TRADE_ITEMS, settings: SETTINGS_ITEMS,
  };

  return (
    <>
      {/* ── Desktop persistent sidebar (hidden on mobile) ── */}
      <aside className="sidebar-desktop fixed left-0 top-0 bottom-0 w-60 flex-col z-50 bg-[var(--bg-surface)] border-r border-[var(--border)]">

        {/* Brand */}
        <div className="h-16 flex items-center px-4 border-b border-[var(--border)] shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="logo-icon-bg w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0">
              <Icon.LogoMark />
            </div>
            <span className="font-black text-[14px] text-[var(--text-primary)] tracking-tight">Traxora AI</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5" aria-label="Main navigation">
          {/* Dashboard */}
          <DNavLink href="/dashboard" icon={<Icon.Dashboard />} label="Dashboard" active={dashActive} />

          {/* Signals group */}
          <DNavGroup
            icon={<Icon.Signals />}
            label="Signals"
            active={signalsActive}
            open={open === "signals"}
            onToggle={() => toggle("signals")}
            items={SIGNALS_ITEMS}
            pathname={pathname ?? ""}
          />

          {/* Wheel */}
          <DNavLink href="/wheel" icon={<Icon.Wheel />} label="Wheel" active={wheelActive} />

          {/* Trade group */}
          <DNavGroup
            icon={<Icon.Trade />}
            label="Trade"
            active={tradeActive}
            open={open === "trade"}
            onToggle={() => toggle("trade")}
            items={TRADE_ITEMS}
            pathname={pathname ?? ""}
          />
        </nav>

        {/* Bottom: settings + theme */}
        <div className="shrink-0 border-t border-[var(--border)] py-3 px-2 space-y-0.5">
          {SETTINGS_ITEMS.map(item => (
            <DNavLink
              key={item.name}
              href={item.href!}
              icon={<span className="text-sm leading-none">{item.emoji}</span>}
              label={item.name}
              active={!!(item.href && pathname?.startsWith(item.href))}
            />
          ))}
          <div className="px-1 pt-2">
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* ── Mobile bottom nav — EXACTLY as before, just hidden on lg+ ── */}
      <div ref={navRef} className="sidebar-mobile fixed bottom-0 left-0 right-0 z-50 flex-col items-center pointer-events-none">

        {/* Sub-panel */}
        <div
          className={`pointer-events-auto w-full max-w-sm px-3 transition-all duration-300 ease-out overflow-hidden ${
            open ? "mb-2 opacity-100 translate-y-0 max-h-[420px]" : "mb-0 opacity-0 translate-y-4 pointer-events-none max-h-0"
          }`}
        >
          <div className="sidebar-sub-panel panel-enter glass-strong rounded-2xl border border-white/[0.08] shadow-2xl p-3">
            <div className="flex items-center justify-between mb-2.5 px-1 subpanel-fade">
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[#4B5675]">
                {open === "signals" ? "Markets & Analysis" : open === "trade" ? "Journal & Tools" : "Account & Help"}
              </p>
              <button type="button" onClick={() => { haptic.tick(); setOpen(null); }} aria-label="Close"
                className="press-scale w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[#4B5675] hover:text-[#7B8DB4] transition-colors">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            {open && panelItems[open] && (
              <SubPanel items={panelItems[open]} onClose={() => setOpen(null)} pathname={pathname ?? ""} />
            )}
          </div>
        </div>

        {/* Floating pill nav */}
        <div className="pointer-events-auto flex justify-center px-4 w-full nav-safe-area">
          <nav
            className="sidebar-nav-pill sidebar-nav-glow glass-strong flex items-center gap-0.5 rounded-2xl border border-white/[0.10] px-1.5 py-1.5"
            aria-label="Main navigation"
          >
            {NAV.map((item) => {
              const isActive = item.active;
              const isOpen   = item.panel && open === item.panel;

              const inner = (
                <span className={`relative flex flex-col items-center gap-1 w-14 py-2 rounded-xl transition-all duration-150 ${
                  isActive || isOpen
                    ? "bg-emerald-500/15 text-emerald-400 sidebar-item-active sidebar-active-glow"
                    : "text-[#3D4F6B] hover:text-[#7B8DB4] hover:bg-white/[0.06]"
                }`}>
                  {item.id === "dash" && <MarketDot />}
                  <span className={`icon-pop transition-transform duration-150 ${isActive || isOpen ? "scale-110 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" : ""}`}>
                    {item.icon}
                  </span>
                  <span className="text-[9px] font-bold leading-none tracking-wide">{item.label}</span>
                </span>
              );

              if (item.href) {
                return (
                  <Link key={item.id} href={item.href}
                    onClick={() => haptic.tap()}
                    className="nav-press active:scale-90 rounded-xl">
                    {inner}
                  </Link>
                );
              }
              return (
                <button key={item.id} type="button" onClick={() => toggle(item.panel!)}
                  className="nav-press active:scale-90 rounded-xl">
                  {inner}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
}
