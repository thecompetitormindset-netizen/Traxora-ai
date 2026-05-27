import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Traxora AI, a knowledgeable financial assistant embedded in a paper trading platform. You help users understand stocks, markets, and trading strategies.

You can:
- Analyze stocks and explain price movements
- Explain financial concepts (P/E ratio, market cap, volatility, etc.)
- Suggest trading strategies and risk management tips
- Interpret market news and its potential impact on stocks
- Help users understand their portfolio performance

Keep responses concise and focused. Always remind users this is a paper trading platform — not real financial advice. Never guarantee returns or tell users exactly when to buy/sell.`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = await client.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(event.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
