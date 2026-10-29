"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

/** Scroll-snap carousel: native swipe on touch, arrows + progress on desktop. */
export function Carousel({ children, label }: { children: React.ReactNode[]; label: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const [progress, setProgress] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setProgress(max > 0 ? el.scrollLeft / max : 0);
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update]);

  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label}>
      <ul
        ref={ref}
        onScroll={update}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 md:-mx-2 md:gap-6 md:px-2"
      >
        {children.map((child, i) => (
          <li key={i} className="w-[72%] shrink-0 snap-start sm:w-[44%] md:w-[31%] lg:w-[23.5%]">
            {child}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center gap-6">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-sand-100" aria-hidden="true">
          <div className="h-full rounded-full bg-gold-500 transition-[width] duration-200" style={{ width: `${Math.max(12, progress * 100)}%` }} />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => scroll(-1)} disabled={!canPrev} className={cn("flex size-11 items-center justify-center rounded-full border border-line bg-white transition hover:shadow-soft disabled:opacity-40")} aria-label="Previous items">
            <ArrowLeft className="size-5" />
          </button>
          <button type="button" onClick={() => scroll(1)} disabled={!canNext} className="flex size-11 items-center justify-center rounded-full border border-line bg-white transition hover:shadow-soft disabled:opacity-40" aria-label="Next items">
            <ArrowRight className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
