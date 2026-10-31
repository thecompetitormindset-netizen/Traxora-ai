import { describe, it, expect } from "vitest";
import { ticketHref } from "../futuresTicket";

describe("the practice link on a futures contract", () => {
  it("opens the ticket on that exact contract", () => {
    expect(ticketHref("MCL.COMM", "BUY", true)).toBe("/paper?symbol=MCL&side=BUY");
  });

  it("sends the bare root, which is what the ticket then shows", () => {
    // The practice page strips .COMM anyway; sending the stripped form keeps
    // the URL and the screen saying the same thing.
    expect(ticketHref("ES.COMM", null, false)).toBe("/paper?symbol=ES");
    expect(ticketHref("MES.COMM", null, false)).toBe("/paper?symbol=MES");
  });

  it("carries a short over as SELL", () => {
    expect(ticketHref("GC.COMM", "SELL", true)).toBe("/paper?symbol=GC&side=SELL");
  });

  it("withholds the side when the lean does not clear the bar", () => {
    // The page prints a lean below the bar in grey as "very weak". Prefilling
    // a direction behind it would have the app argue with itself.
    expect(ticketHref("MCL.COMM", "BUY", false)).toBe("/paper?symbol=MCL");
    expect(ticketHref("MCL.COMM", "SELL", false)).toBe("/paper?symbol=MCL");
  });

  it("withholds the side when there is no direction at all", () => {
    expect(ticketHref("NG.COMM", null, true)).toBe("/paper?symbol=NG");
  });

  it("accepts a symbol that is already a bare root", () => {
    expect(ticketHref("MNQ", "BUY", true)).toBe("/paper?symbol=MNQ&side=BUY");
  });

  it("normalises case and stray whitespace", () => {
    expect(ticketHref("  mcl.comm  ", "BUY", true)).toBe("/paper?symbol=MCL&side=BUY");
  });

  it("produces a URL whose params parse back to what went in", () => {
    const href = ticketHref("SIL.COMM", "SELL", true);
    const parsed = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(parsed.get("symbol")).toBe("SIL");
    expect(parsed.get("side")).toBe("SELL");
  });
});
