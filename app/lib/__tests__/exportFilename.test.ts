import { describe, expect, it } from "vitest";
import { safeFilename } from "../exportName";

// The filename goes into a Content-Disposition header, which is where a
// caller-supplied string stops being cosmetic: a newline ends the header early
// and whatever follows is read as another one.

describe("safeFilename", () => {
  it("keeps an ordinary name", () => {
    expect(safeFilename("my-record", "fallback")).toBe("my-record");
  });

  it("turns spaces into hyphens", () => {
    expect(safeFilename("my trading record", "fallback")).toBe("my-trading-record");
  });

  it("strips a newline, which would end the header", () => {
    expect(safeFilename('evil"\nSet-Cookie: x=1', "fallback")).toBe("evilSet-Cookie-x1");
  });

  it("strips quotes, which would close the quoted value", () => {
    expect(safeFilename('a"b', "fallback")).toBe("ab");
  });

  it("strips path separators", () => {
    expect(safeFilename("../../etc/passwd", "fallback")).toBe("etcpasswd");
  });

  it("drops a supplied extension, since one is appended", () => {
    // Otherwise "record.csv" becomes "record.csv.csv".
    expect(safeFilename("record.csv", "fallback")).toBe("record");
    expect(safeFilename("record.json", "fallback")).toBe("record");
  });

  it("falls back when nothing usable survives", () => {
    expect(safeFilename("///", "traxora-picks")).toBe("traxora-picks");
    expect(safeFilename("   ", "traxora-picks")).toBe("traxora-picks");
    expect(safeFilename(null, "traxora-picks")).toBe("traxora-picks");
  });

  it("caps the length", () => {
    expect(safeFilename("a".repeat(200), "fallback")).toHaveLength(60);
  });
});
