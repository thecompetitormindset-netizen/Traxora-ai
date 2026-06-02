import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { SYSTEM_FRAMEWORK } from "@/app/lib/systemFramework";
import { checkRateLimit } from "@/app/lib/rateLimit";

export const runtime     = "nodejs";
export const maxDuration = 55;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function fetchQuote(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=30d`;
    const r   = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    const d    = await r.json();
    const res  = d?.chart?.result?.[0];
    const meta = res?.meta;
    if (!meta?.regularMarketPrice) return null;

    const price   = meta.regularMarketPrice as number;
    const prev    = (meta.previousClose ?? meta.chartPreviousClose ?? price) as number;
    const open    = (meta.regularMarketOpen ?? price) as number;
    const high    = (meta.regularMarketDayHigh ?? price) as number;
    const low     = (meta.regularMarketDayLow  ?? price) as number;
    const high52  = (meta.fiftyTwoWeekHigh ?? price) as number;
    const low52   = (meta.fiftyTwoWeekLow  ?? price) as number;
    const vol     = (meta.regularMarketVolume ?? 0) as number;
    const avgVol  = (meta.averageDailyVolume10Day ?? vol) as number;
    const name    = (meta.shortName ?? symbol) as string;

    // Last 30 closes for structure
    const closes: number[] = res?.indicators?.quote?.[0]?.close?.filter(Boolean) ?? [];
    const highs:  number[] = res?.indicators?.quote?.[0]?.high?.filter(Boolean)  ?? [];
    const lows:   number[] = res?.indicators?.quote?.[0]?.low?.filter(Boolean)   ?? [];

    return { symbol, name, price, prev, open, high, low, high52, low52, vol, avgVol, closes, highs, lows };
  } catch { return null; }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = checkRateLimit(`position-insight:${session.user.email}`, 20, 60 * 60 * 1000);
  if (!allowed) {
    return Response.json({ error: "Rate limit reached. Try again in an hour." }, { status: 429 });
  }

  const body = await req.json() as {
    symbol:       string;
    positionType: "stock" | "call" | "put";
    shares?:      number;
    contracts?:   number;
    entryPrice:   number;
    stopLoss?:    number;
    strike?:      number;
    expiry?:      string;
    dateBought:   string;
    notes?:       string;
  };

  const { symbol, positionType, shares, contracts, entryPrice, stopLoss, strike, expiry, dateBought, notes } = body;

  const quote = await fetchQuote(symbol.replace(/\s/g, "").toUpperCase());

  const currentPrice  = quote?.price ?? null;
  const pnlPercent    = currentPrice != null ? ((currentPrice - entryPrice) / entryPrice) * 100 : null;
  const totalShares   = positionType === "stock" ? (shares ?? 0) : (contracts ?? 0) * 100;
  const pnlDollar     = currentPrice != null ? (currentPrice - entryPrice) * totalShares : null;

  const daysBought = Math.floor((Date.now() - new Date(dateBought).getTime()) / 86400000);

  // Build context string for AI
  const positionDesc = positionType === "stock"
    ? `${shares} shares of ${symbol} at $${entryPrice.toFixed(2)} avg entry`
    : `${contracts} ${positionType.toUpperCase()} option contract${(contracts ?? 1) > 1 ? "s" : ""} on ${symbol} — Strike $${strike}, Expiry ${expiry}, Premium $${entryPrice.toFixed(2)}/share`;

  const marketCtx = quote
    ? `Current price: $${quote.price.toFixed(2)} (${pnlPercent! >= 0 ? "+" : ""}${pnlPercent!.toFixed(2)}% from entry)
Day range: $${quote.low.toFixed(2)} – $${quote.high.toFixed(2)}
52-week range: $${quote.low52.toFixed(2)} – $${quote.high52.toFixed(2)}
Previous close: $${quote.prev.toFixed(2)}
Volume vs avg: ${quote.vol > 0 && quote.avgVol > 0 ? `${(quote.vol / quote.avgVol).toFixed(2)}x` : "N/A"}
30-day high: $${quote.highs.length ? Math.max(...quote.highs).toFixed(2) : "N/A"}
30-day low:  $${quote.lows.length  ? Math.min(...quote.lows).toFixed(2)  : "N/A"}`
    : "Live price unavailable — analysis based on entry context only.";

  const stopCtx = stopLoss
    ? `Stop loss set at $${stopLoss.toFixed(2)} (${(((stopLoss - entryPrice) / entryPrice) * 100).toFixed(2)}% from entry)`
    : "⚠️ NO STOP LOSS SET — this is the primary risk concern.";

  const prompt = `You are analysing a REAL MONEY position that a trader currently holds on Robinhood. Be direct, specific, and honest. Do not pad the response.

POSITION DETAILS
----------------
Type: ${positionType.toUpperCase()}
${positionDesc}
Held for: ${daysBought} day${daysBought !== 1 ? "s" : ""}
${stopCtx}
${notes ? `Trader notes: "${notes}"` : ""}

LIVE MARKET DATA
----------------
${marketCtx}

Provide your analysis in this EXACT structure (use these headers):

**VERDICT: [HOLD / CUT / ADD / WAIT]**
One sentence — your bottom line on this position right now.

**P&L Status**
Current unrealised P&L: ${currentPrice != null ? `$${pnlDollar!.toFixed(2)} (${pnlPercent! >= 0 ? "+" : ""}${pnlPercent!.toFixed(2)}%)` : "Unknown — live price unavailable"}. 2–3 sentences on whether this is healthy, concerning, or at a critical level.

**Smart Money Structure**
What is the market structure saying right now? Is price in a premium or discount zone relative to the 30-day range? Are there Order Blocks or FVGs near the current price that matter for this position? Mention specific price levels.

**Stop Loss Recommendation**
${stopLoss ? `Their stop at $${stopLoss.toFixed(2)} is: [valid / too tight / too wide]. Give one specific reason.` : "They have NO stop loss. Give a specific structural stop level — a price below/above which the trade thesis is invalid. Be precise (exact price)."}

**What to Watch**
2 specific price levels that matter most for this position in the next 5 trading days. What happens at each level.

**Risk Warning**
${stopLoss ? "One sentence on max risk if stop is hit." : "One sentence on the real dollar risk they're carrying with no stop on this position."}

Keep total response under 350 words. Use concrete price levels throughout.`;

  const stream = await client.messages.stream({
    model:      "claude-sonnet-4-6",
    max_tokens: 900,
    system:     SYSTEM_FRAMEWORK,
    messages:   [{ role: "user", content: prompt }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      // Send metadata first
      const meta = {
        currentPrice,
        pnlPercent:  pnlPercent  != null ? parseFloat(pnlPercent.toFixed(2))  : null,
        pnlDollar:   pnlDollar   != null ? parseFloat(pnlDollar.toFixed(2))   : null,
        name:        quote?.name ?? symbol,
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
