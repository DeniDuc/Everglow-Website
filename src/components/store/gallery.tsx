"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { cn } from "@/lib/cn";

/** Product photos: swipeable main image, thumbnails, and a full-screen lightbox. */
export function Gallery({ photos, name }: { photos: { src: string; alt: string }[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const count = photos.length;

  const go = (i: number) => {
    const next = (i + count) % count;
    setIndex(next);
    track.current?.scrollTo({ left: next * track.current.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % count);
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + count) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, count]);

  if (count === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-3xl bg-white text-ink-muted">
        Photo coming soon
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="group relative overflow-hidden rounded-3xl border border-line bg-white">
        <div
          ref={track}
          className="no-scrollbar flex aspect-square snap-x snap-mandatory overflow-x-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            const i = Math.round(el.scrollLeft / el.clientWidth);
            if (i !== index) setIndex(i);
          }}
        >
          {photos.map((p, i) => (
            <div key={p.src} className="relative h-full w-full shrink-0 snap-center">
              <Image
                src={p.src}
                alt={p.alt || `${name} photo ${i + 1}`}
                fill
                priority={i === 0}
                sizes="(max-width: 1024px) 100vw, 600px"
                className="object-contain p-4"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-soft backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          aria-label="View full screen"
        >
          <Expand className="size-4" />
        </button>
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-soft backdrop-blur transition hover:scale-105"
              aria-label="Previous photo"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-soft backdrop-blur transition hover:scale-105"
              aria-label="Next photo"
            >
              <ChevronRight className="size-5" />
            </button>
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 md:hidden" aria-hidden="true">
              {photos.map((p, i) => (
                <span
                  key={p.src}
                  className={cn("h-1.5 rounded-full bg-ink/25 transition-all", i === index ? "w-5 bg-ink" : "w-1.5")}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {count > 1 && (
        <ul className="no-scrollbar hidden gap-2 overflow-x-auto md:flex">
          {photos.map((p, i) => (
            <li key={p.src}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  "relative block size-20 overflow-hidden rounded-xl border-2 bg-white transition",
                  i === index ? "border-gold-500" : "border-transparent opacity-70 hover:opacity-100",
                )}
              >
                <Image src={p.src} alt="" fill sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence>
        {zoom && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/90 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoom(false)}
            role="dialog"
            aria-modal="true"
            aria-label={`${name} photos`}
          >
            <motion.div
              key={index}
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative h-full max-h-[85vh] w-full max-w-5xl"
              onClick={(e) => e.stopPropagation()}
            >
              <Image src={photos[index].src} alt={photos[index].alt} fill sizes="100vw" className="object-contain" />
            </motion.div>
            <button
              type="button"
              className="absolute right-4 top-4 rounded-full bg-white/10 p-3 text-white"
              onClick={() => setZoom(false)}
              aria-label="Close"
            >
              <X className="size-6" />
            </button>
            {count > 1 && (
              <p className="absolute bottom-6 text-sm text-white/80">
                {index + 1} / {count}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
