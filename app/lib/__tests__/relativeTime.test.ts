import { describe, expect, it } from "vitest";
import { agoLabel } from "../relativeTime";

const t = Date.parse("2026-10-27T16:00:00Z");

describe("agoLabel", () => {
  it("reads as just now for the first few seconds", () => {
    expect(agoLabel(t, t)).toBe("just now");
    expect(agoLabel(t, t + 4_000)).toBe("just now");
  });

  it("counts seconds, then minutes, then hours", () => {
    expect(agoLabel(t, t + 42_000)).toBe("42s ago");
    expect(agoLabel(t, t + 60_000)).toBe("1 min ago");
    expect(agoLabel(t, t + 180_000)).toBe("3 min ago");
    expect(agoLabel(t, t + 3_600_000)).toBe("1 hour ago");
    expect(agoLabel(t, t + 7_200_000)).toBe("2 hours ago");
  });

  it("treats a stamp slightly in the future as just now", () => {
    // Clock skew between the server's asOf and the browser is normal; a
    // negative age rendered as "-3s ago" would look broken.
    expect(agoLabel(t + 3_000, t)).toBe("just now");
  });

  it("falls back rather than printing NaN", () => {
    expect(agoLabel(NaN, t)).toBe("recently");
    expect(agoLabel(t, NaN)).toBe("recently");
  });
});
