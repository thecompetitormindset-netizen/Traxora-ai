"use client";

import { useEffect, useState } from "react";

function getMarketStatus() {
  const now = new Date();
  // Convert to ET (UTC-4 during EDT, UTC-5 during EST)
  const etOffset = isDST(now) ? -4 : -5;
  const etTime = new Date(now.getTime() + (now.getTimezoneOffset() + etOffset * 60) * 60000);

  const day = etTime.getDay(); // 0=Sun, 6=Sat
  const h = etTime.getHours();
  const m = etTime.getMinutes();
  const totalMins = h * 60 + m;

  const isWeekend = day === 0 || day === 6;
  const openMins = 9 * 60 + 30;   // 9:30 AM
  const closeMins = 16 * 60;       // 4:00 PM
  const preMarketMins = 4 * 60;    // 4:00 AM
  const afterMarketMins = 20 * 60; // 8:00 PM

  if (isWeekend) return { status: "Closed", label: "Weekend", color: "text-[#4B5675]", dot: "bg-[#4B5675]" };
  if (totalMins >= openMins && totalMins < closeMins) return { status: "Open", label: "Market Open", color: "text-emerald-400", dot: "bg-emerald-400 animate-pulse" };
  if (totalMins >= preMarketMins && totalMins < openMins) return { status: "Pre-Market", label: "Pre-Market", color: "text-amber-400", dot: "bg-amber-400" };
  if (totalMins >= closeMins && totalMins < afterMarketMins) return { status: "After-Hours", label: "After-Hours", color: "text-emerald-400", dot: "bg-emerald-400" };
  return { status: "Closed", label: "Market Closed", color: "text-[#4B5675]", dot: "bg-[#4B5675]" };
}

function isDST(date: Date): boolean {
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  return date.getTimezoneOffset() < Math.max(jan, jul);
}

function getCountdown(): string {
  const now = new Date();
  const etOffset = isDST(now) ? -4 : -5;
  const etTime = new Date(now.getTime() + (now.getTimezoneOffset() + etOffset * 60) * 60000);

  const day = etTime.getDay();
  const h = etTime.getHours();
  const m = etTime.getMinutes();
  const s = etTime.getSeconds();
  const totalSecs = h * 3600 + m * 60 + s;

  const openSecs = 9 * 3600 + 30 * 60;
  const closeSecs = 16 * 3600;

  let diff = 0;
  if (day >= 1 && day <= 5) {
    if (totalSecs < openSecs) diff = openSecs - totalSecs;
    else if (totalSecs < closeSecs) diff = closeSecs - totalSecs;
    else return "";
  } else {
    return "";
  }

  const hh = Math.floor(diff / 3600);
  const mm = Math.floor((diff % 3600) / 60);
  const ss = diff % 60;
  return `${hh}h ${mm}m ${ss}s`;
}

export default function MarketStatus() {
  const [info, setInfo]         = useState({ status: "Closed", label: "Market Closed", color: "text-[#4B5675]", dot: "bg-[#4B5675]" });
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    setInfo(getMarketStatus());
    setCountdown(getCountdown());
    const id = setInterval(() => {
      setInfo(getMarketStatus());
      setCountdown(getCountdown());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-3 bg-[#0C1017] border border-[#1C2333] rounded-xl px-4 py-2.5">
      <span className={`w-2 h-2 rounded-full shrink-0 ${info.dot}`} />
      <div>
        <p className={`text-xs font-bold ${info.color}`}>{info.label}</p>
        {countdown && (
          <p className="text-[10px] text-[#4B5675] font-mono">
            {info.status === "Open" ? "Closes in" : "Opens in"} {countdown}
          </p>
        )}
      </div>
      <div className="ml-auto text-right hidden sm:block">
        <p className="text-[10px] text-[#4B5675]">NYSE / NASDAQ</p>
        <p className="text-[10px] text-[#4B5675]">9:30 AM – 4:00 PM ET</p>
      </div>
    </div>
  );
}
