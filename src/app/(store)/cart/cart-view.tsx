"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  CalendarDays,
  Info,
  Loader2,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Trash2,
  Truck,
} from "lucide-react";
import { useBooking } from "@/components/store/booking-provider";
import { QuantityStepper } from "@/components/store/quantity-stepper";
import { useCartQuote } from "@/components/store/use-cart-quote";
import { periodErrorMessages } from "@/lib/availability/engine";
import { formatLocal, money } from "@/lib/format";
import { cn } from "@/lib/cn";

export function CartView({ perKmCents, phone }: { perKmCents: number; phone: string }) {
  const { cart, setQuantity, removeFromCart, periodRange, periodErrors, openPicker } = useBooking();
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [damageProtection, setDamageProtection] = useState(true);
  const [outOfTown, setOutOfTown] = useState(false);
  const [km, setKm] = useState(0);
  const { data, loading, error } = useCartQuote({ fulfillment, damageProtection, outOfTownKm: outOfTown ? km : 0 });

  const mustDeliver = cart.some((i) => i.requiresDelivery);
  const method = mustDeliver ? "delivery" : fulfillment;
  const unavailable = new Map(data?.unavailable.map((u) => [u.variantId, u.available]) ?? []);
  const q = data?.quote;

  if (cart.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="font-display text-3xl">Your cart is empty</p>
        <p className="mt-3 text-ink-muted">Pick your dates and add tents, tables, chairs or lawn games.</p>
        <Link href="/pages/catalogue" className="btn btn-primary mt-6">
          Browse the catalogue
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        <button
          type="button"
          onClick={openPicker}
          className="flex w-full items-center gap-4 rounded-3xl border border-line bg-white p-5 text-left transition hover:shadow-soft"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-sand-100">
            <CalendarDays className="size-5" />
          </span>
          <span className="flex-1">
            {periodRange ? (
              <>
                <span className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Rental period{q ? ` · ${q.days} ${q.days === 1 ? "day" : "days"}` : ""}
                </span>
                <span className="font-semibold">
                  {formatLocal(periodRange.start, "EEE, MMM d · h:mm a")} →{" "}
                  {formatLocal(periodRange.end, "EEE, MMM d · h:mm a")}
                </span>
              </>
            ) : (
              <span className="font-semibold">Choose your rental dates to see availability and totals</span>
            )}
          </span>
          <span className="text-sm font-medium text-gold-700">{periodRange ? "Change" : "Choose"}</span>
        </button>
        {periodErrors.length > 0 && <p className="text-sm text-danger">{periodErrorMessages[periodErrors[0]]}</p>}

        <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-white">
          <AnimatePresence initial={false}>
            {cart.map((item) => {
              const short = unavailable.get(item.variantId);
              const line = q?.lines.find((l) => l.key === item.variantId);
              return (
                <motion.li
                  key={item.variantId}
                  layout
                  exit={{ opacity: 0, height: 0 }}
                  className="flex gap-4 p-4 sm:p-5"
                >
                  <Link
                    href={`/products/${item.slug}`}
                    className="relative size-20 shrink-0 overflow-hidden rounded-2xl border border-line bg-white sm:size-24"
                  >
                    {item.image && <Image src={item.image} alt="" fill sizes="96px" className="object-contain p-1" />}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link href={`/products/${item.slug}`} className="font-medium hover:text-gold-700">
                          {item.name}
                        </Link>
                        <p className="text-sm text-ink-muted">
                          {money(line?.unitCents ?? item.unitPriceCents)} each
                          {line && line.unitCents !== item.unitPriceCents
                            ? ` for ${q?.days} days`
                            : ` / ${item.priceLabel}`}
                        </p>
                        {item.requiresDelivery && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-slate">
                            <Truck className="size-3.5" /> Delivery & installation required
                          </p>
                        )}
                      </div>
                      <p className="font-semibold">{money(line?.totalCents ?? item.unitPriceCents * item.quantity)}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <QuantityStepper
                        size="sm"
                        value={item.quantity}
                        onChange={(n) => setQuantity(item.variantId, n)}
                        label={`${item.name} quantity`}
                      />
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.variantId)}
                        className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-ink-muted hover:bg-sand-50 hover:text-danger"
                      >
                        <Trash2 className="size-4" /> Remove
                      </button>
                    </div>
                    {short !== undefined && (
                      <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-danger">
                        <AlertTriangle className="size-4" />
                        {short === 0 ? "Not available for these dates" : `Only ${short} available for these dates`}
                      </p>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>

        <fieldset className="rounded-3xl border border-line bg-white p-5">
          <legend className="sr-only">Pickup or delivery</legend>
          <p className="mb-3 font-semibold">How would you like to get your rentals?</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  value: "pickup",
                  icon: PackageCheck,
                  title: "Self pickup & return",
                  text: "Free · 43 Jim Smith Dr, Winnipeg",
                  disabled: mustDeliver,
                },
                {
                  value: "delivery",
                  icon: Truck,
                  title: "Delivery & pickup",
                  text: data?.deliveryTier
                    ? `${data.deliveryTier.name} · ${money(data.deliveryTier.priceCents)}`
                    : "Priced by order size",
                  disabled: false,
                },
              ] as const
            ).map((o) => (
              <label
                key={o.value}
                className={cn(
                  "relative flex cursor-pointer gap-3 rounded-2xl border p-4 transition",
                  method === o.value ? "border-ink bg-sand-50" : "border-line hover:border-gold-300",
                  o.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="radio"
                  name="fulfillment"
                  value={o.value}
                  checked={method === o.value}
                  disabled={o.disabled}
                  onChange={() => setFulfillment(o.value)}
                  className="sr-only"
                />
                <o.icon className="mt-0.5 size-5 shrink-0 text-gold-700" />
                <span>
                  <span className="block font-medium">{o.title}</span>
                  <span className="text-sm text-ink-muted">{o.text}</span>
                </span>
              </label>
            ))}
          </div>
          {mustDeliver && (
            <p className="mt-3 text-sm text-ink-muted">
              Tents 20′×20′ and larger can&apos;t be picked up — our team delivers and installs them.
            </p>
          )}
          {method === "delivery" && (
            <div className="mt-4 space-y-3 rounded-2xl bg-sand-50 p-4 text-sm">
              {data?.deliveryTier?.description && <p className="text-ink-soft">{data.deliveryTier.description}</p>}
              <p className="flex gap-2 text-ink-soft">
                <Info className="mt-0.5 size-4 shrink-0" /> Curbside delivery within Winnipeg. We contact you the Sunday
                before your event with exact delivery times.
              </p>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={outOfTown}
                  onChange={(e) => setOutOfTown(e.target.checked)}
                  className="size-4 accent-ink"
                />
                <MapPin className="size-4" /> My event is outside Winnipeg city limits
              </label>
              {outOfTown && (
                <label className="flex flex-wrap items-center gap-2">
                  Approx. km outside the city
                  <input
                    type="number"
                    min={0}
                    max={500}
                    value={km}
                    onChange={(e) => setKm(Math.max(0, Number(e.target.value) || 0))}
                    className="h-10 w-24 rounded-xl border border-line bg-white px-3"
                  />
                  <span className="text-ink-muted">
                    × {money(perKmCents)}/km — we confirm the distance before charging.
                  </span>
                </label>
              )}
            </div>
          )}
        </fieldset>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-3xl border border-line bg-white p-6 shadow-soft">
          <h2 className="font-display text-2xl">Summary</h2>
          {!periodRange ? (
            <p className="mt-4 text-sm text-ink-muted">Choose your dates to see the total.</p>
          ) : (
            <dl className={cn("mt-4 space-y-2.5 text-[0.95rem] transition-opacity", loading && "opacity-60")}>
              <Row
                label={`Items${q ? ` · ${q.days} ${q.days === 1 ? "day" : "days"}` : ""}`}
                value={q ? money(q.subtotalCents) : "…"}
              />
              <div className="flex items-start justify-between gap-3">
                <dt>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={damageProtection}
                      onChange={(e) => setDamageProtection(e.target.checked)}
                      className="size-4 accent-ink"
                    />
                    <ShieldCheck className="size-4 text-gold-700" /> Damage Protection Plan
                  </label>
                </dt>
                <dd>{q ? money(q.damageProtectionCents) : "…"}</dd>
              </div>
              <p className="pl-6 text-xs leading-relaxed text-ink-muted">
                Covers the first $100 of damage and 50% of the rest. Not insurance — see the FAQ for what isn&apos;t
                covered. Untick to decline; you&apos;ll then be responsible for the full repair or replacement cost.
              </p>
              {method === "delivery" && (
                <Row
                  label={`Delivery${q && q.deliveryKmCents ? " incl. km" : ""}`}
                  value={q ? money(q.deliveryCents) : "…"}
                />
              )}
              {q?.taxes.map((t) => (
                <Row key={t.name} label={t.name} value={money(t.cents)} />
              ))}
              <div className="my-3 border-t border-line" />
              <Row
                label={<strong>Total</strong>}
                value={<strong className="text-lg">{q ? money(q.totalCents) : "…"}</strong>}
              />
              {q && (
                <div className="mt-4 space-y-2 rounded-2xl bg-sand-50 p-4 text-sm">
                  <Row
                    label={
                      <strong>{q.rush ? "Due now (full payment)" : `Deposit due now (${q.depositBp / 100}%)`}</strong>
                    }
                    value={<strong>{money(q.depositCents)}</strong>}
                  />
                  {q.balanceCents > 0 && q.balanceDueAt && (
                    <Row
                      label={`Balance due ${formatLocal(q.balanceDueAt, "MMM d, yyyy")}`}
                      value={money(q.balanceCents)}
                    />
                  )}
                  {q.rush && (
                    <p className="text-xs text-ink-muted">
                      Your event is less than 14 days away, so full payment is required to book.
                    </p>
                  )}
                  <p className="text-xs text-ink-muted">25% of the order total is non-refundable once booked.</p>
                </div>
              )}
            </dl>
          )}
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <button type="button" disabled className="btn btn-primary mt-6 w-full">
            {loading ? <Loader2 className="size-4 animate-spin" /> : null} Secure checkout — coming soon
          </button>
          <p className="mt-3 text-center text-xs text-ink-muted">
            Online payment is being set up. To book now, call{" "}
            <a className="font-semibold text-ink underline" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
              {phone}
            </a>
            .
          </p>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
