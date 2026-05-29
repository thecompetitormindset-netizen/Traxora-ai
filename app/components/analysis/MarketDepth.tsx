"use client";

import { getPortfolio } from "@/app/lib/trading";

export default function MarketDepth({
  price, high, low, symbol,
}: {
  price: number;
  high: number;
  low: number;
  symbol: string;
}) {
  const portfolio  = getPortfolio();
  const userOrders = portfolio.pendingOrders.filter(o => o.symbol === symbol);

  const levels = 6;
  const step   = (high - low) / (levels * 2);

  function vol(p: number) {
    const dist = Math.abs(p - price) / (high - low);
    return Math.round(5000 + 20000 * Math.exp(-dist * 4) + Math.random() * 2000);
  }

  const asks = Array.from({ length: levels }, (_, i) => {
    const lvl = price + step * (i + 1);
    return {
      price:   lvl,
      volume:  Math.round(vol(lvl) * Math.exp(-i * 0.45)),
      myOrder: userOrders.find(o => o.side === "SELL" && Math.abs(o.limitPrice - lvl) < step * 0.6),
    };
  });

  const bids = Array.from({ length: levels }, (_, i) => {
    const lvl = price - step * (i + 1);
    return {
      price:   lvl,
      volume:  Math.round(vol(lvl) * Math.exp(-i * 0.45)),
      myOrder: userOrders.find(o => o.side === "BUY" && Math.abs(o.limitPrice - lvl) < step * 0.6),
    };
  });

  const maxVol = Math.max(...asks.map(a => a.volume), ...bids.map(b => b.volume));

  function Row({ lvl, side }: { lvl: typeof asks[number]; side: "ask" | "bid" }) {
    const pct   = Math.max(4, (lvl.volume / maxVol) * 100);
    const color = side === "ask" ? "bg-rose-500/25" : "bg-emerald-500/25";
    const txt   = side === "ask" ? "text-rose-400"  : "text-emerald-400";
    return (
      <div className={`relative flex items-center gap-2 px-2 py-[3px] rounded-sm ${lvl.myOrder ? "ring-1 ring-emerald-500/50 bg-emerald-500/5" : ""}`}>
        <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${pct}%`, background: side === "ask" ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)" }} />
        <span className={`relative z-10 text-[10px] font-mono w-20 shrink-0 ${txt}`}>${lvl.price.toFixed(2)}</span>
        <div className="relative z-10 flex-1 h-1 bg-[#252345] rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="relative z-10 text-[10px] font-mono text-[#4B5675] w-16 text-right shrink-0">{lvl.volume.toLocaleString()}</span>
        {lvl.myOrder && <span className="relative z-10 text-[9px] font-bold text-emerald-400 shrink-0">MY ORDER</span>}
      </div>
    );
  }

  const spread = asks[0].price - bids[0].price;

  return (
    <div className="bg-[#13112A] rounded-3xl p-5 border border-[#252345]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[#4B5675] uppercase tracking-widest">Order Depth</p>
        <span className="text-[10px] text-[#333368] font-mono">Spread ${spread.toFixed(2)}</span>
      </div>

      <div className="flex items-center gap-2 px-2 mb-1">
        <span className="text-[9px] text-[#333368] uppercase tracking-widest w-20 shrink-0">Price</span>
        <span className="flex-1" />
        <span className="text-[9px] text-[#333368] uppercase tracking-widest w-16 text-right shrink-0">Volume</span>
      </div>

      <div className="space-y-0.5 mb-1">
        {[...asks].reverse().map((a, i) => <Row key={i} lvl={a} side="ask" />)}
      </div>

      <div className="flex items-center gap-2 my-1.5 px-2">
        <span className="text-[11px] font-black font-mono text-[#F1F5F9]">${price.toFixed(2)}</span>
        <div className="flex-1 h-px bg-[#333368]" />
        <span className="text-[10px] text-[#4B5675]">Last price</span>
      </div>

      <div className="space-y-0.5">
        {bids.map((b, i) => <Row key={i} lvl={b} side="bid" />)}
      </div>

      {userOrders.length > 0 && (
        <p className="text-[9px] text-emerald-400 mt-3 text-center">
          {userOrders.length} paper limit order{userOrders.length > 1 ? "s" : ""} shown — go to Paper Trading to manage
        </p>
      )}
      <p className="text-[9px] text-[#252345] text-center mt-1">Simulated depth · for reference only</p>
    </div>
  );
}
