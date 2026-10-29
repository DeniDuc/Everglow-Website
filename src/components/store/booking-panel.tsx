"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, Check, Info, ShoppingBag, Truck } from "lucide-react";
import { formatLocal, money } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useBooking, useProductAvailability } from "./booking-provider";
import { QuantityStepper } from "./quantity-stepper";

type Variant = { id: string; name: string; options: string[]; priceCents: number };

/** Product page purchase box: variant, dates, live availability, quantity and add to cart. */
export function BookingPanel({
  product,
  deliveryFromCents,
  depositPercent,
  damageProtectionPercent,
}: {
  deliveryFromCents: number | null;
  depositPercent: number;
  damageProtectionPercent: number;
  product: {
    id: string;
    slug: string;
    name: string;
    priceLabel: string;
    requiresDelivery: boolean;
    image: string | null;
    variants: Variant[];
  };
}) {
  const { periodRange, periodErrors, openPicker, addToCart, cart } = useBooking();
  const availability = useProductAvailability(product.id);
  const [variantId, setVariantId] = useState(product.variants[0]?.id);
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);

  // Mobile: keep an "Add to cart" bar on screen once the main button scrolls away.
  useEffect(() => {
    const el = buttonRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShowBar(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  if (!variant) return null;
  const inCart = cart.find((c) => c.variantId === variant.id)?.quantity ?? 0;
  const free = availability.state === "ready" ? Math.max(0, (availability.variants[variant.id] ?? availability.total) - inCart) : null;
  const tooMany = free !== null && quantity > free;
  const multi = product.variants.length > 1;

  function add() {
    addToCart({
      productId: product.id,
      variantId: variant.id,
      slug: product.slug,
      name: multi ? variant.name : product.name,
      variantName: multi ? variant.options.join(" / ") || variant.name : null,
      image: product.image,
      unitPriceCents: variant.priceCents,
      priceLabel: product.priceLabel,
      requiresDelivery: product.requiresDelivery,
      quantity,
    });
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1800);
  }

  return (
    <div className="space-y-5">
      <p className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold text-gold-700">{money(variant.priceCents)}</span>
        <span className="text-ink-muted">/ {product.priceLabel}</span>
      </p>

      {multi && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Choose an option</legend>
          <div className="flex flex-wrap gap-2">
            {product.variants.map((v) => {
              const label = v.options.join(" / ") || v.name;
              const left = availability.state === "ready" ? (availability.variants[v.id] ?? 0) : null;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariantId(v.id)}
                  aria-pressed={v.id === variant.id}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition",
                    v.id === variant.id ? "border-ink bg-ink text-cream" : "border-line bg-white hover:border-gold-300",
                    left === 0 && "opacity-50",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <button type="button" onClick={openPicker} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-4 text-left transition hover:border-gold-300 hover:shadow-soft">
        <CalendarDays className="size-5 shrink-0 text-gold-700" />
        <span className="min-w-0 flex-1 text-sm">
          {periodRange ? (
            <>
              <span className="block font-semibold">
                {formatLocal(periodRange.start, "MMM d, h:mm a")} → {formatLocal(periodRange.end, "MMM d, h:mm a")}
              </span>
              <span className="text-ink-muted">Change dates</span>
            </>
          ) : (
            <>
              <span className="block font-semibold">Check availability</span>
              <span className="text-ink-muted">Pick your rental dates</span>
            </>
          )}
        </span>
        <AnimatePresence mode="wait">
          {availability.state === "ready" && (
            <motion.span
              key={free}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("rounded-full px-3 py-1 text-xs font-semibold", free === 0 ? "bg-danger/10 text-danger" : "bg-success/10 text-success")}
            >
              {free === 0 ? "Booked" : `${free} available`}
            </motion.span>
          )}
          {availability.state === "loading" && <span className="skeleton h-6 w-20 rounded-full" />}
        </AnimatePresence>
      </button>
      {periodRange && periodErrors.length > 0 && <p className="text-sm text-danger">Please choose other dates — these are outside our booking rules.</p>}

      <div className="flex gap-3" ref={buttonRef}>
        <QuantityStepper value={quantity} onChange={setQuantity} max={free !== null && free > 0 ? free : undefined} />
        <button type="button" onClick={add} disabled={free === 0 || tooMany} className="btn btn-primary h-12 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            {justAdded ? (
              <motion.span key="ok" className="flex items-center gap-2" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                <Check className="size-4" /> Added
              </motion.span>
            ) : (
              <motion.span key="add" className="flex items-center gap-2" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                <ShoppingBag className="size-4" /> Add to cart<span className="hidden sm:inline"> · {money(variant.priceCents * quantity)}</span>
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
      {tooMany && <p className="text-sm text-danger">Only {free} available for your dates.</p>}
      {inCart > 0 && <p className="text-sm text-ink-muted">{inCart} already in your cart.</p>}

      <AnimatePresence>
        {showBar && (
          <motion.div
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line bg-white/90 px-4 py-3 backdrop-blur-xl md:hidden"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{multi ? variant.name : product.name}</p>
              <p className="text-sm text-gold-700">
                {money(variant.priceCents)} <span className="text-ink-muted">/ {product.priceLabel}</span>
              </p>
            </div>
            <button type="button" onClick={add} disabled={free === 0 || tooMany} className="btn btn-primary">
              {justAdded ? <Check className="size-4" /> : <ShoppingBag className="size-4" />} {justAdded ? "Added" : "Add"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <ul className="space-y-2 rounded-2xl bg-sand-50 p-4 text-sm text-ink-soft">
        {product.requiresDelivery ? (
          <li className="flex gap-2">
            <Truck className="mt-0.5 size-4 shrink-0 text-gold-700" />
            <span>
              <strong className="text-ink">Delivery & installation required.</strong> This item can&apos;t be picked up; delivery is added at checkout.
            </span>
          </li>
        ) : (
          <li className="flex gap-2">
            <Truck className="mt-0.5 size-4 shrink-0 text-gold-700" />
            <span>Free self-pickup{deliveryFromCents ? `, or delivery from ${money(deliveryFromCents)}` : ""}.</span>
          </li>
        )}
        <li className="flex gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-gold-700" />
          <span>
            One price {product.priceLabel}. {depositPercent}% deposit to book; {damageProtectionPercent}% damage protection added unless declined.
          </span>
        </li>
      </ul>
    </div>
  );
}
