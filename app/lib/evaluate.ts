// evaluate.ts
// Traxora AI — signal evaluation harness.
//
// Purpose: measure whether your signals actually have an edge, HONESTLY.
// Raw "accuracy" is a vanity metric and easy to fool yourself with. This
// measures the three things that matter:
//
//   1. Accuracy WITH a confidence interval  — is the number real or just noise?
//   2. Calibration by confidence bucket      — does "High" actually beat "Low"?
//   3. Expectancy (avg return per trade)     — does it make money after the math?
//
// Plus a Brier score if you log probabilities, and an out-of-sample splitter so
// you never tune and test on the same data (the #1 cause of fake 90% backtests).

export interface ResolvedPrediction {
  symbol: string;
  timestamp: number;                       // ms epoch when prediction was made
  signal: "BUY" | "HOLD" | "SELL";
  confidence: "High" | "Medium" | "Low";
  score: number;                           // from smartMoneyScore()
  probUp?: number;                         // optional: stated P(up), 0..1
  entryPrice: number;                      // price at prediction time
  exitPrice: number;                       // price at end of horizon
  horizonDays: number;                     // e.g. 3 or 5
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const wentUp = (p: ResolvedPrediction) => p.exitPrice > p.entryPrice;

// Directional "correct": BUY wins on up, SELL wins on down. HOLD is excluded
// from directional accuracy — abstaining is neither right nor wrong on direction.
function isDirectionallyCorrect(p: ResolvedPrediction): boolean | null {
  if (p.signal === "HOLD") return null;
  const up = wentUp(p);
  return p.signal === "BUY" ? up : !up;
}

// Return earned per trade, as a signed fraction of entry.
// BUY profits when price rises, SELL profits when it falls, HOLD earns nothing.
function tradeReturn(p: ResolvedPrediction): number {
  const move = (p.exitPrice - p.entryPrice) / p.entryPrice;
  if (p.signal === "BUY") return move;
  if (p.signal === "SELL") return -move;
  return 0;
}

// Wilson score interval — the honest way to report a win rate on small samples.
// Returns [low, high] at 95% confidence.
function wilsonInterval(wins: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin =
    (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

// ── Core report ───────────────────────────────────────────────────────────--

export interface EvalReport {
  totalPredictions: number;
  actedTrades: number;              // non-HOLD
  holds: number;
  directionalAccuracy: number;      // wins / acted, 0..1
  accuracy95CI: [number, number];   // Wilson interval — READ THIS, not the point estimate
  expectancyPerTrade: number;       // avg signed return per acted trade
  expectancyPct: string;            // human-readable
  winRate: number;
  avgWin: number;                   // avg return of winning trades
  avgLoss: number;                  // avg return of losing trades (negative)
  payoffRatio: number | null;       // avgWin / |avgLoss| — >1 means winners bigger
  byConfidence: Record<string, ConfidenceStats>;
  brierScore: number | null;        // only if probUp logged. Lower = better. 0.25 = coin flip.
  verdict: string;
}

export interface ConfidenceStats {
  n: number;
  accuracy: number;
  ci95: [number, number];
  expectancy: number;
}

export function evaluate(predictions: ResolvedPrediction[]): EvalReport {
  const acted = predictions.filter((p) => p.signal !== "HOLD");
  const holds = predictions.length - acted.length;

  // Directional accuracy
  const correct = acted.filter((p) => isDirectionallyCorrect(p) === true).length;
  const accuracy = acted.length ? correct / acted.length : 0;
  const ci = wilsonInterval(correct, acted.length);

  // Expectancy
  const returns = acted.map(tradeReturn);
  const expectancy = returns.length
    ? returns.reduce((a, b) => a + b, 0) / returns.length
    : 0;

  const wins = returns.filter((r) => r > 0);
  const losses = returns.filter((r) => r < 0);
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  const payoffRatio = avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : null;

  // Calibration by confidence bucket
  const byConfidence: Record<string, ConfidenceStats> = {};
  for (const level of ["High", "Medium", "Low"] as const) {
    const bucket = acted.filter((p) => p.confidence === level);
    const bWins = bucket.filter((p) => isDirectionallyCorrect(p) === true).length;
    const bReturns = bucket.map(tradeReturn);
    byConfidence[level] = {
      n: bucket.length,
      accuracy: bucket.length ? bWins / bucket.length : 0,
      ci95: wilsonInterval(bWins, bucket.length),
      expectancy: bReturns.length
        ? bReturns.reduce((a, b) => a + b, 0) / bReturns.length
        : 0,
    };
  }

  // Brier score (probability calibration) — only if probUp is logged
  const withProb = predictions.filter((p) => typeof p.probUp === "number");
  const brierScore = withProb.length
    ? withProb.reduce((sum, p) => {
        const actual = wentUp(p) ? 1 : 0;
        return sum + (p.probUp! - actual) ** 2;
      }, 0) / withProb.length
    : null;

  // Plain-language verdict
  const verdict = buildVerdict(accuracy, ci, expectancy, payoffRatio, acted.length, byConfidence);

  return {
    totalPredictions: predictions.length,
    actedTrades: acted.length,
    holds,
    directionalAccuracy: accuracy,
    accuracy95CI: ci,
    expectancyPerTrade: expectancy,
    expectancyPct: (expectancy * 100).toFixed(2) + "% per trade",
    winRate: accuracy,
    avgWin,
    avgLoss,
    payoffRatio,
    byConfidence,
    brierScore,
    verdict,
  };
}

function buildVerdict(
  acc: number,
  ci: [number, number],
  exp: number,
  payoff: number | null,
  n: number,
  byConf: Record<string, ConfidenceStats>,
): string {
  const parts: string[] = [];

  if (n < 30) {
    parts.push(
      `Only ${n} acted trades — this is too few to conclude anything. The 95% range is ${(ci[0] * 100).toFixed(0)}–${(ci[1] * 100).toFixed(0)}%. Get to 100+ before trusting any number.`,
    );
  } else if (ci[0] <= 0.5 && ci[1] >= 0.5) {
    parts.push(
      `Accuracy is ${(acc * 100).toFixed(1)}% but the 95% range (${(ci[0] * 100).toFixed(0)}–${(ci[1] * 100).toFixed(0)}%) straddles 50% — you cannot yet claim an edge over a coin flip.`,
    );
  } else if (ci[0] > 0.5) {
    parts.push(
      `Accuracy is ${(acc * 100).toFixed(1)}% and the whole 95% range sits above 50% — looks like a real directional edge.`,
    );
  } else {
    parts.push(
      `Accuracy is ${(acc * 100).toFixed(1)}% and the range sits BELOW 50% — the system may be inverted. Check for a sign-flip bug.`,
    );
  }

  if (exp > 0) {
    parts.push(`Expectancy is positive (${(exp * 100).toFixed(2)}% per trade before costs) — it makes money on average. Re-check after fees/slippage.`);
  } else {
    parts.push(`Expectancy is ${(exp * 100).toFixed(2)}% per trade — it loses money on average even if accuracy looks okay. Winners are too small relative to losers.`);
  }

  if (payoff != null) {
    parts.push(`Payoff ratio ${payoff.toFixed(2)} (avg winner vs avg loser).`);
  }

  const hi = byConf.High, lo = byConf.Low;
  if (hi?.n >= 10 && lo?.n >= 10) {
    if (hi.accuracy > lo.accuracy) {
      parts.push(`Calibration looks sane: High-confidence (${(hi.accuracy * 100).toFixed(0)}%) beats Low (${(lo.accuracy * 100).toFixed(0)}%).`);
    } else {
      parts.push(`Calibration is BROKEN: High-confidence (${(hi.accuracy * 100).toFixed(0)}%) does not beat Low (${(lo.accuracy * 100).toFixed(0)}%). Your confidence labels are meaningless — fix this before anything else.`);
    }
  }

  return parts.join(" ");
}

// ── Out-of-sample splitter ─────────────────────────────────────────────────
export function chronoSplit(
  predictions: ResolvedPrediction[],
  trainFraction = 0.7,
): { train: ResolvedPrediction[]; test: ResolvedPrediction[] } {
  const sorted = [...predictions].sort((a, b) => a.timestamp - b.timestamp);
  const cut = Math.floor(sorted.length * trainFraction);
  return { train: sorted.slice(0, cut), test: sorted.slice(cut) };
}
