"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function AnimationProvider() {
  const pathname = usePathname();

  useEffect(() => {
    const SELECTOR = ".reveal:not(.is-visible), .reveal-left:not(.is-visible), .reveal-right:not(.is-visible), .reveal-scale:not(.is-visible)";

    const showAll = () => {
      document.querySelectorAll(SELECTOR).forEach(el => el.classList.add("is-visible"));
    };

    const obs = new IntersectionObserver(
      entries =>
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            obs.unobserve(e.target);
          }
        }),
      { threshold: 0.05, rootMargin: "0px 0px 0px 0px" },
    );

    const attach = () => {
      document.querySelectorAll(SELECTOR).forEach(el => obs.observe(el));
    };

    attach();
    const t1 = setTimeout(attach, 300);
    const t2 = setTimeout(attach, 900);
    // Hard fallback: force-show everything after 2s so iOS never leaves content invisible
    const t3 = setTimeout(showAll, 2000);

    // Also re-attach on scroll (iOS Safari IntersectionObserver can miss on scroll)
    window.addEventListener("scroll", attach, { passive: true });

    return () => {
      obs.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener("scroll", attach);
    };
  }, [pathname]);

  return null;
}
