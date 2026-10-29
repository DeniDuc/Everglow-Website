"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";

/** Accessible accordion with a smooth height animation (CSS grid rows). */
export function FaqAccordion({ items }: { items: { id: string; question: string; answerHtml: string }[] }) {
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);
  const base = useId();
  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const isOpen = open === item.id;
        const panelId = `${base}-${item.id}`;
        return (
          <li
            key={item.id}
            className={cn(
              "rounded-2xl border bg-white transition-[border-color,box-shadow] duration-300",
              isOpen ? "border-gold-300 shadow-soft" : "border-line",
            )}
          >
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : item.id)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[0.98rem] font-medium md:px-6"
              >
                {item.question}
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full bg-sand-100 transition-transform duration-300",
                    isOpen && "rotate-45 bg-sand-200",
                  )}
                >
                  <Plus className="size-4" />
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              className={cn(
                "grid transition-[grid-template-rows] duration-400 ease-[var(--ease-out-soft)]",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div
                  className="prose-everglow px-5 pb-5 md:px-6"
                  dangerouslySetInnerHTML={{ __html: item.answerHtml }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
