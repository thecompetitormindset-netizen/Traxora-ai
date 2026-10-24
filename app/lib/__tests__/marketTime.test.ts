import { describe, expect, it } from "vitest";
import {
  humanDuration,
  nextMarketOpen,
  nyseEarlyCloses,
  nyseHolidays,
  nyseSessionStatus,
} from "../marketTime";

// The calendar used to be two hand-maintained lists covering one year, with
// every later date returning UNKNOWN — which made the options engine's
// G3_SESSION gate reject every symbol from 1 January onwards. It is now derived
// from the Exchange's rules, so these cases check the derivation against the
// published schedules rather than against itself.

const PUBLISHED_HOLIDAYS: Record<number, string[]> = {
  2024: ["2024-01-01", "2024-01-15", "2024-02-19", "2024-03-29", "2024-05-27",
         "2024-06-19", "2024-07-04", "2024-09-02", "2024-11-28", "2024-12-25"],
  2025: ["2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26",
         "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25"],
  // The year the old hardcoded list covered — the derivation must reproduce it.
  2026: ["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
         "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"],
  2027: ["2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
         "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"],
};

const PUBLISHED_EARLY_CLOSES: Record<number, string[]> = {
  2024: ["2024-07-03", "2024-11-29", "2024-12-24"],
  2025: ["2025-07-03", "2025-11-28", "2025-12-24"],
  2026: ["2026-11-27", "2026-12-24"],   // 3 July is the observed holiday itself
  2027: ["2027-11-26"],                 // 3 July is a Saturday; 24 Dec is the holiday
};

describe("nyseHolidays matches the published NYSE schedule", () => {
  for (const [year, expected] of Object.entries(PUBLISHED_HOLIDAYS)) {
    it(`${year}`, () => expect(nyseHolidays(Number(year))).toEqual(expected));
  }
});

describe("nyseEarlyCloses matches the published NYSE schedule", () => {
  for (const [year, expected] of Object.entries(PUBLISHED_EARLY_CLOSES)) {
    it(`${year}`, () => expect(nyseEarlyCloses(Number(year))).toEqual(expected));
  }
});

describe("observance rules", () => {
  it("moves a Saturday holiday back to the Friday", () => {
    // 4 July 2026 is a Saturday, observed Friday the 3rd.
    expect(nyseHolidays(2026)).toContain("2026-07-03");
    expect(nyseHolidays(2026)).not.toContain("2026-07-04");
  });

  it("moves a Sunday holiday forward to the Monday", () => {
    // 4 July 2027 is a Sunday, observed Monday the 5th.
    expect(nyseHolidays(2027)).toContain("2027-07-05");
  });

  it("does not observe a New Year's Day that falls on a Saturday", () => {
    // 1 January 2028 is a Saturday. The Exchange stays open on the last trading
    // day of the year, so neither 31 December 2027 nor 1 January 2028 closes.
    expect(nyseHolidays(2027)).not.toContain("2027-12-31");
    expect(nyseHolidays(2028)).not.toContain("2028-01-01");
    expect(nyseSessionStatus(new Date("2027-12-31T15:00:00Z")).status).toBe("OPEN");
  });

  it("tracks Good Friday through the computus", () => {
    const goodFridays: Record<number, string> = {
      2024: "2024-03-29", 2025: "2025-04-18", 2026: "2026-04-03",
      2027: "2027-03-26", 2028: "2028-04-14", 2029: "2029-03-30", 2030: "2030-04-19",
    };
    for (const [y, date] of Object.entries(goodFridays)) {
      expect(nyseHolidays(Number(y))).toContain(date);
    }
  });

  it("applies Juneteenth only from 2022, when the Exchange adopted it", () => {
    expect(nyseHolidays(2021).some(d => d.startsWith("2021-06"))).toBe(false);
    expect(nyseHolidays(2022)).toContain("2022-06-20"); // the 19th was a Sunday
    expect(nyseHolidays(2023)).toContain("2023-06-19");
  });
});

describe("nyseSessionStatus no longer expires", () => {
  it("opens on an ordinary trading day well past the old horizon", () => {
    // 15:00 UTC = 10:00 ET. These all used to return UNKNOWN.
    for (const d of ["2027-01-05", "2028-03-14", "2030-06-11", "2040-09-18"]) {
      const s = nyseSessionStatus(new Date(`${d}T15:00:00Z`));
      expect(s.status, `${d} should be a normal open session`).toBe("OPEN");
      expect(s.early_close).toBe(false);
    }
  });

  it("still closes for weekends, holidays and out-of-hours", () => {
    expect(nyseSessionStatus(new Date("2027-01-02T15:00:00Z")).detail).toBe("Weekend");
    expect(nyseSessionStatus(new Date("2027-01-01T15:00:00Z")).detail).toBe("NYSE holiday");
    expect(nyseSessionStatus(new Date("2027-01-05T12:00:00Z")).detail).toBe("Before regular session");
    expect(nyseSessionStatus(new Date("2027-01-05T22:00:00Z")).detail).toBe("After regular session");
  });

  it("closes at 13:00 ET on an early-close day", () => {
    // 26 November 2027, the Friday after Thanksgiving.
    const beforeOne = new Date("2027-11-26T17:00:00Z"); // 12:00 ET
    const afterOne  = new Date("2027-11-26T18:30:00Z"); // 13:30 ET
    expect(nyseSessionStatus(beforeOne).status).toBe("OPEN");
    expect(nyseSessionStatus(beforeOne).early_close).toBe(true);
    expect(nyseSessionStatus(afterOne).status).toBe("CLOSED");
    expect(nyseSessionStatus(afterOne).early_close).toBe(true);
  });

  it("honours unscheduled closures, which have no rule to derive", () => {
    // National day of mourning for Jimmy Carter.
    expect(nyseSessionStatus(new Date("2025-01-09T15:00:00Z")).status).toBe("CLOSED");
    expect(nyseSessionStatus(new Date("2025-01-09T15:00:00Z")).detail).toBe("Unscheduled NYSE closure");
  });

  it("never reports UNKNOWN for a derivable date", () => {
    // Walk four years of daily samples; UNKNOWN would mean the engine's
    // G3_SESSION gate silently rejects every symbol that day.
    const start = Date.UTC(2027, 0, 1);
    for (let i = 0; i < 365 * 4; i++) {
      const s = nyseSessionStatus(new Date(start + i * 86_400_000 + 15 * 3_600_000));
      expect(s.status).not.toBe("UNKNOWN");
    }
  });

  it("opens roughly 250 days a year, every year", () => {
    for (const year of [2027, 2030, 2035, 2040]) {
      let open = 0;
      for (let i = 0; i < 365; i++) {
        const d = new Date(Date.UTC(year, 0, 1 + i, 15));
        if (d.getUTCFullYear() !== year) break;
        if (nyseSessionStatus(d).status === "OPEN") open++;
      }
      expect(open, `${year} open days`).toBeGreaterThan(245);
      expect(open, `${year} open days`).toBeLessThan(255);
    }
  });
});

// Walking forward to the next open is only possible because the calendar is
// derived — the old lists ran out, so there was nothing to walk into.
describe("nextMarketOpen", () => {
  // Comma placement varies between ICU builds, so normalise it away.
  const etOpen = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" })
      .format(d).replace(/,/g, "");

  it("returns null while the session is open", () => {
    expect(nextMarketOpen(new Date("2027-01-05T15:00:00Z"))).toBeNull();
  });

  it("skips the weekend from a Saturday", () => {
    // Sat 24 Oct 2026 → Mon 26 Oct, 9:30 ET.
    const next = nextMarketOpen(new Date("2026-10-24T12:00:00Z"))!;
    expect(etOpen(next)).toBe("Mon 9:30 AM");
  });

  it("opens later the same morning when asked before the bell", () => {
    // Mon 26 Oct 2026, 08:00 ET.
    const next = nextMarketOpen(new Date("2026-10-26T12:00:00Z"))!;
    expect(etOpen(next)).toBe("Mon 9:30 AM");
  });

  it("rolls to the next day after the close", () => {
    // Mon 26 Oct 2026, 17:00 ET → Tuesday.
    const next = nextMarketOpen(new Date("2026-10-26T21:00:00Z"))!;
    expect(etOpen(next)).toBe("Tue 9:30 AM");
  });

  it("steps over a holiday", () => {
    // Thanksgiving, Thu 26 Nov 2026 → the Friday half day still opens at 9:30.
    const next = nextMarketOpen(new Date("2026-11-26T15:00:00Z"))!;
    expect(etOpen(next)).toBe("Fri 9:30 AM");
  });

  it("steps over a holiday that lands against a weekend", () => {
    // Fri 3 Jul 2026 is the observed Independence Day → Monday the 6th.
    const next = nextMarketOpen(new Date("2026-07-03T15:00:00Z"))!;
    expect(etOpen(next)).toBe("Mon 9:30 AM");
  });

  it("still resolves years past the old horizon", () => {
    for (const from of ["2027-01-01T15:00:00Z", "2030-12-25T15:00:00Z", "2040-07-04T15:00:00Z"]) {
      const next = nextMarketOpen(new Date(from));
      expect(next, from).not.toBeNull();
      expect(nyseSessionStatus(next!).status).toBe("OPEN");
      expect(next!.getTime()).toBeGreaterThan(Date.parse(from));
    }
  });
});

describe("humanDuration", () => {
  it("stays coarse", () => {
    expect(humanDuration(30_000)).toBe("under a minute");
    expect(humanDuration(9 * 60_000)).toBe("9m");
    expect(humanDuration(2 * 3_600_000)).toBe("2h");
    expect(humanDuration(2 * 3_600_000 + 40 * 60_000)).toBe("2h 40m");
    expect(humanDuration(2 * 86_400_000 + 21 * 3_600_000)).toBe("2d 21h");
    expect(humanDuration(3 * 86_400_000)).toBe("3d");
  });
});
