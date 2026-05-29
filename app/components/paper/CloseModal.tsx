"use client";

import { useState } from "react";
import type { PaperTrade, ExitReason } from "@/app/lib/paperTrades";
import { calcPL, fmtMoney } from "@/app/lib/paperTrades";

export default function CloseModal({
  trade, currentPrice, onClose, onConfirm,
}: {
  trade: PaperTrade;
  currentPrice: number | null;
  onClose: () => void;
  onConfirm: (exitPrice: number, reason: ExitReason) => void;
}) {
  const [exitPrice, setExitPrice] = useState(currentPrice?.toFixed(2) ?? trade.entryPrice.toFixed(2));
  const [reason, setReason]       = useState<ExitReason>("manual");
  const ep = parseFloat(exitPrice);
  const pl = isNaN(ep) ? null : calcPL(trade, ep);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-[#13112A] border border-[#252345] rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#252345]">
          <h2 className="text-base font-bold">Close {trade.symbol}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#4B5675] hover:text-[#F1F5F9] transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label htmlFor="exit-price" className="block text-xs text-[#7B8DB4] mb-1.5 font-medium">Exit Price</label>
            <input
              id="exit-price"
              type="number" step="0.01"
              value={exitPrice}
              onChange={e => setExitPrice(e.target.value)}
              className="w-full bg-[#0D0B1A] border border-[#252345] rounded-xl px-4 py-2.5 text-sm font-mono focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-[#7B8DB4] mb-1.5 font-medium">Reason</label>
            <div className="grid grid-cols-3 gap-2">
              {([["manual","Manual"],["stop_hit","Stop Hit"],["target_hit","Target Hit"]] as [ExitReason,string][]).map(([v,l]) => (
                <button key={v} type="button" onClick={() => setReason(v)}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-all ${reason === v ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400" : "border-[#252345] text-[#4B5675] hover:border-[#333368]"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {pl !== null && (
            <div className={`rounded-xl px-4 py-3 text-center ${pl >= 0 ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-rose-500/10 border border-rose-500/20"}`}>
              <p className="text-xs text-[#7B8DB4] mb-1">Realized P&amp;L</p>
              <p className={`text-2xl font-black font-mono ${pl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtMoney(pl)}</p>
            </div>
          )}
          <button type="button" onClick={() => { if (!isNaN(ep)) onConfirm(ep, reason); }}
            className="w-full bg-emerald-600 hover:bg-emerald-500 transition-colors py-3 rounded-xl text-sm font-bold">
            Confirm Close
          </button>
        </div>
      </div>
    </div>
  );
}
