import { describe, expect, it } from "vitest";
import { analyzeDeterministic } from "../engine";
import { reviewAnalysis } from "../validate";
import { toDisplay, type StoredAnalysis } from "../display";
import { cleanBullishInput } from "./fixtures";

function stored(): StoredAnalysis {
  const input = cleanBullishInput();
  const output = analyzeDeterministic(input);
  const review = reviewAnalysis(input, output);
  if (review.status !== "APPROVED_CANDIDATE") throw new Error("fixture should approve");
  return { symbol: "XYZ", as_of: input.as_of!, input, output, review_status: review.status, review_errors: [], pricing: review.pricing };
}

describe("display gate", () => {
  it("shows an approved candidate while it is still current", () => {
    const d = toDisplay(stored(), new Date("2026-10-08T15:01:00Z"));
    expect(d.status).toBe("PAPER_CANDIDATE");
    expect(d.pricing?.max_loss).toBe(230);
  });

  it("withholds legs and pricing once leg quotes age past their limit", () => {
    const d = toDisplay(stored(), new Date("2026-10-08T15:45:00Z")); // quotes now 46 min old > 40 min band
    expect(d.status).toBe("STALE_CANDIDATE");
    expect(d.output).toBeNull();
    expect(d.pricing).toBeNull();
  });

  it("withholds a candidate after the session closes", () => {
    expect(toDisplay(stored(), new Date("2026-10-08T20:05:00Z")).status).toBe("STALE_CANDIDATE");
  });

  it("never shows a rejected output", () => {
    const d = toDisplay({ ...stored(), review_status: "REJECTED", review_errors: ["x"] });
    expect(d.status).toBe("UNAVAILABLE");
    expect(d.output).toBeNull();
  });
});
