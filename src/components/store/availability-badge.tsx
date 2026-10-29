"use client";

import { cn } from "@/lib/cn";
import { useProductAvailability } from "./booking-provider";

/** Shows stock for the selected dates: "Available", "Only 2 left", "Booked". */
export function AvailabilityBadge({ productId, className }: { productId: string; className?: string }) {
  const a = useProductAvailability(productId);
  if (a.state === "no-dates") return null;
  if (a.state === "loading") return <span className={cn("skeleton inline-block h-6 w-20 rounded-full", className)} aria-hidden="true" />;
  const [label, tone] =
    a.total <= 0
      ? ["Booked for your dates", "bg-danger/10 text-danger"]
      : a.total <= 3
        ? [`Only ${a.total} left`, "bg-warning/10 text-warning"]
        : ["Available", "bg-success/10 text-success"];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", tone, className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}
