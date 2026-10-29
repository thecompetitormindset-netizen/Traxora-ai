// Running several scheduled jobs from one cron slot.
//
// Vercel registers a limited number of cron entries, and the project declared
// eight. Only three were actually registered — and one of the five dropped was
// daily-picks, the job the whole picks system depends on. A scheduled job that
// silently never runs is worse than one that fails loudly: nothing reports it,
// and the feature simply never produces anything.
//
// So jobs are grouped: a slot runs its steps in sequence rather than each
// needing an entry of its own. Each step is an ordinary route, still callable
// on its own, and still gated by CRON_SECRET — the chain presents the same
// secret a scheduler would.
//
// Two things make this safe to leave unattended.
//
// A shared deadline. A serverless invocation has under a minute, and a chain
// that overran would be killed partway with no record of where it stopped.
// Steps are given what is left of the budget and anything that does not fit is
// SKIPPED and reported, not silently dropped.
//
// Rotation. If the budget regularly runs out, the same last step would starve
// forever. Starting the order at a different step each day means a step that
// misses its turn gets priority on another, so no job can be permanently
// starved by its position in a list.

export type ChainStep = {
  /** Route path, e.g. "/api/cron/bars-sync". */
  path: string;
  /** Milliseconds to allow this step before giving up on it. */
  timeoutMs: number;
};

export type StepResult = {
  path: string;
  status: "ok" | "http_error" | "timeout" | "unreachable" | "skipped";
  ms: number;
  detail?: string;
};

/**
 * The steps, starting at a different one each day.
 *
 * Deterministic from the date, so two runs on the same day do the same thing
 * in the same order — a chain that reordered itself between runs would make
 * failures impossible to reason about.
 */
export function rotateSteps<T>(steps: readonly T[], dateISO: string): T[] {
  if (steps.length === 0) return [];
  const days = Math.floor(Date.parse(`${dateISO}T00:00:00Z`) / 86_400_000);
  if (!Number.isFinite(days)) return [...steps];
  const start = ((days % steps.length) + steps.length) % steps.length;
  return steps.map((_, i) => steps[(start + i) % steps.length]);
}

export type ChainOptions = {
  origin: string;
  secret: string;
  deadline: number;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

/**
 * Run each step in turn, stopping cleanly when the budget is gone.
 *
 * A step's failure does not stop the chain. These jobs are independent —
 * sentiment collection failing is no reason to skip subscription checks — and
 * one bad provider should not take the rest of the day's work with it.
 */
export async function runChain(steps: ChainStep[], opts: ChainOptions): Promise<StepResult[]> {
  const { origin, secret, deadline, fetchImpl = fetch } = opts;
  const results: StepResult[] = [];

  for (const step of steps) {
    const remaining = deadline - Date.now();
    if (remaining <= 1_000) {
      results.push({ path: step.path, status: "skipped", ms: 0, detail: "no time left in this run" });
      continue;
    }

    const started = Date.now();
    try {
      const res = await fetchImpl(`${origin}${step.path}`, {
        headers: { authorization: `Bearer ${secret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(Math.min(step.timeoutMs, remaining)),
      });
      const ms = Date.now() - started;
      results.push(
        res.ok
          ? { path: step.path, status: "ok", ms }
          : { path: step.path, status: "http_error", ms, detail: `HTTP ${res.status}` },
      );
    } catch (e) {
      const ms = Date.now() - started;
      const message = e instanceof Error ? e.message : String(e);
      // AbortSignal sets `name` to TimeoutError or AbortError. Reading the
      // name rather than matching the message is the difference between a
      // check that holds and one that depends on how a runtime happens to
      // word "the operation timed out" this release.
      const name = e instanceof Error ? e.name : "";
      const timedOut = name === "TimeoutError" || name === "AbortError" || /abort|time[d]?\s?out/i.test(message);

      results.push({
        path: step.path,
        status: timedOut ? "timeout" : "unreachable",
        ms,
        // The secret is in a header, not the URL, so a message cannot leak it —
        // but trim anyway rather than relying on that staying true.
        detail: message.slice(0, 80),
      });
    }
  }

  return results;
}

/** A one-line summary, so a run's outcome is readable without parsing the array. */
export function summarise(results: StepResult[]): string {
  const ok = results.filter(r => r.status === "ok").length;
  const skipped = results.filter(r => r.status === "skipped");
  const failed = results.filter(r => r.status !== "ok" && r.status !== "skipped");

  const parts = [`${ok}/${results.length} ok`];
  if (failed.length > 0) parts.push(`failed: ${failed.map(r => r.path).join(", ")}`);
  if (skipped.length > 0) parts.push(`out of time: ${skipped.map(r => r.path).join(", ")}`);
  return parts.join(" · ");
}
