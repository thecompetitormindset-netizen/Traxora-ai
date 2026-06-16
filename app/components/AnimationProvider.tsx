"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function AnimationProvider() {
  const pathname = usePathname();

  useEffect(() => {
    const obs = new IntersectionObserver(
      entries =>
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            obs.unobserve(e.target);
          }
        }),
      { threshold: 0.07, rootMargin: "0px 0px -24px 0px" },
    );

    const attach = () => {
      document
        .querySelectorAll(
          ".reveal:not(.is-visible), .reveal-left:not(.is-visible), .reveal-right:not(.is-visible), .reveal-scale:not(.is-visible)",
        )
        .forEach(el => obs.observe(el));
    };

    attach();
    const t1 = setTimeout(attach, 350);
    const t2 = setTimeout(attach, 1400);

    return () => {
      obs.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pathname]);

  return null;
}
