import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { SYSTEM_FRAMEWORK } from "@/app/lib/systemFramework";
import { checkRateLimit } from "@/app/lib/rateLimit";

export const runtime     = "nodejs";
export const maxDuration = 55;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type OptionContract = {
  contractSymbol:    string;
  strike:            number;
  lastPrice:         number;
  bid:               number;
  ask:               number;
  volume?:           number;
  openInterest?:     number;
  impliedVolatility: number;
  inTheMoney:        boolean;
};

async function fetchQuote(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=30d`;
    const r   = await fetch(url, {
      cache:   "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal:  AbortSignal.timeout(8000),
    });
    const d    = await r.json();
    const res  = d?.chart?.result?.[0];
    const meta = res?.meta;
    if (!meta?.regularMarketPrice) return null;

    const price  = meta.regularMarketPrice as number;
    const prev   = (meta.previousClose ?? meta.chartPreviousClose ?? price) as number;
    const high   = (meta.regularMarketDayHigh ?? price) as number;
    const low    = (meta.regularMarketDayLow  ?? price) as number;
    const high52 = (meta.fiftyTwoWeekHigh ?? price) as number;
    const low52  = (meta.fiftyTwoWeekLow  ?? price) as number;
    const name   = (meta.shortName ?? symbol) as string;

    const closes: number[] = res?.indicators?.quote?.[0]?.close?.filter(Boolean) ?? [];
    const highs:  number[] = res?.indicators?.quote?.[0]?.high?.filter(Boolean)  ?? [];
    const lows:   number[] = res?.indicators?.quote?.[0]?.low?.filter(Boolean)   ?? [];

    return { symbol, name, price, prev, high, low, high52, low52, closes, highs, lows };
  } catch { return null; }
}

async function fetchOptionsChain(symbol: string) {
  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
    const r   = await fetch(url, {
      cache:   "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal:  AbortSignal.timeout(8000),
    });
    const d      = await r.json();
    const result = d?.optionChain?.result?.[0];
    if (!result) return null;

    const expirationDates = (result.expirationDates as number[]) ?? [];
    const options         = result.options?.[0];
    const calls           = (options?.calls ?? []) as OptionContract[];
    const puts            = (options?.puts  ?? []) as OptionContract[];

    return { expirationDates, calls, puts };
  } catch { return null; }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = checkRateLimit(`options-analysis:${session.user.email}`, 15, 60 * 60 * 1000);
  if (!allowed) {
    return Response.json({ error: "Rate limit reached. Try again in an hour." }, { status: 429 });
  }

  const { symbol } = await req.json() as { symbol: string };
  const sym = symbol.replace(/\s/g, "").toUpperCase();

  const [quote, chain] = await Promise.all([fetchQuote(sym), fetchOptionsChain(sym)]);

  if (!quote) {
    return Response.json({ error: `Could not fetch data for ${sym}. Check the ticker and try again.` }, { status: 400 });
  }

  const price = quote.price;

  // ── Process options chain ──────────────────────────────────────────────────
  let atmIV        = 0;
  let atmCallStr   = 0;
  let atmPutStr    = 0;
  let topCalls: OptionContract[] = [];
  let topPuts:  OptionContract[] = [];

  if (chain) {
    const { calls, puts } = chain;

    const sortedCalls = [...calls].sort((a, b) => Math.abs(a.strike - price) - Math.abs(b.strike - price));
    const atmCall     = sortedCalls[0];
    if (atmCall) { atmIV = atmCall.impliedVolatility; atmCallStr = atmCall.strike; }

    const sortedPuts = [...puts].sort((a, b) => Math.abs(a.strike - price) - Math.abs(b.strike - price));
    const atmPut     = sortedPuts[0];
    if (atmPut) { if (!atmIV) atmIV = atmPut.impliedVolatility; atmPutStr = atmPut.strike; }

    topCalls = [...calls]
      .filter(c => (c.openInterest ?? 0) > 0)
      .sort((a, b) => (b.openInterest ?? 0) - (a.openInterest ?? 0))
      .slice(0, 5);

    topPuts = [...puts]
      .filter(p => (p.openInterest ?? 0) > 0)
      .sort((a, b) => (b.openInterest ?? 0) - (a.openInterest ?? 0))
      .slice(0, 5);
  }

  // ── Expected move ──────────────────────────────────────────────────────────
  const dailyMove  = atmIV > 0 ? price * atmIV * Math.sqrt(1 / 252) : null;
  const upTarget   = dailyMove ? price + dailyMove : null;
  const downTarget = dailyMove ? price - dailyMove : null;

  const nextExpiry = chain?.expirationDates?.[0]
    ? new Date(chain.expirationDates[0] * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "N/A";

  // ── Build prompt ───────────────────────────────────────────────────────────
  const priceCtx = `LIVE DATA — ${sym} (${quote.name})
Price: $${price.toFixed(2)} | Prev close: $${quote.prev.toFixed(2)} | Change: ${((price - quote.prev) / quote.prev * 100).toFixed(2)}%
Day range: $${quote.low.toFixed(2)} – $${quote.high.toFixed(2)}
52-week range: $${quote.low52.toFixed(2)} – $${quote.high52.toFixed(2)}
30-day high: $${quote.highs.length ? Math.max(...quote.highs).toFixed(2) : "N/A"} | 30-day low: $${quote.lows.length ? Math.min(...quote.lows).toFixed(2) : "N/A"}`;

  const optionsCtx = chain
    ? `OPTIONS CHAIN — nearest expiry: ${nextExpiry}
ATM call strike: $${atmCallStr} | ATM put strike: $${atmPutStr}
ATM implied volatility: ${(atmIV * 100).toFixed(1)}%
Expected 1σ daily move: ${dailyMove ? `±$${dailyMove.toFixed(2)} → upside $${upTarget!.toFixed(2)} / downside $${downTarget!.toFixed(2)}` : "N/A"}

Top calls by open interest:
${topCalls.map(c => `  $${c.strike} strike | IV ${(c.impliedVolatility * 100).toFixed(0)}% | OI ${(c.openInterest ?? 0).toLocaleString()} | last $${c.lastPrice.toFixed(2)}`).join("\n") || "  None available"}

Top puts by open interest:
${topPuts.map(p => `  $${p.strike} strike | IV ${(p.impliedVolatility * 100).toFixed(0)}% | OI ${(p.openInterest ?? 0).toLocaleString()} | last $${p.lastPrice.toFixed(2)}`).join("\n") || "  None available"}`
    : "Options chain unavailable — analysis based on price structure only.";

  const prompt = `You are an options analyst using Smart Money methodology plus live options flow data. Be direct and specific. Real money is on the line.

${priceCtx}

${optionsCtx}

Give your analysis in this EXACT structure:

**BIAS: [BULLISH / BEARISH / NEUTRAL]**
One sentence — your directional read for today and why.

**Expected Move Today**
The 1σ expected range based on IV. State: upside target ($X), downside target ($X), and the ±$ move. Tell the trader what this means practically.

**Smart Money Structure**
Is price trading in a premium or discount zone relative to the 30-day range? Name the nearest Order Block, Fair Value Gap, or Liquidity level and its price. 2–3 sentences.

**Recommended Options Play**
- **Direction:** CALLS or PUTS
- **Strike:** $X — explain ATM vs OTM choice
- **Expiry:** which expiry and why (same-week, next-week, monthly)
- **Entry trigger:** exact price or Kill Zone timing to wait for
- **Max risk:** the premium cost per contract at current ask

**Options Flow Read**
What is the OI distribution saying? Where are large call/put walls that could act as a magnet (max pain)? Any imbalance worth noting?

**Two Key Levels**
Name two specific price levels that determine whether this play works or fails today.

Under 380 words total. Concrete price levels throughout. No padding.`;

  const stream = await client.messages.stream({
    model:      "claude-opus-4-7",
    max_tokens: 1000,
    system:     SYSTEM_FRAMEWORK,
    messages:   [{ role: "user", content: prompt }],
  });

  const encoder  = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      const meta = {
        price,
        name:              quote.name,
        dailyMove:         dailyMove  ? parseFloat(dailyMove.toFixed(2))  : null,
        upTarget:          upTarget   ? parseFloat(upTarget.toFixed(2))   : null,
        downTarget:        downTarget ? parseFloat(downTarget.toFixed(2)) : null,
        atmIV:             atmIV > 0  ? parseFloat((atmIV * 100).toFixed(1)) : null,
        nextExpiry,
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "meta", ...meta })}\n\n`));

      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text: chunk.delta.text })}\n\n`));
        }
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
