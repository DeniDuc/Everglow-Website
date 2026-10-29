"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validatePeriod, zonedDateTime, type PeriodError, type PeriodRules } from "@/lib/availability/engine";

/**
 * Client state shared by the whole storefront: the selected rental period (persisted),
 * the cart (persisted) and live availability for the chosen dates.
 */

export type BookingRules = PeriodRules & {
  slotMinutes: number;
  defaultPickupTime: string;
  defaultReturnTime: string;
};

export type Period = { startDate: string; startTime: string; endDate: string; endTime: string };

export type CartItem = {
  productId: string;
  variantId: string;
  slug: string;
  name: string;
  variantName: string | null;
  image: string | null;
  unitPriceCents: number;
  priceLabel: string;
  requiresDelivery: boolean;
  quantity: number;
};

export type Availability = { total: number; variants: Record<string, number> };

type Ctx = {
  rules: BookingRules;
  period: Period | null;
  periodRange: { start: Date; end: Date } | null;
  periodErrors: PeriodError[];
  setPeriod: (p: Period | null) => void;
  pickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
  cart: CartItem[];
  cartCount: number;
  addToCart: (item: CartItem) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  removeFromCart: (variantId: string) => void;
  clearCart: () => void;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  /** Last item added, for the toast. */
  lastAdded: { item: CartItem; at: number } | null;
  availability: Record<string, Availability>;
  availabilityLoading: boolean;
  watchAvailability: (productIds: string[]) => () => void;
};

const BookingContext = createContext<Ctx | null>(null);

const PERIOD_KEY = "everglow.period.v1";
const CART_KEY = "everglow.cart.v1";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or storage blocked: state still works for this visit.
  }
}

export function BookingProvider({ rules, children }: { rules: BookingRules; children: React.ReactNode }) {
  const [period, setPeriodState] = useState<Period | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<Ctx["lastAdded"]>(null);
  const [availability, setAvailability] = useState<Record<string, Availability>>({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  useEffect(() => {
    // Restore after hydration so server and client render the same first frame.
    /* eslint-disable react-hooks/set-state-in-effect */
    setPeriodState(read<Period>(PERIOD_KEY));
    setCart(read<CartItem[]>(CART_KEY) ?? []);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (hydrated) write(CART_KEY, cart);
  }, [cart, hydrated]);

  const periodRange = useMemo(() => {
    if (!period) return null;
    return {
      start: zonedDateTime(period.startDate, period.startTime, rules.timezone),
      end: zonedDateTime(period.endDate, period.endTime, rules.timezone),
    };
  }, [period, rules.timezone]);

  const periodErrors = useMemo(
    () => (periodRange ? validatePeriod(periodRange.start, periodRange.end, new Date(), rules) : []),
    [periodRange, rules],
  );

  const setPeriod = useCallback((p: Period | null) => {
    setPeriodState(p);
    write(PERIOD_KEY, p);
  }, []);

  // ----- availability batching -------------------------------------------------
  const watched = useRef(new Map<string, number>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestKey = periodRange && periodErrors.length === 0 ? `${periodRange.start.toISOString()}|${periodRange.end.toISOString()}` : null;
  const keyRef = useRef(requestKey);

  const flush = useCallback(async () => {
    timer.current = null;
    const key = keyRef.current;
    if (!key) return;
    const ids = [...watched.current.keys()];
    if (ids.length === 0) return;
    const [start, end] = key.split("|");
    setAvailabilityLoading(true);
    try {
      const res = await fetch(
        `/api/availability?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&ids=${ids.join(",")}`,
      );
      if (!res.ok) return;
      const json = (await res.json()) as { products: Record<string, Availability> };
      if (keyRef.current === key) setAvailability((prev) => ({ ...prev, ...json.products }));
    } finally {
      if (keyRef.current === key) setAvailabilityLoading(false);
    }
  }, []);

  const schedule = useCallback(() => {
    if (!timer.current) timer.current = setTimeout(flush, 40);
  }, [flush]);

  useEffect(() => {
    keyRef.current = requestKey;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvailability({});
    if (requestKey) schedule();
  }, [requestKey, schedule]);

  const watchAvailability = useCallback(
    (ids: string[]) => {
      let added = false;
      for (const id of ids) {
        const n = watched.current.get(id) ?? 0;
        watched.current.set(id, n + 1);
        if (n === 0) added = true;
      }
      if (added && keyRef.current) schedule();
      return () => {
        for (const id of ids) {
          const n = (watched.current.get(id) ?? 1) - 1;
          if (n <= 0) watched.current.delete(id);
          else watched.current.set(id, n);
        }
      };
    },
    [schedule],
  );

  // ----- cart --------------------------------------------------------------------
  const addToCart = useCallback((item: CartItem) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.variantId === item.variantId);
      if (existing) return prev.map((i) => (i.variantId === item.variantId ? { ...i, quantity: i.quantity + item.quantity } : i));
      return [...prev, item];
    });
    setLastAdded({ item, at: Date.now() });
  }, []);

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    setCart((prev) =>
      quantity <= 0 ? prev.filter((i) => i.variantId !== variantId) : prev.map((i) => (i.variantId === variantId ? { ...i, quantity } : i)),
    );
  }, []);

  const value: Ctx = {
    rules,
    period,
    periodRange,
    periodErrors,
    setPeriod,
    pickerOpen,
    openPicker: () => setPickerOpen(true),
    closePicker: () => setPickerOpen(false),
    cart,
    cartCount: cart.length,
    addToCart,
    setQuantity,
    removeFromCart: (variantId) => setQuantity(variantId, 0),
    clearCart: () => setCart([]),
    cartOpen,
    setCartOpen,
    lastAdded,
    availability,
    availabilityLoading,
    watchAvailability,
  };

  return <BookingContext value={value}>{children}</BookingContext>;
}

export function useBooking(): Ctx {
  const ctx = use(BookingContext);
  if (!ctx) throw new Error("useBooking must be used inside <BookingProvider>");
  return ctx;
}

/** Live availability of one product for the selected dates. */
export function useProductAvailability(productId: string): {
  state: "no-dates" | "loading" | "ready";
  total: number;
  variants: Record<string, number>;
} {
  const { watchAvailability, availability, periodRange, periodErrors } = useBooking();
  useEffect(() => watchAvailability([productId]), [productId, watchAvailability]);
  if (!periodRange || periodErrors.length > 0) return { state: "no-dates", total: 0, variants: {} };
  const a = availability[productId];
  if (!a) return { state: "loading", total: 0, variants: {} };
  return { state: "ready", total: a.total, variants: a.variants };
}
