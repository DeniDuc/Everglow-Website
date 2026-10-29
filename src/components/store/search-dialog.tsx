"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Search, X } from "lucide-react";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";

export type SearchItem = { slug: string; name: string; image: string | null; priceCents: number; priceLabel: string; keywords: string };

/** Instant product search (Cmd/Ctrl+K). The catalogue is small, so it filters on the client. */
export function SearchDialog({ open, onClose, items }: { open: boolean; onClose: () => void; items: SearchItem[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return items.slice(0, 6);
    return items.filter((i) => terms.every((t) => i.keywords.includes(t))).slice(0, 8);
  }, [q, items]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  function go(slug: string) {
    onClose();
    router.push(`/products/${slug}`);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-ink/30 p-4 pt-[10vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search rentals"
            className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-lift"
            initial={{ y: -12, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -12, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === "Enter" && results[active]) go(results[active].slug);
            }}
          >
            <div className="flex items-center gap-3 border-b border-line px-5">
              <Search className="size-5 text-ink-muted" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                placeholder="Search tents, tables, chairs…"
                className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-ink-muted"
                aria-label="Search"
              />
              <button type="button" onClick={onClose} className="rounded-full p-2 text-ink-muted hover:bg-sand-50" aria-label="Close search">
                <X className="size-5" />
              </button>
            </div>
            <ul className="max-h-[60vh] overflow-y-auto p-2" role="listbox">
              {results.length === 0 && <li className="px-4 py-10 text-center text-sm text-ink-muted">Nothing found. Try “tent” or “chair”.</li>}
              {results.map((r, i) => (
                <li key={r.slug} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r.slug)}
                    className={cn("flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors", i === active && "bg-sand-50")}
                  >
                    <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-sand-50">
                      {r.image && <Image src={r.image} alt="" fill sizes="48px" className="object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="text-sm text-ink-muted">
                        {money(r.priceCents)} · {r.priceLabel}
                      </span>
                    </span>
                    <ArrowRight className={cn("size-4 text-ink-muted transition-opacity", i === active ? "opacity-100" : "opacity-0")} />
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
