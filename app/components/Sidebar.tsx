"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// ── Icon Components ──────────────────────────────────────────────────────────

function DashboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="9" height="9" rx="2" />
      <rect x="13" y="2" width="9" height="5" rx="2" />
      <rect x="2" y="13" width="9" height="9" rx="2" />
      <rect x="13" y="9" width="9" height="13" rx="2" />
    </svg>
  );
}

function TradeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {/* Candlestick chart */}
      <line x1="5"  y1="2"  x2="5"  y2="22" />
      <rect x="2"   y="6"   width="6" height="10" rx="0.5" />
      <line x1="12" y1="4"  x2="12" y2="22" />
      <rect x="9"   y="8"   width="6" height="9"  rx="0.5" />
      <line x1="19" y1="3"  x2="19" y2="21" />
      <rect x="16"  y="5"   width="6" height="7"  rx="0.5" />
    </svg>
  );
}

function SignalsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {/* Lightning bolt */}
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function JournalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {/* Open book */}
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <line x1="12" y1="7"  x2="17" y2="7"  />
      <line x1="12" y1="11" x2="17" y2="11" />
      <line x1="12" y1="15" x2="15" y2="15" />
    </svg>
  );
}

function CompeteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {/* Trophy */}
      <path d="M6 9H4a2 2 0 0 0 0 4c0 2.21 1.79 4 4 4h8c2.21 0 4-1.79 4-4a2 2 0 0 0 0-4h-2" />
      <path d="M6 6v3" />
      <path d="M18 6v3" />
      <rect x="6" y="2" width="12" height="4" rx="1" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8"  y1="21" x2="16" y2="21" />
    </svg>
  );
}

function ExploreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {/* Compass */}
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

function PortfolioIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {/* Pie chart */}
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function BriefingIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

// ── Nav config ───────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { name: "Dash",      href: "/dashboard", icon: <DashboardIcon />,  accent: "indigo"   },
  { name: "Trade",     href: "/paper",     icon: <TradeIcon />,      accent: "emerald"  },
  { name: "Signals",   href: "/analysis",  icon: <SignalsIcon />,    accent: "violet"   },
  { name: "Journal",   href: "/journal",   icon: <JournalIcon />,    accent: "sky"      },
  { name: "Compete",   href: "/compete",   icon: <CompeteIcon />,    accent: "amber"    },
  { name: "Explore",   href: "/explore",   icon: <ExploreIcon />,    accent: "teal"     },
  { name: "Portfolio", href: "/portfolio", icon: <PortfolioIcon />,  accent: "rose"     },
  { name: "Settings",  href: "/settings",  icon: <SettingsIcon />,   accent: "slate"    },
] as const;

type NavAccent = typeof NAV_LINKS[number]["accent"];

const ACCENT_ACTIVE: Record<NavAccent, string> = {
  indigo:  "bg-indigo-500/20  text-indigo-300",
  emerald: "bg-emerald-500/20 text-emerald-300",
  violet:  "bg-violet-500/20  text-violet-300",
  sky:     "bg-sky-500/20     text-sky-300",
  amber:   "bg-amber-500/20   text-amber-300",
  teal:    "bg-teal-500/20    text-teal-300",
  rose:    "bg-rose-500/20    text-rose-300",
  slate:   "bg-slate-500/20   text-slate-300",
};

const ACCENT_DOT: Record<NavAccent, string> = {
  indigo:  "bg-indigo-400",
  emerald: "bg-emerald-400",
  violet:  "bg-violet-400",
  sky:     "bg-sky-400",
  amber:   "bg-amber-400",
  teal:    "bg-teal-400",
  rose:    "bg-rose-400",
  slate:   "bg-slate-400",
};

// ── NavItem ──────────────────────────────────────────────────────────────────

type NavItemProps = {
  name: string;
  href: string;
  icon: React.ReactNode;
  accent: NavAccent;
  isActive: boolean;
  showMarketDot?: boolean;
};

function NavItem({ name, href, icon, accent, isActive, showMarketDot }: NavItemProps) {
  return (
    <Link
      href={href}
      className={`relative flex flex-col items-center gap-1 px-3 py-2.5 rounded-[16px] transition-all duration-200 min-w-[52px] ${
        isActive
          ? ACCENT_ACTIVE[accent]
          : "text-[#4B5675] hover:text-[#94A3B8] hover:bg-white/[0.05]"
      }`}
    >
      {showMarketDot && <MarketDot />}
      {isActive && (
        <span className={`absolute bottom-[7px] left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full ${ACCENT_DOT[accent]} opacity-60`} />
      )}
      <span className={`transition-transform duration-200 ${isActive ? "scale-110" : ""}`}>
        {icon}
      </span>
      <span className="text-[10px] font-semibold leading-none tracking-wide">{name}</span>
    </Link>
  );
}

// ── Market status dot ────────────────────────────────────────────────────────

function MarketDot() {
  const now   = new Date();
  const total = now.getUTCHours() * 60 + now.getUTCMinutes();
  const day   = now.getUTCDay();
  const open  = day >= 1 && day <= 5 && total >= 810 && total < 1200;

  return (
    <span
      title={`US Market ${open ? "Open" : "Closed"}`}
      className={`absolute -top-1.5 -right-1.5 w-2.5 h-2.5 rounded-full border-2 border-[#0C1017] ${
        open ? "bg-emerald-400 shadow-[0_0_8px_#10B981]" : "bg-[#4B5675]"
      }`}
    />
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50" aria-label="Main navigation">
      <div className="flex items-center gap-0.5 px-2 py-2 rounded-[22px] bg-[#0C1017]/80 backdrop-blur-2xl border border-white/[0.08] shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)_inset,0_0_60px_rgba(99,102,241,0.08)] overflow-x-auto max-w-[96vw]">

        {NAV_LINKS.map((link) => {
          const isActive =
            pathname === link.href ||
            (link.href !== "/dashboard" && link.href !== "/paper" && link.href !== "/portfolio" && pathname?.startsWith(link.href));

          return (
            <NavItem
              key={link.href}
              name={link.name}
              href={link.href}
              icon={link.icon}
              accent={link.accent}
              isActive={isActive}
              showMarketDot={link.href === "/dashboard"}
            />
          );
        })}

        {/* Separator */}
        <span className="w-px h-8 bg-white/[0.06] mx-1 shrink-0" />

        {/* Morning Briefing */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("traxora-show-briefing"))}
          title="Morning Briefing"
          className="relative flex flex-col items-center gap-1 px-3 py-2.5 rounded-[16px] transition-all duration-200 min-w-[52px] text-[#4B5675] hover:text-[#94A3B8] hover:bg-white/[0.05]"
        >
          <BriefingIcon />
          <span className="text-[10px] font-semibold leading-none tracking-wide">Brief</span>
        </button>

      </div>
    </nav>
  );
}
