import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import * as s from "@/db/schema";
import { releaseStock, reserveStock, variantAvailability } from "@/lib/availability/db";
import {
  bundleAvailability,
  localParts,
  validatePeriod,
  zonedDateTime,
  type PeriodError,
} from "@/lib/availability/engine";
import { randomToken } from "@/lib/crypto";
import {
  cancellationOutcome,
  computeQuote,
  suggestDeliveryTier,
  type PriceType,
  type Quote,
  type QuoteLineInput,
} from "@/lib/pricing";
import { loadSettings } from "@/lib/settings";
import { quoteRules, type Settings } from "@/lib/settings-schema";
import type { OrderDraft, OrderLineInput, PaymentInput } from "./schema";
import { canTransition, holdsStock, isEditable, type OrderStatus } from "./status";

/**
 * Admin orders on top of the pricing and availability engines. Every function takes a
 * connection so callers decide the transaction; writes must run inside one (stock locking).
 */

type Conn = Db | Tx;

export class OrderError extends Error {
  constructor(
    public code: "not_found" | "locked" | "dates" | "transition",
    message: string,
  ) {
    super(message);
    this.name = "OrderError";
  }
}

export type CatalogVariant = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  productType: "rental" | "service" | "bundle";
  /** Items without stock (services, fees) never block or reserve anything. */
  tracked: boolean;
  priceType: PriceType;
  basePriceCents: number;
  periodDays: number;
  extraDayPriceCents: number | null;
  damageProtection: boolean;
  requiresDelivery: boolean;
  deliveryPoints: number;
  minDeliveryTier: string | null;
  showInStore: boolean;
  components: { variantId: string; quantity: number }[];
};

/** Every active variant staff can put on an order, hidden ones (fees, walls) included. */
export async function loadCatalog(conn: Conn): Promise<CatalogVariant[]> {
  const rows = await conn
    .select({ v: s.productVariants, p: s.products })
    .from(s.productVariants)
    .innerJoin(s.products, eq(s.products.id, s.productVariants.productId))
    .where(and(isNull(s.productVariants.archivedAt), isNull(s.products.archivedAt)))
    .orderBy(asc(s.products.sortingWeight), asc(s.products.name), asc(s.productVariants.position));
  const bundleIds = rows.filter((r) => r.p.productType === "bundle").map((r) => r.p.id);
  const parts = bundleIds.length
    ? await conn.select().from(s.bundleItems).where(inArray(s.bundleItems.bundleId, bundleIds))
    : [];
  return rows.map(({ v, p }) => ({
    variantId: v.id,
    productId: p.id,
    productName: p.name,
    variantName: v.name,
    productType: p.productType,
    tracked: p.productType !== "service" && p.trackingType !== "none",
    priceType: p.priceType,
    basePriceCents: v.basePriceCents,
    periodDays: p.periodDays,
    extraDayPriceCents: p.extraDayPriceCents,
    damageProtection: p.productType !== "service" && p.damageProtection,
    requiresDelivery: p.requiresDelivery,
    deliveryPoints: p.deliveryPoints,
    minDeliveryTier: p.minDeliveryTier,
    showInStore: p.showInStore,
    components: parts.filter((c) => c.bundleId === p.id).map((c) => ({ variantId: c.variantId, quantity: c.quantity })),
  }));
}

export type PricedDraft = {
  startsAt: Date;
  endsAt: Date;
  quote: Quote;
  /** Chosen delivery tier (null for pickup). */
  tier: { id: string; name: string; priceCents: number } | null;
  suggestedTierId: string | null;
  requiresDelivery: boolean;
  /** Free units per catalogue variant for the period, this order's own claims excluded; null = not tracked. */
  available: Record<string, number | null>;
  shortages: { variantId: string; title: string; requested: number; available: number }[];
  /** Customer-facing booking rules this period breaks (staff may still book). */
  periodWarnings: PeriodError[];
  /** Stock claims after expanding bundles; untracked items left out. */
  reservationItems: { variantId: string; quantity: number }[];
  unknownVariantIds: string[];
};

export async function priceDraft(
  conn: Conn,
  draft: OrderDraft,
  opts: {
    /** Current time for availability (expired holds) and booking-rule warnings. */
    now: Date;
    /** Booking moment for the rush rule: the order's creation time, so edits don't change the deposit. */
    bookedAt: Date;
    orderId?: string;
    settings?: Settings;
    catalog?: CatalogVariant[];
  },
): Promise<PricedDraft> {
  const settings = opts.settings ?? (await loadSettings(conn));
  const tz = settings.business.timezone;
  const startsAt = zonedDateTime(draft.startDate, draft.startTime, tz);
  const endsAt = zonedDateTime(draft.endDate, draft.endTime, tz);
  const catalog = opts.catalog ?? (await loadCatalog(conn));
  const byId = new Map(catalog.map((c) => [c.variantId, c]));

  const trackedIds = [
    ...new Set(catalog.flatMap((c) => (c.components.length ? c.components.map((x) => x.variantId) : [c.variantId]))),
  ].filter((id) => byId.get(id)?.tracked ?? true);
  const free =
    endsAt > startsAt
      ? await variantAvailability(conn, trackedIds, startsAt, endsAt, {
          now: opts.now,
          defaultBufferAfter: settings.booking.defaultBufferAfterMinutes,
          excludeOrderId: opts.orderId,
        })
      : new Map<string, number>();
  const available: Record<string, number | null> = {};
  for (const c of catalog) {
    if (c.components.length)
      available[c.variantId] = bundleAvailability(
        c.components.map((x) => ({ available: Math.max(0, free.get(x.variantId) ?? 0), perBundle: x.quantity })),
      );
    else available[c.variantId] = c.tracked ? Math.max(0, free.get(c.variantId) ?? 0) : null;
  }

  const unknownVariantIds: string[] = [];
  const quoteLines: QuoteLineInput[] = [];
  const requested = new Map<string, number>();
  const claims = new Map<string, number>();
  draft.lines.forEach((l, i) => {
    const key = String(i);
    if (l.kind === "custom") {
      quoteLines.push({
        key,
        title: l.title,
        kind: "custom",
        quantity: l.quantity,
        rule: { priceType: "fixed", basePriceCents: l.unitCents ?? 0, periodDays: 1, extraDayPriceCents: null },
        damageProtection: false,
        discountable: false,
      });
      return;
    }
    const v = l.variantId ? byId.get(l.variantId) : undefined;
    if (!v) {
      if (l.variantId) unknownVariantIds.push(l.variantId);
      return;
    }
    quoteLines.push({
      key,
      title: l.title || v.variantName,
      kind: v.productType === "service" ? "service" : "product",
      quantity: l.quantity,
      rule: {
        priceType: v.priceType,
        basePriceCents: v.basePriceCents,
        periodDays: v.periodDays,
        extraDayPriceCents: v.extraDayPriceCents,
      },
      overrideUnitCents: l.unitCents,
      damageProtection: v.damageProtection,
    });
    requested.set(v.variantId, (requested.get(v.variantId) ?? 0) + l.quantity);
    for (const part of v.components.length ? v.components : v.tracked ? [{ variantId: v.variantId, quantity: 1 }] : [])
      claims.set(part.variantId, (claims.get(part.variantId) ?? 0) + part.quantity * l.quantity);
  });

  const shortages = [...requested.entries()]
    .map(([variantId, n]) => ({
      variantId,
      title: byId.get(variantId)!.variantName,
      requested: n,
      available: available[variantId],
    }))
    .filter((x): x is typeof x & { available: number } => x.available != null && x.requested > x.available);

  const tiers = await conn
    .select()
    .from(s.deliveryTiers)
    .where(eq(s.deliveryTiers.active, true))
    .orderBy(asc(s.deliveryTiers.position));
  const suggested = suggestDeliveryTier(
    [...requested.entries()].map(([id, quantity]) => {
      const v = byId.get(id)!;
      return { points: v.deliveryPoints, quantity, minTierCode: v.minDeliveryTier };
    }),
    tiers,
  );
  const chosen =
    draft.fulfillment === "delivery"
      ? (tiers.find((t) => t.id === draft.deliveryTierId) ?? (suggested && tiers.find((t) => t.id === suggested.id)))
      : null;

  const activeTaxes = settings.pricing.taxesEnabled
    ? await conn.select().from(s.taxRates).where(eq(s.taxRates.active, true))
    : [];
  const quote = computeQuote({
    lines: quoteLines,
    startsAt,
    endsAt,
    now: opts.bookedAt,
    timezone: tz,
    delivery: chosen
      ? { method: "delivery", tierPriceCents: chosen.priceCents, outOfTownKm: draft.outOfTownKm }
      : { method: "pickup" },
    damageProtection: draft.damageProtection,
    discountBp: draft.discountBp,
    taxRates: activeTaxes.map((t) => ({ name: t.name, rateBp: t.rateBp })),
    pricesIncludeTax: settings.pricing.pricesIncludeTax,
    rules: quoteRules(settings),
  });

  const blackouts = (await conn.select({ date: s.blackoutDates.date }).from(s.blackoutDates)).map((b) => b.date);
  const periodWarnings = validatePeriod(startsAt, endsAt, opts.now, {
    timezone: tz,
    minNoticeHours: 0,
    maxAdvanceDays: settings.booking.maxAdvanceDays,
    openTime: settings.booking.openTime,
    closeTime: settings.booking.closeTime,
    blackoutDates: blackouts,
  });

  return {
    startsAt,
    endsAt,
    quote,
    tier: chosen ? { id: chosen.id, name: chosen.name, priceCents: chosen.priceCents } : null,
    suggestedTierId: suggested?.id ?? null,
    requiresDelivery: [...requested.keys()].some((id) => byId.get(id)!.requiresDelivery),
    available,
    shortages,
    periodWarnings,
    reservationItems: [...claims.entries()].map(([variantId, quantity]) => ({ variantId, quantity })),
    unknownVariantIds,
  };
}

type OrderRow = typeof s.orders.$inferSelect;
type LineRow = typeof s.orderLines.$inferSelect;

/** The editable form of a stored order. Computed lines (delivery, discount, protection, taxes) are left out. */
export function draftFromOrder(o: OrderRow, lines: LineRow[], timezone: string): OrderDraft {
  const start = localParts(o.startsAt, timezone);
  const end = localParts(o.endsAt, timezone);
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const items = lines
    .filter((l) => ["product", "bundle", "service", "custom"].includes(l.kind))
    .sort((a, b) => a.position - b.position);
  return {
    customerId: o.customerId,
    startDate: start.date,
    startTime: hhmm(start.minutes),
    endDate: end.date,
    endTime: hhmm(end.minutes),
    fulfillment: o.fulfillment,
    deliveryTierId: o.deliveryTierOverridden ? o.deliveryTierId : null,
    outOfTownKm: o.outOfTownKm,
    deliveryAddress: o.deliveryAddress ?? "",
    deliveryNotes: o.deliveryNotes ?? "",
    damageProtection: o.damageProtection,
    discountBp: o.discountBp,
    internalNotes: o.internalNotes ?? "",
    lines: items.map((l): OrderLineInput => {
      const custom = l.kind === "custom" || !l.variantId;
      return {
        kind: custom ? "custom" : l.kind === "service" ? "service" : "product",
        variantId: custom ? null : l.variantId,
        title: l.title,
        quantity: l.quantity,
        unitCents: custom ? l.unitPriceCents : l.overrideUnitPriceCents,
        overrideReason: l.overrideReason ?? "",
      };
    }),
  };
}

const pct = (bp: number) => `${Number((bp / 100).toFixed(2))}%`;

/**
 * Create or update an order from a draft: lines and totals are recomputed, and stock is
 * claimed (or released) according to the status. Throws ShortageError unless `allowOverbook`.
 */
export async function saveOrder(
  tx: Tx,
  input: {
    orderId?: string;
    draft: OrderDraft;
    /** Status of a new order (ignored when updating). */
    status?: OrderStatus;
    actorId: string | null;
    allowOverbook?: boolean;
    source?: (typeof s.customerSource.enumValues)[number];
    now?: Date;
  },
): Promise<{ id: string; number: number; overbooked: boolean }> {
  const now = input.now ?? new Date();
  const settings = await loadSettings(tx);
  const existing = input.orderId
    ? (await tx.select().from(s.orders).where(eq(s.orders.id, input.orderId)).for("update"))[0]
    : undefined;
  if (input.orderId && !existing) throw new OrderError("not_found", "Order not found");
  if (existing && !isEditable(existing.status))
    throw new OrderError("locked", "Items and dates can't change after the order went out.");
  const status = existing?.status ?? input.status ?? "draft";
  const d = input.draft;

  const priced = await priceDraft(tx, d, {
    now,
    bookedAt: existing?.createdAt ?? now,
    orderId: existing?.id,
    settings,
  });
  if (priced.endsAt <= priced.startsAt) throw new OrderError("dates", "The return must be after the pickup.");
  const q = priced.quote;

  const values = {
    customerId: d.customerId,
    startsAt: priced.startsAt,
    endsAt: priced.endsAt,
    fulfillment: d.fulfillment,
    deliveryTierId: priced.tier?.id ?? null,
    deliveryTierOverridden: d.fulfillment === "delivery" && d.deliveryTierId != null,
    outOfTownKm: d.fulfillment === "delivery" ? d.outOfTownKm : 0,
    deliveryAddress: d.deliveryAddress || null,
    deliveryNotes: d.deliveryNotes || null,
    damageProtection: d.damageProtection,
    discountBp: d.discountBp,
    internalNotes: d.internalNotes || null,
    subtotalCents: q.subtotalCents,
    totalCents: q.totalCents,
    depositDueCents: q.depositCents,
  };
  const [order] = existing
    ? await tx.update(s.orders).set(values).where(eq(s.orders.id, existing.id)).returning()
    : await tx
        .insert(s.orders)
        .values({
          ...values,
          status,
          source: input.source ?? "phone",
          publicToken: randomToken(24),
          createdById: input.actorId,
        })
        .returning();

  const catalogLines = new Map(q.lines.map((l) => [l.key, l]));
  const rows: (typeof s.orderLines.$inferInsert)[] = [];
  d.lines.forEach((l, i) => {
    const priced = catalogLines.get(String(i));
    if (!priced) return;
    const variant = l.kind === "custom" ? null : l.variantId;
    rows.push({
      orderId: order.id,
      kind: l.kind,
      productId: null,
      variantId: variant,
      title: priced.title,
      quantity: priced.quantity,
      unitPriceCents: priced.unitCents,
      overrideUnitPriceCents: l.kind !== "custom" && priced.overridden ? priced.unitCents : null,
      overrideReason: l.kind !== "custom" && priced.overridden ? l.overrideReason || null : null,
      totalCents: priced.totalCents,
    });
  });
  const fixed = (kind: "delivery" | "discount" | "fee", title: string, cents: number) =>
    rows.push({ orderId: order.id, kind, title, quantity: 1, unitPriceCents: cents, totalCents: cents });
  if (priced.tier) fixed("delivery", priced.tier.name, priced.tier.priceCents);
  if (q.deliveryKmCents) fixed("delivery", `Out-of-town delivery (${values.outOfTownKm} km)`, q.deliveryKmCents);
  if (q.discountCents) fixed("discount", `Discount ${pct(d.discountBp)}`, -q.discountCents);
  if (q.damageProtectionCents)
    fixed("fee", `Damage Protection Plan ${pct(settings.pricing.damageProtectionBp)}`, q.damageProtectionCents);
  for (const t of q.taxes) if (t.cents) fixed("fee", t.name, t.cents);

  // Product ids for catalogue lines (reports and packing slips group by product).
  const variantIds = rows.map((r) => r.variantId).filter((v): v is string => Boolean(v));
  if (variantIds.length) {
    const owners = await tx
      .select({ id: s.productVariants.id, productId: s.productVariants.productId })
      .from(s.productVariants)
      .where(inArray(s.productVariants.id, variantIds));
    const productOf = new Map(owners.map((o) => [o.id, o.productId]));
    for (const r of rows) if (r.variantId) r.productId = productOf.get(r.variantId) ?? null;
  }

  await tx.delete(s.orderLines).where(eq(s.orderLines.orderId, order.id));
  if (rows.length) await tx.insert(s.orderLines).values(rows.map((r, position) => ({ ...r, position })));

  let overbooked = false;
  if (holdsStock(status, settings.booking.quotesHoldStock)) {
    const res = await reserveStock(tx, {
      orderId: order.id,
      items: priced.reservationItems,
      startsAt: priced.startsAt,
      endsAt: priced.endsAt,
      status: "reserved",
      now,
      defaultBufferAfter: settings.booking.defaultBufferAfterMinutes,
      allowOverbook: input.allowOverbook,
    });
    overbooked = res.overbooked.length > 0;
  } else {
    await releaseStock(tx, { orderId: order.id });
  }
  if (overbooked !== order.overbooked) await tx.update(s.orders).set({ overbooked }).where(eq(s.orders.id, order.id));

  return { id: order.id, number: order.number, overbooked };
}

/** Move an order through its lifecycle, claiming or releasing stock as needed. */
export async function changeOrderStatus(
  tx: Tx,
  input: {
    orderId: string;
    to: OrderStatus;
    actorId: string | null;
    /** Recorded when the order goes out (ID checked at handover). */
    idChecked?: boolean;
    allowOverbook?: boolean;
    now?: Date;
  },
): Promise<{ from: OrderStatus; to: OrderStatus; overbooked: boolean }> {
  const now = input.now ?? new Date();
  const [o] = await tx.select().from(s.orders).where(eq(s.orders.id, input.orderId)).for("update");
  if (!o) throw new OrderError("not_found", "Order not found");
  if (!canTransition(o.status, input.to))
    throw new OrderError("transition", `An order can't go from ${o.status} to ${input.to}.`);
  const settings = await loadSettings(tx);
  const wasHolding = holdsStock(o.status, settings.booking.quotesHoldStock);
  const willHold = holdsStock(input.to, settings.booking.quotesHoldStock);

  let overbooked = o.overbooked;
  if (willHold && !wasHolding) {
    const lines = await tx.select().from(s.orderLines).where(eq(s.orderLines.orderId, o.id));
    const priced = await priceDraft(tx, draftFromOrder(o, lines, settings.business.timezone), {
      now,
      bookedAt: o.createdAt,
      orderId: o.id,
      settings,
    });
    const res = await reserveStock(tx, {
      orderId: o.id,
      items: priced.reservationItems,
      startsAt: o.startsAt,
      endsAt: o.endsAt,
      status: "reserved",
      now,
      defaultBufferAfter: settings.booking.defaultBufferAfterMinutes,
      allowOverbook: input.allowOverbook,
    });
    overbooked = res.overbooked.length > 0;
  } else if (!willHold && wasHolding) {
    await releaseStock(tx, { orderId: o.id });
    overbooked = false;
  }

  await tx
    .update(s.orders)
    .set({
      status: input.to,
      overbooked,
      cancelledAt: input.to === "cancelled" ? now : o.status === "cancelled" ? null : o.cancelledAt,
      ...(input.to === "out" && input.idChecked ? { idCheckedAt: now, idCheckedById: input.actorId } : {}),
    })
    .where(eq(s.orders.id, o.id));
  return { from: o.status, to: input.to, overbooked };
}

/** What Terms section 13 gives the customer if the order is cancelled now (staff confirm). */
export function cancellationPreview(
  o: Pick<OrderRow, "paidCents" | "totalCents" | "startsAt">,
  settings: Settings,
  now: Date,
) {
  return cancellationOutcome({
    paidCents: o.paidCents,
    totalCents: o.totalCents,
    startsAt: o.startsAt,
    cancelledAt: now,
    tiers: settings.cancellation.tiers,
    nonRefundableBp: settings.payments.nonRefundableBp,
  });
}

/** Keep orders.paid_cents equal to payments minus refunds. */
export async function recomputePaid(conn: Conn, orderId: string): Promise<number> {
  const [row] = await conn
    .update(s.orders)
    .set({
      paidCents: sql`(select coalesce(sum(case when ${s.payments.kind} = 'refund' then -${s.payments.amountCents} else ${s.payments.amountCents} end), 0)::int from ${s.payments} where ${s.payments.orderId} = ${orderId})`,
    })
    .where(eq(s.orders.id, orderId))
    .returning({ paid: s.orders.paidCents });
  return row?.paid ?? 0;
}

export async function recordPayment(
  tx: Tx,
  input: { orderId: string; payment: PaymentInput; actorId: string | null; timezone: string },
) {
  const p = input.payment;
  const [row] = await tx
    .insert(s.payments)
    .values({
      orderId: input.orderId,
      kind: p.kind,
      method: p.method,
      amountCents: p.amountCents,
      reference: p.reference || null,
      receivedAt: zonedDateTime(p.receivedDate, "12:00", input.timezone),
      recordedById: input.actorId,
    })
    .returning();
  const paidCents = await recomputePaid(tx, input.orderId);
  return { payment: row, paidCents };
}

export async function deletePayment(tx: Tx, paymentId: string) {
  const [row] = await tx.delete(s.payments).where(eq(s.payments.id, paymentId)).returning();
  if (!row) return null;
  await recomputePaid(tx, row.orderId);
  return row;
}
