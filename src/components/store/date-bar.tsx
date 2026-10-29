"use client";

import { CalendarDays, ChevronRight, Loader2 } from "lucide-react";
import { formatLocal } from "@/lib/format";
import { periodErrorMessages } from "@/lib/availability/engine";
import { cn } from "@/lib/cn";
import { useBooking } from "./booking-provider";

/** The "Select a rental period" bar from the original site, now showing the chosen dates. */
export function DateBar({ className, variant = "floating" }: { className?: string; variant?: "floating" | "inline" }) {
  const { periodRange, periodErrors, openPicker, availabilityLoading } = useBooking();
  const days = periodRange
    ? Math.max(1, Math.ceil((periodRange.end.getTime() - periodRange.start.getTime()) / 86_400_000))
    : 0;

  return (
    <button
      type="button"
      onClick={openPicker}
      className={cn(
        "group flex w-full items-center gap-4 rounded-2xl px-5 py-4 text-left transition-[box-shadow,transform,background-color] duration-300 hover:-translate-y-0.5",
        variant === "floating" ? "bg-white shadow-lift" : "border border-line bg-white hover:shadow-soft",
        className,
      )}
      aria-haspopup="dialog"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sand-100 text-ink transition-colors group-hover:bg-sand-200">
        {availabilityLoading ? <Loader2 className="size-5 animate-spin" /> : <CalendarDays className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        {periodRange ? (
          <>
            <span className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Your rental · {days} {days === 1 ? "day" : "days"}
            </span>
            <span className="block truncate font-semibold">
              {formatLocal(periodRange.start, "EEE, MMM d · h:mm a")}
              <span className="mx-2 text-gold-500">→</span>
              {formatLocal(periodRange.end, "EEE, MMM d · h:mm a")}
            </span>
            {periodErrors.length > 0 && (
              <span className="block text-sm text-danger">{periodErrorMessages[periodErrors[0]]}</span>
            )}
          </>
        ) : (
          <>
            <span className="block font-semibold">Select a rental period</span>
            <span className="block text-sm text-ink-muted">View prices and live availability</span>
          </>
        )}
      </span>
      <span className="hidden text-sm font-medium text-gold-700 sm:inline">
        {periodRange ? "Change" : "Choose dates"}
      </span>
      <ChevronRight className="size-5 text-ink-muted transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
