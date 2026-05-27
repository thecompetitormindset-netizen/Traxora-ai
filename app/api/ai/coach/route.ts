import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const { trades, wins, losses, winRate } = await req.json();

  const recent = (trades as Array<{ side: string; quantity: number; symbol: string; price: number }>)
    .slice(0, 20)
    .map((t) => `${t.side} ${t.quantity}x ${t.symbol.replace(".US", "").replace(".COMM", "")} @$${Number(t.price).toFixed(2)}`)
    .join(" | ");

  const prompt = `You are an elite ICT trading coach. Review this paper trader's performance and write a coaching report.

Stats:
- Win Rate: ${winRate}% (${wins}W / ${losses}L, ${wins + losses} total closed trades)
- Recent trades: ${recent || "no trades yet"}

Write exactly this format:

ASSESSMENT: [1 honest sentence about overall performance]
WEAKNESS: [1 specific pattern weakness you see in their trade log]
STRENGTH: [1 genuine strength to build on]
TIPS:
1. [Specific ICT tip to improve entries]
2. [Specific ICT tip to improve exits or risk management]
3. [Mindset or routine tip for consistency]

Be direct, specific, and use ICT methodology. Reference actual symbols from their log if relevant. No generic advice.`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 420,
      messages: [{ role: "user", content: prompt }],
    });

    const report = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    return Response.json({ report });
  } catch {
    return Response.json({ error: "Coaching unavailable" }, { status: 500 });
  }
}
