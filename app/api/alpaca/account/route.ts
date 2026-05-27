import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { apiKey, apiSecret, paper } = await req.json();

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "Missing API credentials" }, { status: 400 });
    }

    const base = paper
      ? "https://paper-api.alpaca.markets"
      : "https://api.alpaca.markets";

    const res = await fetch(`${base}/v2/account`, {
      headers: {
        "APCA-API-KEY-ID":     apiKey,
        "APCA-API-SECRET-KEY": apiSecret,
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Invalid credentials — check your Alpaca API key and secret" }, { status: 401 });
    }

    const data = await res.json();
    return NextResponse.json({
      buyingPower:    data.buying_power,
      portfolioValue: data.portfolio_value,
      cash:           data.cash,
      status:         data.status,
      accountNumber:  data.account_number,
    });
  } catch {
    return NextResponse.json({ error: "Failed to reach Alpaca" }, { status: 500 });
  }
}
