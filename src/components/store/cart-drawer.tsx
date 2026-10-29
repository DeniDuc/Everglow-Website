"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, ShoppingBag, Trash2, X } from "lucide-react";
import { money } from "@/lib/format";
import { useBooking } from "./booking-provider";
import { QuantityStepper } from "./quantity-stepper";
import { useCartQuote } from "./use-cart-quote";

export function CartDrawer() {
  const { cart, cartOpen, setCartOpen, setQuantity, removeFromCart, periodRange, openPicker } = useBooking();
  const { data, loading } = useCartQuote({ fulfillment: "pickup", damageProtection: true, outOfTownKm: 0 });

  useEffect(() => {
    if (!cartOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCartOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [cartOpen, setCartOpen]);

  const unavailable = new Map(data?.unavailable.map((u) => [u.variantId, u.available]) ?? []);
  const estimate = cart.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);

  return (
    <AnimatePresence>
      {cartOpen && (
        <motion.div className="fixed inset-0 z-[75]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Your cart"
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-cream shadow-lift"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <div className="flex items-center justify-between border-b border-line bg-white px-5 py-4">
              <h2 className="font-display text-2xl">Your cart</h2>
              <button type="button" onClick={() => setCartOpen(false)} className="rounded-full p-2 hover:bg-sand-50" aria-label="Close cart">
                <X className="size-5" />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                <span className="flex size-16 items-center justify-center rounded-full bg-sand-100">
                  <ShoppingBag className="size-7" />
                </span>
                <p className="font-display text-2xl">Your cart is empty</p>
                <p className="text-sm text-ink-muted">Browse tents, tables, chairs and event essentials.</p>
                <Link href="/pages/catalogue" className="btn btn-primary" onClick={() => setCartOpen(false)}>
                  Browse rentals
                </Link>
              </div>
            ) : (
              <>
                <ul className="flex-1 space-y-3 overflow-y-auto p-4">
                  <AnimatePresence initial={false}>
                    {cart.map((item) => {
                      const short = unavailable.get(item.variantId);
                      return (
                        <motion.li
                          key={item.variantId}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 40 }}
                          className="flex gap-3 rounded-2xl border border-line bg-white p-3"
                        >
                          <Link href={`/products/${item.slug}`} className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-white" onClick={() => setCartOpen(false)}>
                            {item.image && <Image src={item.image} alt="" fill sizes="80px" className="object-contain p-1" />}
                          </Link>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium leading-snug">{item.name}</p>
                              <button type="button" onClick={() => removeFromCart(item.variantId)} className="rounded-full p-1 text-ink-muted hover:bg-sand-50 hover:text-danger" aria-label={`Remove ${item.name}`}>
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                            <p className="text-sm text-ink-muted">
                              {money(item.unitPriceCents)} / {item.priceLabel}
                            </p>
                            <div className="mt-2 flex items-center justify-between">
                              <QuantityStepper size="sm" value={item.quantity} onChange={(n) => setQuantity(item.variantId, n)} label={`${item.name} quantity`} />
                              <span className="font-semibold">{money(item.unitPriceCents * item.quantity)}</span>
                            </div>
                            {short !== undefined && (
                              <p className="mt-2 text-xs font-medium text-danger">
                                {short === 0 ? "Not available for your dates" : `Only ${short} available for your dates`}
                              </p>
                            )}
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
                <div className="space-y-3 border-t border-line bg-white p-5">
                  {!periodRange && (
                    <button type="button" onClick={openPicker} className="w-full rounded-2xl bg-sand-100 px-4 py-3 text-left text-sm">
                      <strong>Choose your dates</strong> to check availability and the final price.
                    </button>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-muted">Items{data ? ` · ${data.quote.days} ${data.quote.days === 1 ? "day" : "days"}` : ""}</span>
                    <span className="font-semibold">{money(data?.quote.subtotalCents ?? estimate)}</span>
                  </div>
                  {data && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink-muted">Damage Protection Plan</span>
                      <span>{money(data.quote.damageProtectionCents)}</span>
                    </div>
                  )}
                  <p className="text-xs text-ink-muted">Delivery options and the 50% deposit are shown on the next step.</p>
                  <Link href="/cart" onClick={() => setCartOpen(false)} className="btn btn-primary w-full" aria-busy={loading}>
                    Review cart & delivery
                  </Link>
                </div>
              </>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Small confirmation that slides up after "Add to cart". */
export function AddedToast() {
  const { lastAdded, setCartOpen } = useBooking();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!lastAdded) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3200);
    return () => clearTimeout(t);
  }, [lastAdded]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[65] flex justify-center px-4">
      <AnimatePresence>
        {visible && lastAdded && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            className="pointer-events-auto flex items-center gap-3 rounded-full bg-ink py-2 pl-4 pr-2 text-sm text-cream shadow-lift"
          >
            <CheckCircle2 className="size-5 text-gold-300" />
            <span>
              Added <strong>{lastAdded.item.quantity} × {lastAdded.item.name}</strong>
            </span>
            <button type="button" className="rounded-full bg-cream px-3 py-1.5 font-semibold text-ink" onClick={() => setCartOpen(true)}>
              View cart
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
