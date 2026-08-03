"use client";

import Link from "next/link";
import type { ReactNode, MouseEventHandler } from "react";

type PanelProps = {
  children: ReactNode;
  href?: string;
  external?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
  padding?: "sm" | "md" | "none";
  hover?: boolean;
  className?: string;
};

const PADDING = { sm: "p-3", md: "p-4", none: "" };

// The generic bordered-surface box repeated inline across nearly every page
// (`bg-[#13112A] border border-[#252345] rounded-2xl`) — built on tokens so it
// themes correctly without needing entries in the globals.css light-theme remap.
export default function Panel({
  children,
  href,
  external = false,
  onClick,
  padding = "md",
  hover = true,
  className = "",
}: PanelProps) {
  const base = `bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl ${PADDING[padding]} ${
    hover ? "transition-colors hover:border-[var(--border-hover)]" : ""
  } ${className}`;

  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={base}>
        {children}
      </a>
    );
  }

  if (href) {
    return (
      <Link href={href} className={base}>
        {children}
      </Link>
    );
  }

  return (
    <div className={base} onClick={onClick}>
      {children}
    </div>
  );
}
