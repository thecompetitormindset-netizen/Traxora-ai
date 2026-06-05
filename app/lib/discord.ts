// Discord webhook utilities — shared across cron and API routes.

export interface DiscordEmbed {
  title:       string;
  description?: string;
  color:       number;
  fields?:     { name: string; value: string; inline?: boolean }[];
  footer?:     { text: string };
  timestamp?:  string;
}

export async function postToDiscord(webhookUrl: string, embeds: DiscordEmbed[]): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ embeds }),
      signal:  AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch { return false; }
}

// ── Morning Briefing embed ────────────────────────────────────────────────────

type StockResult = {
  symbol:    string;
  signal:    "BUY" | "SELL" | "HOLD";
  confidence: "High" | "Medium" | "Low";
  entryZone: string;
  stopLoss:  string;
  takeProfit: string;
  whyBuy:    string;
};

export function buildBriefingEmbed(
  top: StockResult[],
  date: string,
  optionsPlay?: { symbol: string; play: string; expiry: string | null } | null,
): DiscordEmbed[] {
  const buys  = top.filter(s => s.signal === "BUY").slice(0, 5);
  const sells = top.filter(s => s.signal === "SELL").slice(0, 3);

  const fmtStock = (s: StockResult) =>
    `**${s.symbol}** · ${s.confidence} confidence\nEntry ${s.entryZone} · Stop ${s.stopLoss} · TP ${s.takeProfit}\n_${s.whyBuy.slice(0, 100)}${s.whyBuy.length > 100 ? "…" : ""}_`;

  const fields: DiscordEmbed["fields"] = [];

  if (buys.length > 0) {
    fields.push({
      name:  `🟢 BUY Setups (${buys.length})`,
      value: buys.map(fmtStock).join("\n\n") || "None",
    });
  }

  if (sells.length > 0) {
    fields.push({
      name:  `🔴 SELL Setups (${sells.length})`,
      value: sells.map(fmtStock).join("\n\n") || "None",
    });
  }

  if (optionsPlay) {
    fields.push({
      name:  "⚡ Top Options Play",
      value: `**${optionsPlay.symbol}** · ${optionsPlay.play}${optionsPlay.expiry ? ` · exp ${optionsPlay.expiry}` : ""}`,
    });
  }

  return [{
    title:       `🌅 Morning Brief — ${date}`,
    description: `**${buys.length} BUY** · **${sells.length} SELL** signals fired by Traxora AI`,
    color:       0x10b981,
    fields,
    footer:      { text: "Traxora AI · traxora.ai" },
    timestamp:   new Date().toISOString(),
  }];
}

// ── IPO Analysis embed ────────────────────────────────────────────────────────

type IPOResult = {
  sector:       string;
  companyBrief: string;
  verdict:      "Strong Buy" | "Buy" | "Watch" | "Avoid";
  verdictReason: string;
  priceTargets: { bear: number; base: number; bull: number };
  catalysts:    string[];
  risks:        string[];
  similarTo:    string;
};

export function buildIPOEmbed(
  name: string,
  symbol: string | undefined,
  ipoPrice: string | null | undefined,
  analysis: IPOResult,
): DiscordEmbed[] {
  const verdictColor =
    analysis.verdict === "Strong Buy" ? 0x10b981 :
    analysis.verdict === "Buy"        ? 0x34d399 :
    analysis.verdict === "Watch"      ? 0xf59e0b : 0xf87171;

  const ticker = symbol ? ` (${symbol})` : "";
  const price  = ipoPrice ? ` @ $${ipoPrice}` : "";

  return [{
    title:       `🚀 IPO Alert: ${name}${ticker}${price}`,
    description: `**${analysis.verdict}** — ${analysis.verdictReason}`,
    color:       verdictColor,
    fields: [
      {
        name:   "Sector",
        value:  analysis.sector,
        inline: true,
      },
      {
        name:   "Similar to",
        value:  analysis.similarTo,
        inline: true,
      },
      {
        name:  "📊 12-Month Price Targets",
        value: `🐻 Bear: $${analysis.priceTargets.bear}  ·  📊 Base: $${analysis.priceTargets.base}  ·  🐂 Bull: $${analysis.priceTargets.bull}`,
      },
      {
        name:  "💡 What they do",
        value: analysis.companyBrief,
      },
      ...(analysis.catalysts.length > 0 ? [{
        name:  "✅ Catalysts",
        value: analysis.catalysts.map(c => `• ${c}`).join("\n"),
        inline: true as const,
      }] : []),
      ...(analysis.risks.length > 0 ? [{
        name:  "⚠️ Risks",
        value: analysis.risks.map(r => `• ${r}`).join("\n"),
        inline: true as const,
      }] : []),
    ],
    footer:    { text: "Traxora AI · traxora.ai" },
    timestamp: new Date().toISOString(),
  }];
}
