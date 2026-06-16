import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the configured max within the window", () => {
    const key = `test-${Math.random()}`;
    expect(checkRateLimit(key, 3, 1000)).toBe(true);
    expect(checkRateLimit(key, 3, 1000)).toBe(true);
    expect(checkRateLimit(key, 3, 1000)).toBe(true);
  });

  it("blocks requests once the max is exceeded within the window", () => {
    const key = `test-${Math.random()}`;
    checkRateLimit(key, 2, 1000);
    checkRateLimit(key, 2, 1000);
    expect(checkRateLimit(key, 2, 1000)).toBe(false);
  });

  it("tracks separate keys independently", () => {
    const keyA = `a-${Math.random()}`;
    const keyB = `b-${Math.random()}`;
    checkRateLimit(keyA, 1, 1000);
    expect(checkRateLimit(keyA, 1, 1000)).toBe(false);
    expect(checkRateLimit(keyB, 1, 1000)).toBe(true);
  });

  it("allows new requests again once the window has elapsed", () => {
    vi.useFakeTimers();
    const key = `time-${Math.random()}`;
    checkRateLimit(key, 1, 100);
    expect(checkRateLimit(key, 1, 100)).toBe(false);
    vi.advanceTimersByTime(150);
    expect(checkRateLimit(key, 1, 100)).toBe(true);
    vi.useRealTimers();
  });
});
