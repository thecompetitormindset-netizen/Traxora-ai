"use client";

import Link from "next/link";

type CardAccent = "green" | "red" | "blue" | "yellow" | "default";

type CardProps = {
  title: string;
  value: string;
  subtitle?: string;
  accent?: CardAccent;
  icon?: string;
  badge?: string;
  href?: string;
};

function getValueColor(value: string, accent: CardAccent) {
  if (value.trim().startsWith("+")) return "text-green-400";
  if (value.trim().startsWith("-")) return "text-red-400";

  switch (accent) {
    case "green":
      return "text-green-400";
    case "red":
      return "text-red-400";
    case "blue":
      return "text-blue-400";
    case "yellow":
      return "text-yellow-400";
    default:
      return "text-white";
  }
}

function getBadgeClasses(badge?: string, accent: CardAccent = "default") {
  if (!badge) return "bg-[#1E1C42] text-gray-300";

  if (badge.trim().startsWith("+")) {
    return "bg-green-500/15 text-green-400";
  }

  if (badge.trim().startsWith("-")) {
    return "bg-red-500/15 text-red-400";
  }

  switch (accent) {
    case "green":
      return "bg-green-500/15 text-green-400";
    case "red":
      return "bg-red-500/15 text-red-400";
    case "blue":
      return "bg-blue-500/15 text-blue-400";
    case "yellow":
      return "bg-yellow-500/15 text-yellow-400";
    default:
      return "bg-[#1E1C42] text-gray-300";
  }
}

export default function Card({
  title,
  value,
  subtitle,
  accent = "default",
  icon,
  badge,
  href,
}: CardProps) {
  const valueColor = getValueColor(value, accent);
  const badgeClasses = getBadgeClasses(badge, accent);

  const content = (
    <div className="bg-[#1A1838] border border-[#1E1C42] rounded-3xl p-5 h-full hover:bg-[#0F172A] transition">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-400">{title}</p>
        {icon ? <span className="text-lg">{icon}</span> : null}
      </div>

      <div className="mt-3">
        <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
        {subtitle ? (
          <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
        ) : null}
      </div>

      {badge ? (
        <div className="mt-3">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badgeClasses}`}
          >
            {badge}
          </span>
        </div>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {content}
      </Link>
    );
  }

  return content;
}
