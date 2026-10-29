"use client";

import { useEffect, useState } from "react";
import type { CartQuote } from "@/lib/store/quote";
import { useBooking } from "./booking-provider";

export type CartOptions = { fulfillment: "pickup" | "delivery"; damageProtection: boolean; outOfTownKm: number };

/** Server-priced cart (same engine as admin and checkout), refreshed as the cart changes. */
export function useCartQuote(options: CartOptions) {
  const { cart, periodRange } = useBooking();
  const [data, setData] = useState<CartQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = JSON.stringify({
    s: periodRange?.start.toISOString(),
    e: periodRange?.end.toISOString(),
    i: cart.map((c) => [c.variantId, c.quantity]),
    o: options,
  });

  useEffect(() => {
    if (!periodRange || cart.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start: periodRange.start.toISOString(),
            end: periodRange.end.toISOString(),
            items: cart.map((c) => ({ variantId: c.variantId, quantity: c.quantity })),
            ...options,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error("Could not price your cart");
        setData((await res.json()) as CartQuote);
      } catch (e) {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error };
}
