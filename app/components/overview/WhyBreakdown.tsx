"use client";

// The "why is the headline number what it is" card from the reference design:
// the figure above does not stand alone, it gets decomposed into the steps that
// produced it, with the biggest contributor first.
//
// Every row here comes from the scan summary and the engine's own no-trade
// reasons. Nothing is estimated to fill the card — when a stage has no data the
// row is left out rather than shown as zero.

export type WhyRow = {
  label: string;
  /** The count this row accounts for. */
  count: number;
  /** Optional plain-language detail shown under the label. */
  detail?: string;
};

export type WhyBreakdownProps = {
  title: string;
  /** One line under the title saying what the decomposition is of. */
  subtitle?: string;
  rows: WhyRow[];
  /** Denominator for the bars. Defaults to the largest row. */
  total?: number;
  /** Closing sentence, the reference's "Labour and materials explain two thirds of the gap". */
  footnote?: string;
  emptyText?: string;
};

export default function WhyBreakdown({
  title, subtitle, rows, total, footnote, emptyText = "Nothing to break down yet.",
}: WhyBreakdownProps) {
  const present = rows.filter(r => r.count > 0);
  const denom = Math.max(1, total ?? present.reduce((m, r) => Math.max(m, r.count), 0));

  return (
    <section className="h-full rounded-[14px] border border-[var(--mx-line)] bg-[var(--mx-surface)] p-5 lg:p-6">
      <h2 className="text-[15px] text-[var(--mx-text)]">{title}</h2>
      {subtitle && <p className="mt-1 text-[12px] text-[var(--mx-text-3)]">{subtitle}</p>}

      {present.length === 0 ? (
        <p className="mt-5 text-[13px] text-[var(--mx-text-3)]">{emptyText}</p>
      ) : (
        <ul className="mt-5 space-y-3.5">
          {present.map(r => {
            const pct = Math.min(100, Math.round((r.count / denom) * 100));
            return (
              <li key={r.label}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[13px] text-[var(--mx-text-2)] min-w-0">{r.label}</span>
                  <span className="text-[13px] tabular-nums text-[var(--mx-text)] shrink-0">{r.count.toLocaleString("en-US")}</span>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-[var(--mx-raised)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--mx-control)]"
                    style={{ width: `${pct}%` }}
                    aria-hidden="true"
                  />
                </div>
                {r.detail && <p className="mt-1.5 text-[12px] text-[var(--mx-text-3)]">{r.detail}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {footnote && (
        <p className="mt-5 pt-4 border-t border-[var(--mx-line)] text-[12px] leading-snug text-[var(--mx-text-3)]">
          {footnote}
        </p>
      )}
    </section>
  );
}
