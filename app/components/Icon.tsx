// Line icons for the monochrome design. Size defaults to 1em, so an icon is
// as big as the text it sits in.
// They replace the coloured emoji the
// app used to show: same meaning, drawn in the current text colour, so they
// follow light/dark themes and sit quietly next to text.

export type IconName = Name;
type Name =
  | "chart" | "search" | "zap" | "target" | "trend-up" | "trend-down" | "sunrise" | "dot"
  | "rocket" | "calendar" | "radar" | "book" | "news" | "check" | "globe" | "trophy" | "mail"
  | "link" | "scale" | "bell" | "bell-off" | "sparkle" | "phone" | "bot" | "shield" | "alert"
  | "stop" | "clock" | "key" | "box" | "ruler" | "coins" | "lock" | "laptop" | "bank" | "health"
  | "bulb" | "x" | "hand" | "fire";

const P: Record<Name, React.ReactNode> = {
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  zap: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  "trend-up": <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  "trend-down": <><path d="m3 7 6 6 4-4 8 8" /><path d="M15 17h6v-6" /></>,
  sunrise: <><path d="M12 3v4M4.2 9.2l2 2M19.8 9.2l-2 2M2 17h20M7 17a5 5 0 0 1 10 0" /></>,
  dot: <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />,
  rocket: <><path d="M7 17 17 7M9 7h8v8" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  radar: <><path d="M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4" /><circle cx="12" cy="12" r="1.5" /></>,
  book: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11" /></>,
  news: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h10M7 16h6" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  scale: <><path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></>,
  "bell-off": <><path d="M6 16V11a6 6 0 0 1 9-5.2M18 11v5l2 2H8M10 21h4M3 3l18 18" /></>,
  sparkle: <path d="M12 3c.5 4.5 2.5 6.5 7 7-4.5.5-6.5 2.5-7 7-.5-4.5-2.5-6.5-7-7 4.5-.5 6.5-2.5 7-7z" />,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
  bot: <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6" /></>,
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></>,
  stop: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3" /></>,
  box: <><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></>,
  ruler: <><path d="M3 17 17 3l4 4L7 21z" /><path d="M7 13l2 2M10 10l2 2M13 7l2 2" /></>,
  coins: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  laptop: <><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M2 19h20" /></>,
  bank: <><path d="M3 10 12 4l9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 21h18" /></>,
  health: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" /></>,
  bulb: <><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  hand: <><path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7 6 6 0 0 1-5.2-3L3 14.5a1.5 1.5 0 0 1 2.6-1.5L8 15" /></>,
  fire: <path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-3 5-3 8a6 6 0 0 0 6 6z" />,
};

export function Icon({ name, size = "1em", className = "" }: { name: Name; size?: number | string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`inline-block shrink-0 align-[-0.15em] ${className}`}>
      {P[name]}
    </svg>
  );
}

// Old emoji → icon. `null` means the emoji was decoration only and is dropped.
const MAP: Record<string, Name | null> = {
  "📊": "chart", "🔍": "search", "⚡": "zap", "🎯": "target", "📈": "trend-up", "📉": "trend-down",
  "🌅": "sunrise", "🟢": "dot", "🔴": "dot", "🟡": "dot", "🚀": "rocket", "📅": "calendar", "📡": "radar",
  "📓": "book", "📰": "news", "✅": "check", "🌍": "globe", "🏆": "trophy", "📧": "mail", "⛓️": "link",
  "⚖️": "scale", "🔕": "bell-off", "🔔": "bell", "🧠": "sparkle", "✨": "sparkle", "📱": "phone", "🤖": "bot",
  "🛡️": "shield", "⚠️": "alert", "⚠": "alert", "🚨": "alert", "⛔": "stop", "🛑": "stop", "🕐": "clock",
  "🔑": "key", "📦": "box", "📐": "ruler", "💰": "coins", "🔒": "lock", "💻": "laptop", "🏦": "bank",
  "🏥": "health", "💡": "bulb", "❌": "x", "✋": "hand", "🔥": "fire", "🐂": "trend-up", "🐻": "trend-down",
  "👋": null, "🍪": null, "🦄": null, "🎓": null, "🏀": null, "🏈": null, "⚾": null, "🏒": null, "⚽": null,
};

/** Renders the line icon for an old emoji value (data that still stores emoji). */
export function Glyph({ e, size = "1em", className = "" }: { e: string | null | undefined; size?: number | string; className?: string }) {
  if (!e) return null;
  const n = MAP[e];
  if (n === null) return null;
  if (n === undefined) return <>{e}</>;
  return <Icon name={n} size={size} className={className} />;
}

const EMOJI = /(\p{Extended_Pictographic}️?)/u;

/** Removes emoji from plain strings (notifications, log lines, share text). */
export function stripEmoji(s: string): string {
  return s.replace(new RegExp(EMOJI.source, "gu"), "").replace(/\s{2,}/g, " ").trim();
}
