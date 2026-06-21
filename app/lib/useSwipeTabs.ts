"use client";

import { useEffect, useRef } from "react";

export function useSwipeTabs<T extends string>(
  tabs: readonly T[],
  current: T,
  onChange: (next: T) => void,
  threshold = 50,
) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
    }

    function onTouchEnd(e: TouchEvent) {
      if (startX.current === null || startY.current === null) return;
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;
      startX.current = null;
      startY.current = null;
      // Only handle horizontal swipes that are more horizontal than vertical
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const idx = tabs.indexOf(current);
      if (dx < 0 && idx < tabs.length - 1) onChange(tabs[idx + 1]); // swipe left → next
      if (dx > 0 && idx > 0)               onChange(tabs[idx - 1]); // swipe right → prev
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend",   onTouchEnd,   { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend",   onTouchEnd);
    };
  }, [tabs, current, onChange, threshold]);
}
