import { describe, it, expect } from "vitest";
import { SITE_URL, SITE_HOST, siteUrl } from "../site";

// A hardcoded hostname is the kind of thing nobody tests, which is how a
// backfill workflow ended up pointing at a domain nobody owns. These guard the
// shape of the value rather than the value itself, so attaching a real domain
// later does not break them — but a malformed one will not get out.

describe("the deployment's own address", () => {
  it("is an absolute https origin", () => {
    expect(SITE_URL).toMatch(/^https:\/\//);
    expect(() => new URL(SITE_URL)).not.toThrow();
  });

  it("has no trailing slash, so joining a path cannot double it", () => {
    expect(SITE_URL.endsWith("/")).toBe(false);
  });

  it("is an origin and not a page on one", () => {
    expect(new URL(SITE_URL).pathname).toBe("/");
  });

  it("derives the bare host from the origin rather than repeating it", () => {
    expect(SITE_HOST).toBe(new URL(SITE_URL).host);
    expect(SITE_HOST).not.toContain("https");
    expect(SITE_HOST).not.toContain("/");
  });
});

describe("siteUrl", () => {
  it("returns the origin for no path", () => {
    expect(siteUrl()).toBe(SITE_URL);
    expect(siteUrl("")).toBe(SITE_URL);
  });

  it("joins a path with exactly one slash, given or not", () => {
    expect(siteUrl("dashboard")).toBe(`${SITE_URL}/dashboard`);
    expect(siteUrl("/dashboard")).toBe(`${SITE_URL}/dashboard`);
    expect(siteUrl("//dashboard")).toBe(`${SITE_URL}/dashboard`);
  });

  it("keeps a nested path intact", () => {
    expect(siteUrl("guide/options")).toBe(`${SITE_URL}/guide/options`);
  });

  it("produces something a browser can parse", () => {
    for (const p of ["", "dashboard", "/guide", "icon-192.png"]) {
      expect(() => new URL(siteUrl(p))).not.toThrow();
    }
  });
});
