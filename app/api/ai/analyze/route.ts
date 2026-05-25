import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { symbol, price, previousClose, open, high, low, dayChangePercent } =
    await req.json();

  const equilibrium = high && low ? ((high + low) / 2).toFixed(2) : "N/A";
  const rangeSize = high && low ? (high - low).toFixed(2) : "N/A";
  const priceZone =
    high && low && price
      ? price > (high + low) / 2
        ? "Premium (above 50% of today's range)"
        : "Discount (below 50% of today's range)"
      : "N/A";

  const prompt = `You are Kairos AI — an expert quantitative analyst and ICT (Inner Circle Trader) Smart Money Concepts practitioner. Analyze the following real-time market data using both traditional analysis AND ICT methodology.

Symbol: ${symbol}
Current Price: $${price?.toFixed(2) ?? "N/A"}
Previous Close: $${previousClose?.toFixed(2) ?? "N/A"}
Open: $${open?.toFixed(2) ?? "N/A"}
Day High: $${high?.toFixed(2) ?? "N/A"}
Day Low: $${low?.toFixed(2) ?? "N/A"}
Day Change: ${dayChangePercent?.toFixed(2) ?? "N/A"}%
Day Range Size: $${rangeSize}
Equilibrium (50% of range): $${equilibrium}
Price Zone: ${priceZone}

--- ICT ANALYSIS FRAMEWORK ---
Apply these Smart Money Concepts to the data above:

1. MARKET STRUCTURE: Is price making Higher Highs/Higher Lows (bullish), Lower Highs/Lower Lows (bearish), or ranging? Consider the gap between open and previous close as a structural clue.

2. DAILY BIAS: Based on the open vs previous close, the current price position vs equilibrium, and whether we are in premium or discount — what is the institutional bias for today?

3. ORDER BLOCKS (OB): The last opposing candle before a strong directional move. If price moved significantly from open, identify where an OB may exist (e.g., "Bullish OB near $X" if we had a strong bullish expansion). If no clear OB, return null.

4. FAIR VALUE GAPS (FVG): An imbalance in price — a zone where price moved so quickly that it left an inefficiency. If the day's move was aggressive (large day range), an FVG likely exists. Describe it as a price range (e.g., "Bullish FVG: $X to $Y") or return null.

5. LIQUIDITY: Identify where liquidity pools exist — previous day's high/low are prime BSL/SSL levels. State: "Buy-side liquidity above $X" or "Sell-side liquidity below $X".

6. PREMIUM / DISCOUNT / EQUILIBRIUM: Is price in a premium zone (above 50% of range — ideal for sells), discount zone (below 50% — ideal for buys), or near equilibrium?

7. OPTIMAL TRADE ENTRY (OTE): The 62%-79% Fibonacci retracement zone. If there is a clear swing, estimate where OTE would be.

8. KILLZONE CONTEXT: Note which trading session (London 2-5am ET, NY 7-10am ET, London Close 10am-12pm ET) price is most active in based on typical patterns.

Respond ONLY in this exact JSON format — no prose outside the JSON:
{
  "signal": "BUY" | "HOLD" | "SELL",
  "confidence": "High" | "Medium" | "Low",
  "summary": "2-sentence traditional + smart money summary",
  "keyPoints": ["observation 1", "observation 2", "observation 3"],
  "risk": "Low" | "Medium" | "High",
  "ict": {
    "marketStructure": "Bullish" | "Bearish" | "Ranging",
    "dailyBias": "Bullish" | "Bearish" | "Neutral",
    "priceZone": "Premium" | "Discount" | "Equilibrium",
    "orderBlock": "string describing OB or null",
    "fairValueGap": "string describing FVG range or null",
    "liquidity": "string describing nearest liquidity pool",
    "ote": "string describing OTE zone or null",
    "setup": "1-sentence description of the primary ICT setup or null"
  }
}`;

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]);
    return Response.json(parsed);
  } catch {
    return Response.json(
      { error: "Analysis unavailable" },
      { status: 500 }
    );
  }
}
