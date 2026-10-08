import { describe, expect, it } from "vitest";
import { buildAnalysisInput, eventCoverageFor, parseCboeChain, parseEarningsCsv } from "../payload";
import { analyzeDeterministic } from "../engine";
import { reviewAnalysis } from "../validate";
import { etNaiveToIso, nyseSessionStatus } from "../../marketTime";

const AS_OF = "2026-10-08T15:00:00.000Z";

// Shape mirrors a real CBOE delayed_quotes response (fields observed 2026-10-08); values are synthetic.
const cboe = {
  timestamp: "2026-10-08 15:00:00",
  data: {
    current_price: 100, security_type: "stock", last_trade_time: "2026-10-08T10:45:00", iv30: 28,
    options: [
      { option: "XYZ261106C00100000", bid: 3.0, ask: 3.1, iv: 0.3, delta: 0.52, open_interest: 900, volume: 50, last_trade_time: "2026-10-08T10:40:00" },
      { option: "XYZ261106P00100000", bid: 2.9, ask: 3.0, iv: 0.3, delta: -0.48, last_trade_time: "2026-10-08T10:41:00" },
      { option: "XYZ1261106C00100000", bid: 3.0, ask: 3.1, iv: 0.3, delta: 0.52, open_interest: 900 }, // adjusted root
      { option: "XYZ261009C00100000", bid: 1.0, ask: 1.1, iv: 0.3, delta: 0.5, open_interest: 900 },  // 1 DTE, outside swing band
    ],
  },
};

describe("payload builder", () => {
  it("parses CBOE without inventing quote timestamps or zero-filling", () => {
    const chain = parseCboeChain(cboe, "XYZ", AS_OF)!;
    expect(chain.contracts.map(c => c.contract_id)).toEqual(["XYZ261106C00100000", "XYZ261106P00100000"]);
    const put = chain.contracts[1];
    expect(put.quote_timestamp).toBeNull();
    expect(put.open_interest).toBeNull();
    expect(put.volume).toBeNull();
    expect(put.last_trade_timestamp).toBe("2026-10-08T14:41:00.000Z"); // ET (EDT) → UTC
    expect(chain.snapshotTimestamp).toBe("2026-10-08T15:00:00.000Z");
    expect(chain.priceTimestamp).toBe("2026-10-08T14:45:00.000Z");
  });

  it("treats an Alpha Vantage rate-limit body as unknown coverage, not an empty calendar", () => {
    expect(parseEarningsCsv('{"Information":"rate limit"}')).toEqual({ fetchedOk: false });
    const cal = parseEarningsCsv("symbol,name,reportDate,fiscalDateEnding,estimate,currency\nXYZ,Xyz Inc,2026-10-29,2026-09-30,1.2,USD");
    expect(eventCoverageFor(cal, "XYZ", "2026-11-06", "2026-10-08").events).toHaveLength(1);
    expect(eventCoverageFor({ fetchedOk: false }, "XYZ", "2026-11-06", "2026-10-08").status).toBe("UNKNOWN");
  });

  it("builds a valid v4.1 input that the engine turns into NO_TRADE G2 on CBOE data", () => {
    const input = buildAnalysisInput({
      symbol: "XYZ", asOf: AS_OF, chainJson: cboe, barsJson: null,
      earnings: { fetchedOk: true, events: [] },
    });
    expect(input.paper_trading_only).toBe(true);
    expect(input.contracts!.every(c => c.freshness.status === "UNKNOWN")).toBe(true);
    expect(input.expiries![0].expected_move).toMatchObject({ amount: 6, lower: 94, upper: 106 });
    const out = analyzeDeterministic(input);
    expect(out.trade_decision).toBe("NO_TRADE");
    expect(reviewAnalysis(input, out).status).toBe("NO_TRADE");
  });
});

describe("market calendar", () => {
  it("knows holidays, early closes and its own coverage limit", () => {
    expect(nyseSessionStatus(new Date("2026-11-26T15:00:00Z")).status).toBe("CLOSED");          // Thanksgiving
    expect(nyseSessionStatus(new Date("2026-11-27T18:30:00Z")).status).toBe("CLOSED");          // 13:30 ET early close
    expect(nyseSessionStatus(new Date("2026-11-27T17:30:00Z")).status).toBe("OPEN");
    expect(nyseSessionStatus(new Date("2027-01-05T15:00:00Z")).status).toBe("UNKNOWN");
  });

  it("converts ET wall-clock times across DST", () => {
    expect(etNaiveToIso("2026-12-01T10:00:00")).toBe("2026-12-01T15:00:00.000Z");
    expect(etNaiveToIso("bad")).toBeNull();
  });
});
