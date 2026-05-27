import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { apiKey, apiSecret, paper, symbol, side, qty } = await req.json();

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "Missing API credentials — add them in Settings → Broker Connection" }, { status: 400 });
    }
    if (!symbol || !side || !qty || Number(qty) <= 0) {
      return NextResponse.json({ error: "symbol, side (buy/sell), and qty are required" }, { status: 400 });
    }

    const base = paper
      ? "https://paper-api.alpaca.markets"
      : "https://api.alpaca.markets";

    // Strip exchange suffixes — Alpaca uses plain tickers (AAPL, not AAPL.US)
    const alpacaSymbol = symbol.replace(/\.(US|COMM)$/i, "");

    const body = {
      symbol:        alpacaSymbol,
      qty:           String(qty),
      side:          side.toLowerCase(), // "buy" | "sell"
      type:          "market",
      time_in_force: "day",
    };

    const res = await fetch(`${base}/v2/orders`, {
      method: "POST",
      headers: {
        "APCA-API-KEY-ID":     apiKey,
        "APCA-API-SECRET-KEY": apiSecret,
        "Content-Type":        "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: (err as { message?: string }).message || "Order rejected by Alpaca" },
        { status: 400 }
      );
    }

    const order = await res.json();
    return NextResponse.json({
      orderId:  order.id,
      symbol:   order.symbol,
      side:     order.side,
      qty:      order.qty,
      status:   order.status,
      filledAt: order.filled_at,
    });
  } catch {
    return NextResponse.json({ error: "Failed to place order — check your connection" }, { status: 500 });
  }
}
