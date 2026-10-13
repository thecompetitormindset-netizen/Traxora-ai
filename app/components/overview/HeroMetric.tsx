"use client";

import Link from "next/link";

// The Overview's lead block, in the shape the reference design uses: one number
// that answers "how did today go", a short plain sentence under it, and a thin
// strip of supporting figures. The number carries the weight through size, not
// colour — colour here still means only up, down or waiting.

type Support = { k: string; v: string; s?: string };

export type HeroMetricProps = {
  /** Tiny label above the number, e.g. "Ideas that passed every check". */
  label: string;
  /** The headline figure itself, pre-formatted. */
  value: string;
  /** Optional unit or qualifier set beside the number at a smaller size. */
  unit?: string;
  /** One plain sentence explaining what the number means. */
  caption?: string;
  /** Small chip to the right of the label — status, not decoration. */
  chip?: { text: string; tone?: "up" | "down" | "wait" | "mute" };
  /** Supporting figures along the bottom of the card. */
  support?: Support[];
  href?: string;
  /** Renders the number muted, for "nothing to show" states. */
  quiet?: boolean;
};

const CHIP_TONE: Record<NonNullable<NonNullable<HeroMetricProps["chip"]>["tone"]>, string> = {
  up:   "text-[var(--mx-up)]",
  down: "text-[var(--mx-down)]",
  wait: "text-[var(--mx-wait)]",
  mute: "text-[var(--mx-text-3)]",
};

export default function HeroMetric({
  label, value, unit, caption, chip, support = [], href, quiet = false,
}: HeroMetricProps) {
  const body = (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <p className="mx-label">{label}</p>
        {chip && (
          <span className={`text-[12px] ${CHIP_TONE[chip.tone ?? "mute"]}`}>{chip.text}</span>
        )}
      </div>

      <p
        className={`mt-3 flex items-baseline gap-2 tabular-nums tracking-[-0.03em] leading-[0.95] ${
          quiet ? "text-[var(--mx-text-3)]" : "text-[var(--mx-text)]"
        }`}
        style={{ fontWeight: 420 }}
      >
        <span className="text-[56px] lg:text-[72px]">{value}</span>
        {unit && <span className="text-[20px] lg:text-[24px] text-[var(--mx-text-3)]">{unit}</span>}
      </p>

      {caption && (
        <p className="mt-3 text-[14px] leading-snug text-[var(--mx-text-2)] max-w-[46ch]">{caption}</p>
      )}

      {support.length > 0 && (
        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
          {support.map(x => (
            <div key={x.k}>
              <dt className="mx-label">{x.k}</dt>
              <dd className="mt-1 text-[18px] tabular-nums text-[var(--mx-text)]">{x.v}</dd>
              {x.s && <dd className="mt-0.5 text-[12px] text-[var(--mx-text-3)]">{x.s}</dd>}
            </div>
          ))}
        </dl>
      )}
    </>
  );

  const shell =
    "block h-full rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-5 lg:p-6";

  return href
    ? <Link href={href} className={`${shell} hover:border-[var(--mx-line-strong)] transition-colors`}>{body}</Link>
    : <div className={shell}>{body}</div>;
}
