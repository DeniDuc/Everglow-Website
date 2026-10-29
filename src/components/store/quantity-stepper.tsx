"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
  size = "md",
  label = "Quantity",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  label?: string;
}) {
  const h = size === "sm" ? "h-9" : "h-12";
  const w = size === "sm" ? "w-9" : "w-11";
  return (
    <div className={cn("inline-flex items-center rounded-full border border-line bg-white", h)}>
      <button
        type="button"
        className={cn("flex h-full items-center justify-center rounded-l-full text-ink-soft transition-colors hover:bg-sand-50 disabled:opacity-30", w)}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Decrease ${label.toLowerCase()}`}
      >
        <Minus className="size-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          if (!Number.isNaN(n)) onChange(Math.max(min, max != null ? Math.min(max, n) : n));
        }}
        className="h-full w-12 bg-transparent text-center text-[0.95rem] font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        className={cn("flex h-full items-center justify-center rounded-r-full text-ink-soft transition-colors hover:bg-sand-50 disabled:opacity-30", w)}
        onClick={() => onChange(max != null ? Math.min(max, value + 1) : value + 1)}
        disabled={max != null && value >= max}
        aria-label={`Increase ${label.toLowerCase()}`}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
