"use client";

import Link from "next/link";

// The reference design's "Needs you" list: the few things actually worth acting
// on, each with the claim on one line and the reason on the next, ordered by
// how much they matter rather than by where the data came from.
//
// An empty list is a real answer here, not a failure state — "nothing needs you"
// is the most useful thing this card can say on a quiet day.

export type NeedsYouItem = {
  id: string;
  /** The claim, e.g. "3 options ideas passed every check". */
  title: string;
  /** One line saying why it is here and what to do. */
  reason: string;
  href: string;
  /** Small leading figure, e.g. a count. */
  badge?: string;
  tone?: "up" | "down" | "wait" | "mute";
};

const TONE: Record<NonNullable<NeedsYouItem["tone"]>, string> = {
  up:   "text-[var(--mx-up)]",
  down: "text-[var(--mx-down)]",
  wait: "text-[var(--mx-wait)]",
  mute: "text-[var(--mx-text-3)]",
};

export default function NeedsYou({
  items, title = "Needs you", emptyText = "Nothing needs your attention right now.",
}: {
  items: NeedsYouItem[];
  title?: string;
  emptyText?: string;
}) {
  return (
    <section className="h-full rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-5 lg:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] text-[var(--mx-text)]">{title}</h2>
        {items.length > 0 && (
          <span className="text-[12px] tabular-nums text-[var(--mx-text-3)]">
            {items.length} {items.length === 1 ? "thing" : "things"}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-5 text-[13px] text-[var(--mx-text-3)]">{emptyText}</p>
      ) : (
        <ul className="mt-4 -mx-5 lg:-mx-6">
          {items.map((it, i) => (
            <li key={it.id} className={i > 0 ? "border-t border-[var(--mx-line)]" : ""}>
              <Link
                href={it.href}
                className="flex items-start gap-3 px-5 lg:px-6 py-3.5 hover:bg-[var(--mx-raised)] transition-colors"
              >
                {it.badge && (
                  <span className={`shrink-0 mt-0.5 text-[13px] tabular-nums ${TONE[it.tone ?? "mute"]}`}>
                    {it.badge}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] leading-snug text-[var(--mx-text)]">{it.title}</span>
                  <span className="block mt-0.5 text-[12px] leading-snug text-[var(--mx-text-3)]">{it.reason}</span>
                </span>
                <span aria-hidden="true" className="shrink-0 mt-0.5 text-[13px] text-[var(--mx-text-3)]">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
