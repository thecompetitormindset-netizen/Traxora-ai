import { describe, expect, it } from "vitest";
import { rotateSteps, runChain, summarise, type ChainStep } from "../cronChain";

// Six jobs share one cron slot because Vercel registered three of the eight
// entries the project declared, and the five it dropped included the one the
// picks feature depends on. What has to hold: a step that fails must not stop
// the rest, a step that cannot fit must be reported rather than dropped, and
// no step may be permanently starved by its position.

const step = (path: string, timeoutMs = 5_000): ChainStep => ({ path, timeoutMs });

/** A fetch that answers per path and records the order it was called in. */
function fakeFetch(plan: Record<string, "ok" | "error" | "throw" | "slow">) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = new URL(url).pathname;
    calls.push(path);

    const outcome = plan[path] ?? "ok";
    if (outcome === "throw") throw new Error("connection refused");
    if (outcome === "slow") {
      // Respect the abort signal the chain passes, as a real fetch would.
      // Reject the way a real aborted fetch does: a DOMException whose name
      // is TimeoutError, not a plain Error with convenient wording.
      await new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted due to timeout");
          err.name = "TimeoutError";
          reject(err);
        });
      });
    }
    return new Response("{}", { status: outcome === "error" ? 500 : 200 });
  }) as typeof fetch;

  return { impl, calls };
}

const opts = (impl: typeof fetch, ms = 30_000) => ({
  origin: "https://example.test",
  secret: "s3cret",
  deadline: Date.now() + ms,
  fetchImpl: impl,
});

describe("runChain", () => {
  it("runs every step in order", async () => {
    const { impl, calls } = fakeFetch({});
    const results = await runChain([step("/a"), step("/b"), step("/c")], opts(impl));

    expect(calls).toEqual(["/a", "/b", "/c"]);
    expect(results.every(r => r.status === "ok")).toBe(true);
  });

  it("carries on after a step fails", async () => {
    // These jobs are independent of one another — sentiment collection failing
    // is no reason to skip subscription checks.
    const { impl, calls } = fakeFetch({ "/b": "error" });
    const results = await runChain([step("/a"), step("/b"), step("/c")], opts(impl));

    expect(calls).toEqual(["/a", "/b", "/c"]);
    expect(results[1]).toMatchObject({ status: "http_error", detail: "HTTP 500" });
    expect(results[2].status).toBe("ok");
  });

  it("carries on after a step throws", async () => {
    const { impl, calls } = fakeFetch({ "/a": "throw" });
    const results = await runChain([step("/a"), step("/b")], opts(impl));

    expect(results[0].status).toBe("unreachable");
    expect(calls).toContain("/b");
  });

  it("records a timeout by the error's name, not its wording", async () => {
    // Matching the message text would break whenever a runtime reworded it.
    const { impl } = fakeFetch({ "/slow": "slow" });
    const results = await runChain([step("/slow", 50), step("/after")], opts(impl));

    expect(results[0].status).toBe("timeout");
    expect(results[1].status).toBe("ok");
  });

  it("marks steps it has no time for as skipped, not dropped", async () => {
    // A serverless invocation is killed at its limit. A step that silently
    // vanished from the report would be indistinguishable from one that ran.
    const { impl, calls } = fakeFetch({});
    const results = await runChain([step("/a"), step("/b")], opts(impl, 0));

    expect(calls).toEqual([]);
    expect(results).toHaveLength(2);
    expect(results.every(r => r.status === "skipped")).toBe(true);
  });

  it("sends the secret as a header, never in the URL", async () => {
    // A URL ends up in logs and error messages; a header does not.
    let seenUrl = "";
    let seenAuth: string | null = null;
    const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seenUrl = String(input);
      seenAuth = new Headers(init?.headers).get("authorization");
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await runChain([step("/a")], opts(impl));

    expect(seenAuth).toBe("Bearer s3cret");
    expect(seenUrl).not.toContain("s3cret");
  });
});

describe("rotateSteps", () => {
  const steps = ["/a", "/b", "/c"];

  it("is stable within a day", async () => {
    // Two runs on the same day must do the same thing in the same order, or
    // a failure becomes impossible to reason about.
    expect(rotateSteps(steps, "2026-10-29")).toEqual(rotateSteps(steps, "2026-10-29"));
  });

  it("starts somewhere different the next day", () => {
    expect(rotateSteps(steps, "2026-10-30")).not.toEqual(rotateSteps(steps, "2026-10-29"));
  });

  it("keeps every step, just reordered", () => {
    expect([...rotateSteps(steps, "2026-10-30")].sort()).toEqual([...steps].sort());
  });

  it("gives every step a turn at the front over a cycle", () => {
    // The whole point: nothing may starve because of where it sits.
    const firsts = new Set<string>();
    for (let d = 1; d <= 9; d++) {
      firsts.add(rotateSteps(steps, `2026-11-0${d}`)[0]);
    }
    expect(firsts.size).toBe(steps.length);
  });

  it("handles an empty list and a malformed date", () => {
    expect(rotateSteps([], "2026-10-29")).toEqual([]);
    expect(rotateSteps(steps, "not-a-date")).toEqual(steps);
  });
});

describe("summarise", () => {
  it("names what failed and what ran out of time", () => {
    const line = summarise([
      { path: "/a", status: "ok", ms: 10 },
      { path: "/b", status: "http_error", ms: 10, detail: "HTTP 500" },
      { path: "/c", status: "skipped", ms: 0 },
    ]);
    expect(line).toContain("1/3 ok");
    expect(line).toContain("failed: /b");
    expect(line).toContain("out of time: /c");
  });

  it("stays short when everything worked", () => {
    expect(summarise([{ path: "/a", status: "ok", ms: 5 }])).toBe("1/1 ok");
  });
});
